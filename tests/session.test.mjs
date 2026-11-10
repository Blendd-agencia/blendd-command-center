import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import handler from '../api/auth.mjs';
import {accessRemaining,identify} from '../lib/supabase.mjs';
const email='test@example.com';
const jwt=(iat=Math.floor(Date.now()/1000),exp=iat+3600)=>'header.'+Buffer.from(JSON.stringify({iat,exp})).toString('base64url')+'.signature';
function res(){return{headers:{},setHeader(k,v){this.headers[k]=v;},getHeader(k){return this.headers[k];},status(code){this.code=code;return this;},json(data){this.data=data;}};}
const origin='https://cc.example.com';
function req(method,body,cookie=''){return{method,body,headers:{origin,cookie}};}
async function withFetch(fn,run){const prev=global.fetch,env=process.env.APP_ORIGIN;global.fetch=fn;process.env.APP_ORIGIN=origin;try{await run();}finally{global.fetch=prev;if(env===undefined)delete process.env.APP_ORIGIN;else process.env.APP_ORIGIN=env;}}
const ok=data=>({ok:true,status:200,json:async()=>data});
const session=()=>({access_token:jwt(),refresh_token:'rotated-test-token',expires_in:3600,user:{email,email_confirmed_at:'confirmed'}});
test('lifetime is bounded to ten minutes, malformed and expired tokens fail closed',()=>{
 const now=Date.now();assert.ok(accessRemaining(jwt(),now)<=600);assert.equal(accessRemaining(jwt(1,9999999999),now),0);assert.equal(accessRemaining('bad'),0);
});
test('login and refresh keep both tokens only in secure cookies',async()=>{
 await withFetch(async url=>ok(url.includes('/token?')?session():[{role:'admin'}]),async()=>{
  for(const body of [{email,password:'fixture-password'},{action:'refresh',expected_email:email}]){
   const r=res();await handler(req('POST',body,'__Host-cc-refresh=old-test-token'),r);
   assert.equal(r.code,200);assert.equal(r.data.expires_in,600);assert.equal(r.headers['Set-Cookie'].length,2);
   for(const c of r.headers['Set-Cookie'])assert.match(c,/HttpOnly; Secure; SameSite=Strict; Path=\//);
   assert.match(r.headers['Set-Cookie'][0],/Max-Age=600$/);assert.ok(!JSON.stringify(r.data).includes('token'));
  }
 });
});
test('cross-origin refresh is rejected before contacting Supabase',async()=>{
 await withFetch(()=>{throw Error('unexpected fetch');},async()=>{const r=res(),q=req('POST',{action:'refresh'});q.headers.origin='https://attacker.example';await handler(q,r);assert.equal(r.code,403);});
});
test('wrong-account renewal never replaces cookies',async()=>{
 await withFetch(async()=>ok(session()),async()=>{const r=res();await handler(req('POST',{action:'refresh',expected_email:'other@example.com'},'__Host-cc-refresh=old'),r);assert.equal(r.code,401);assert.equal(r.headers['Set-Cookie'],undefined);});
});
test('revoked refresh requires reauthentication; outages preserve existing cookies',async()=>{
 for(const [status,expected] of [[400,401],[503,503]])await withFetch(async()=>({ok:false,status,json:async()=>({})}),async()=>{const r=res();await handler(req('POST',{action:'refresh'},'__Host-cc-refresh=old'),r);assert.equal(r.code,expected);assert.equal(r.headers['Set-Cookie'],undefined);});
});
test('logout revokes the current session and clears both cookies',async()=>{
 const calls=[];await withFetch(async url=>{calls.push(url);return ok(url.includes('/token?')?session():{});},async()=>{const r=res();await handler(req('DELETE',{},'__Host-cc-refresh=old'),r);assert.equal(r.code,200);assert.ok(calls.some(u=>u.endsWith('/logout?scope=local')));assert.equal(r.headers['Set-Cookie'].length,2);for(const c of r.headers['Set-Cookie'])assert.match(c,/Max-Age=0$/);});
});
test('server rejects tokens older than ten minutes even before issuer settings change',async()=>{
 await withFetch(async()=>ok({id:'fixture',email,email_confirmed_at:'confirmed'}),async()=>{await assert.rejects(()=>identify({headers:{cookie:'__Host-cc='+jwt(Math.floor(Date.now()/1000)-601)}}),e=>e.status===401);});
});
function harness(fetch){
 const elements=[];const focused={value:'copy por guardar',focus(){}};
 function node(tag){const n={tag,children:[],value:'',setAttribute(){},append(...items){this.children.push(...items);},addEventListener(k,fn){this[k]=fn;},focus(){},showModal(){this.open=true;},close(){this.open=false;},remove(){this.removed=true;}};elements.push(n);return n;}
 const ctx=vm.createContext({fetch,AbortSignal,Error,Promise,JSON,setTimeout:()=>1,clearTimeout(){},navigator:{locks:{request:async(_,fn)=>fn()}},window:{addEventListener(){}},document:{visibilityState:'visible',activeElement:focused,addEventListener(){},createElement:node,body:{append(){}}}});
 vm.runInContext(readFileSync('public/session.js','utf8')+';this.session=CCSession;',ctx);ctx.session.start({email});return{ctx,elements,focused};
}
const bad=status=>({ok:false,status,json:async()=>({error:'session expired'})});
const tick=()=>new Promise(r=>setImmediate(r));
test('expired write refreshes once and retries the exact same operation',async()=>{
 const writes=[];let refreshes=0;
 const h=harness(async(url,o)=>{if(url==='/api/workspace'){writes.push(o);return writes.length===1?bad(401):ok({saved:true});}if(o.method==='POST'){refreshes++;return ok({email,expires_in:600});}return bad(401);});
 const body=JSON.stringify({operation_id:'same-id',data:'pending',revisions:{Blendd:7}});
 await h.ctx.session.request('/api/workspace',{method:'PUT',body});assert.equal(refreshes,1);assert.equal(writes.length,2);assert.equal(writes[0].body,writes[1].body);assert.equal(h.elements.length,0);
});
test('failed refresh blocks in a modal, preserves open form and resumes only after same-account login',async()=>{
 let writes=0,reauth;
 const h=harness(async(url,o)=>{if(url==='/api/workspace')return ++writes===1?bad(401):ok({saved:true});if(o.method==='POST'&&JSON.parse(o.body).password){reauth=JSON.parse(o.body);return ok({email,expires_in:600});}return bad(401);});
 let completed=false;const pending=h.ctx.session.request('/api/workspace',{method:'PUT',body:'unchanged'}).then(()=>completed=true);await tick();
 const dialog=h.elements.find(n=>n.tag==='dialog');assert.equal(dialog.open,true);assert.equal(completed,false);assert.equal(writes,1);assert.equal(h.focused.value,'copy por guardar');
 let prevented=false;dialog.cancel({preventDefault(){prevented=true;}});assert.equal(prevented,true);
 const password=h.elements.find(n=>n.type==='password');password.value='fixture-password';h.elements.find(n=>n.tag==='form').onsubmit({preventDefault(){}});await pending;
 assert.equal(reauth.expected_email,email);assert.equal(password.value,'');assert.equal(dialog.removed,true);assert.equal(h.focused.value,'copy por guardar');assert.equal(writes,2);
});
test('conflict after refresh is returned without an overwrite retry',async()=>{
 let writes=0;
 const h=harness(async(url,o)=>{if(url==='/api/workspace')return bad(++writes===1?401:409);return o.method==='POST'?ok({email,expires_in:600}):bad(401);});
 await assert.rejects(()=>h.ctx.session.request('/api/workspace',{method:'PUT',body:'original'}),e=>e.status===409);assert.equal(writes,2);
});
test('simultaneous expired requests share one renewal and retain separate operations',async()=>{
 let refreshes=0;const attempts=new Map();
 const h=harness(async(url,o)=>{if(url==='/api/workspace'){const n=(attempts.get(o.body)||0)+1;attempts.set(o.body,n);return n===1?bad(401):ok({saved:true});}if(o.method==='POST'){refreshes++;await tick();return ok({email,expires_in:600});}return bad(401);});
 await Promise.all(['one','two'].map(body=>h.ctx.session.request('/api/workspace',{method:'PUT',body})));
 assert.equal(refreshes,1);assert.equal(attempts.get('one'),2);assert.equal(attempts.get('two'),2);
});
