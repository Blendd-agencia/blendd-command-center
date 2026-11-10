import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {readFileSync} from 'node:fs';
const key='cc-view-v1:test@example.com';
function harness(saved,options={}){
 const dom=new JSDOM('<body><div class="header-right"></div><div id="content"></div></body>',{runScripts:'outside-only',url:'https://example.com/workspace/'}),w=dom.window;
 const notices=[];let settled=0;
 Object.assign(w,{URLSearchParams,area:'Todas',company:'Todas',page:'overview',month:'2026-11',clientId:null,clientTab:'overview',portalClient:null,portalTab:'home',portalStage:null,financeTab:'summary',resultNetwork:'instagram',resultMonth:'2026-11',workspaceBootData:{user:{email:'test@example.com'}},db:{clients:[{id:'client-1'}]},pages:{overview:[],clients:[],transactions:[],staff:[],vault:[]},clientTabs:{overview:'',posts:'',materials:'',documents:''},FIN_KINDS:{retainers:{},oneoffs:{},fixed:{},variable:{}},cloudRawNotify:s=>notices.push(s),Cloud:{settled:async()=>{settled++;if(options.fail)throw Error('Gravação pendente');}},render(){w.document.querySelector('#content').innerHTML='<div class="plan-scroll"></div>';},requestAnimationFrame:f=>f(),scrollTo(x,y){w.restoredScroll={x,y};}});
 if(saved)w.sessionStorage.setItem(key,JSON.stringify(saved));w.testReload=()=>{w.reloaded=true;w.viewAtReload=w.sessionStorage.getItem(key);};w.eval(readFileSync('workspace-src/navigation.js','utf8').replace('location.reload()','window.testReload()')+';window.navigationTest=WorkspaceNavigation;');
 return {w,dom,notices,settled:()=>settled};
}
test('reload restores client, post plan month and both grid scroll axes',()=>{
 const saved={version:1,view:{area:'Blendd',company:'Blendd',page:'clients',clientId:'client-1',clientTab:'posts',month:'2026-12'},scroll:{x:0,y:450,containers:[{selector:'.plan-scroll',index:0,x:1500,y:230}]}};
 const {w,dom}=harness(saved);assert.equal(w.area,'Blendd');assert.equal(w.clientTab,'posts');assert.equal(w.clientId,'client-1');assert.equal(w.month,'2026-12');assert.equal(w.document.querySelector('.plan-scroll').scrollLeft,1500);assert.equal(w.document.querySelector('.plan-scroll').scrollTop,230);assert.deepEqual(w.restoredScroll,{x:0,y:450});dom.window.close();
});
test('browser beforeunload stores only navigation, never draft values',()=>{
 const {w,dom}=harness();w.area='UP';w.page='transactions';w.financeTab='fixed';w.document.body.insertAdjacentHTML('beforeend','<input value="private draft">');w.dispatchEvent(new w.Event('beforeunload'));
 const saved=JSON.parse(w.sessionStorage.getItem(key));assert.equal(saved.view.area,'UP');assert.equal(saved.view.financeTab,'fixed');assert.ok(!JSON.stringify(saved).includes('private draft'));dom.window.close();
});
test('untrusted stored routes and missing clients fall back safely',()=>{
 const {w,dom}=harness({version:1,view:{area:'other',page:'<script>',clientId:'deleted',portalClient:'deleted',month:'bad',clientTab:'invalid'},scroll:{containers:[{selector:'body',index:0,x:1000}]}});assert.equal(w.page,'overview');assert.equal(w.clientId,null);assert.equal(w.portalClient,null);assert.equal(w.month,'2026-11');dom.window.close();
});
test('refresh refuses to discard an open form',async()=>{
 const {w,dom,notices,settled}=harness();w.document.body.insertAdjacentHTML('beforeend','<dialog open><form><input value="unsaved"></form></dialog>');assert.equal(await w.navigationTest.refresh(),false);assert.equal(settled(),0);assert.match(notices[0],/Guarda ou fecha/);assert.equal(w.document.querySelector('input').value,'unsaved');dom.window.close();
});
test('refresh waits for save and stays put on conflict or failed persistence',async()=>{
 const {w,dom,notices,settled}=harness(null,{fail:true});assert.equal(await w.navigationTest.refresh(),false);assert.equal(settled(),1);assert.match(notices[0],/alterações continuam nesta janela/);assert.equal(w.document.querySelector('[data-refresh-view]').disabled,false);dom.window.close();
});
test('render always adds one refresh control and marks unsaved inline forms',()=>{
 const {w,dom}=harness();w.render();w.render();assert.equal(w.document.querySelectorAll('[data-refresh-view]').length,1);w.document.body.insertAdjacentHTML('beforeend','<form><input></form>');w.document.querySelector('input').dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(w.document.querySelector('form').dataset.refreshDirty,'true');dom.window.close();
});

test('successful refresh waits for acknowledgement and captures position before reloading',async()=>{
 const {w,dom}=harness();let finish;w.Cloud.settled=()=>new Promise(resolve=>finish=resolve);w.page='clients';w.clientId='client-1';w.clientTab='posts';
 const pending=w.navigationTest.refresh();assert.equal(w.reloaded,undefined);finish();assert.equal(await pending,true);assert.equal(w.reloaded,true);assert.equal(JSON.parse(w.viewAtReload).view.clientTab,'posts');dom.window.close();
});
