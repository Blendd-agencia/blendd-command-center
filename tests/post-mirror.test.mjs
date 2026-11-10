import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import DOMPurify from 'dompurify';
import * as EditorialModel from '../lib/editorial-model.mjs';
function harness(){
 const dom=new JSDOM('<!doctype html><body></body>',{runScripts:'outside-only',url:'https://test.example'}),w=dom.window;
 const post={id:'post-1',clientId:'client-1',date:'2026-11-02',copyLinkedIn:'Copy de teste',artCopy:'Arte de teste'};
 let saves=0;
 Object.assign(w,{DOMPurify:DOMPurify(w),EditorialModel,db:{posts:[post],clients:[{id:'client-1',company:'Blendd'}]},portalClient:null,clientId:'client-1',viewer:'Teste',month:'2026-11',Cloud:{schedule(){saves++;}},render(){},hasSocial:()=>true,esc:x=>String(x||''),planContent:x=>x||'—',reviewState:(p,k)=>p.review[k],weekday:()=> 'segunda-feira',planRows:()=>[post],safeUrl:x=>x,notifyAction(){},updatePost(p,v){Object.assign(p,v);}});
 w.eval(readFileSync('workspace-src/sanitize.js','utf8'));
 w.eval(readFileSync('workspace-src/post-mirror.js','utf8'));
 w.document.body.innerHTML='<table><tbody><tr data-mirror-row="post-1"><td><input data-mirror-field="date" data-post-id="post-1" value="2026-11-02"><input data-mirror-field="weekday" data-post-id="post-1" value="segunda-feira"><textarea data-mirror-field="copyLinkedIn" data-post-id="post-1">Copy de teste</textarea><small data-row-save></small></td>'+w.reviewCell(post,'copy','team')+w.reviewCell(post,'art','team')+'</tr></tbody></table>';
 const row=w.document.querySelector('tr');return{w,post,row,saves:()=>saves,dom};
}
test('SIM updates the actual sanitized DOM, selection and history without replacing the clicked button',()=>{
 const {w,post,row,dom}=harness();const yes=row.querySelector('[data-mirror-ready][data-kind="copy"][data-value="true"]');yes.click();
 assert.equal(post.review.copy.ready,true);assert.equal(yes.isConnected,true);assert.equal(yes.getAttribute('aria-pressed'),'true');assert.equal(yes.className,'is-yes');assert.match(yes.closest('td').textContent,/Selecionado: SIM/);assert.equal(post.review.copy.history.length,1);
 assert.equal(row.querySelector('[data-kind="copy"][data-value="false"]').getAttribute('aria-pressed'),'false');
 assert.equal(row.querySelector('[data-row-save]').textContent,'A guardar…');dom.window.close();
});
test('blur/change before click does not detach the pending click target; NAO clears SIM',()=>{
 const {w,post,row,dom}=harness();const yes=row.querySelector('[data-kind="copy"][data-value="true"]'),field=row.querySelector('textarea');
 field.value='Copy revisto';field.dispatchEvent(new w.Event('change',{bubbles:true}));assert.equal(yes.isConnected,true);yes.click();assert.equal(post.review.copy.ready,true);
 const no=row.querySelector('[data-kind="copy"][data-value="false"]');no.click();assert.equal(post.review.copy.ready,false);assert.equal(no.className,'is-no');assert.equal(yes.getAttribute('aria-pressed'),'false');dom.window.close();
});
test('submission validation displays an immediate inline error without selecting SIM',()=>{
 const {post,row,dom}=harness();post.copyLinkedIn='';row.querySelector('textarea').value='';
 row.querySelector('[data-kind="copy"][data-value="true"]').click();assert.notEqual(post.review.copy.ready,true);assert.match(row.querySelector('[role="alert"]').textContent,/Preencha um copy/);dom.window.close();
});
test('configured workflow is checked before mutating readiness',()=>{
 const {post,row,dom}=harness();post.workflow={rule:{copyApproval:true}};post.materialIds=[];
 row.querySelector('[data-kind="copy"][data-value="true"]').click();assert.notEqual(post.review.copy.ready,true);assert.match(row.querySelector('[role="alert"]').textContent,/Associe os materiais/);dom.window.close();
});
test('selected SIM has a green computed background with production styles',()=>{
 const {w,row,dom}=harness();for(const file of ['style','workspace','portal','brand','editorial']){const style=w.document.createElement('style');style.textContent=readFileSync('workspace-src/'+file+'.css','utf8');w.document.head.append(style);}
 const yes=row.querySelector('[data-kind="copy"][data-value="true"]');yes.click();assert.equal(w.getComputedStyle(yes).backgroundColor,'rgb(232, 246, 240)');dom.window.close();
});
