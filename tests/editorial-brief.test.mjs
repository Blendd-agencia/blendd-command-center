import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
function harness(){
 const dom=new JSDOM('<body></body>',{runScripts:'outside-only'}),w=dom.window;
 const c={id:'one',social:{editorialBrief:{revision:1,sections:[{title:'Brief',body:'<img src=x onerror=alert(1)>',sources:[{label:'Unsafe',url:'javascript:alert(1)'},{label:'Source',url:'https://example.com'}]}]}}};
 Object.assign(w,{db:{clients:[c,{id:'two',social:{}}]},portalClient:null,esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),safeUrl:s=>/^https:\/\//.test(s)?s:'',editorialText:()=>'',wModal:(t,b,submit)=>{w.submit=submit},save:()=>{w.saved=true},notifyAction:()=>{}});
 w.eval(readFileSync('workspace-src/editorial-brief.js','utf8'));return {w,c,dom};
}
test('brief escapes imported content and excludes unsafe source links',()=>{const {w,c,dom}=harness();w.document.body.innerHTML=w.editorialBriefView(c);assert.equal(w.document.querySelector('img'),null);assert.equal(w.document.querySelectorAll('a').length,1);assert.match(w.document.querySelector('.brief-body').textContent,/<img/);dom.window.close();});
test('editing changes only the selected briefing and retains provenance',()=>{const {w,c,dom}=harness();w.editEditorialBrief('one',0);w.submit({body:'Reviewed'});assert.equal(c.social.editorialBrief.sections[0].body,'Reviewed');assert.equal(c.social.editorialBrief.revision,2);assert.equal(c.social.editorialBrief.sections[0].sources.length,2);assert.equal(w.db.clients[1].social.editorialBrief,undefined);assert.equal(w.saved,true);assert.throws(()=>w.submit({body:''}));dom.window.close();});
test('portal context cannot open briefing editor',()=>{const {w,dom}=harness();w.portalClient='one';w.editEditorialBrief('one',0);assert.equal(w.submit,undefined);dom.window.close();});
