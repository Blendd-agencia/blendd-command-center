/* Per-tab navigation only. Never persist form values, workspace data or credentials. */
const WorkspaceNavigation=(()=>{
 const key='cc-view-v1:'+window.workspaceBootData.user.email;
 const scrollSelectors=['.plan-scroll','.workdoc-scroll','.table-wrap','aside','#nav'];
 let refreshing=false,restoring=false;
 function view(){return {area,company,page,month,clientId,clientTab,portalClient,portalTab,portalStage,financeTab,resultNetwork,resultMonth};}
 function scrollState(){return {x:window.scrollX,y:window.scrollY,containers:scrollSelectors.flatMap(selector=>Array.from(document.querySelectorAll(selector),(el,index)=>({selector,index,x:el.scrollLeft,y:el.scrollTop})))};}
 function persist(){if(restoring)return;try{sessionStorage.setItem(key,JSON.stringify({version:1,view:view(),scroll:scrollState()}));}catch{/* Navigation still works when browser storage is unavailable. */}}
 function position(n){return typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(n,1000000)):0;}
 function restoreScroll(s){if(!s)return;for(const item of (Array.isArray(s.containers)?s.containers:[]).slice(0,100)){if(!scrollSelectors.includes(item.selector)||!Number.isInteger(item.index)||item.index<0)continue;const el=document.querySelectorAll(item.selector)[item.index];if(el){el.scrollLeft=position(item.x);el.scrollTop=position(item.y);}}window.scrollTo(position(s.x),position(s.y));}
 function apply(v){
  if(!v||typeof v!=='object')return;
  const choice=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
  area=choice(v.area,['Todas','Blendd','UP'],'Todas');company=choice(v.company,['Todas','Blendd','UP'],area);
  page=choice(v.page,[...Object.keys(pages),'integrations'],'overview');if(page==='integrations'&&area!=='Blendd')page='overview';
  if(/^\d{4}-(0[1-9]|1[0-2])$/.test(v.month))month=v.month;
  clientId=db.clients.some(c=>c.id===v.clientId&&!c.archived)?v.clientId:null;
  clientTab=choice(v.clientTab,Object.keys(clientTabs),'overview');
  const hashClient=new URLSearchParams(location.hash.slice(1)).get('cliente');
  portalClient=db.clients.some(c=>c.id===(hashClient||v.portalClient)&&!c.archived)?(hashClient||v.portalClient):null;
  portalTab=choice(v.portalTab,['home','requests','posts','ideas','reports','documents','billing'],'home');
  portalStage=choice(v.portalStage,['initial','active'],null);
  financeTab=choice(v.financeTab,['summary',...Object.keys(FIN_KINDS)],'summary');
  resultNetwork=choice(v.resultNetwork,['instagram','facebook','linkedin'],'instagram');
  if(/^\d{4}-(0[1-9]|1[0-2])$/.test(v.resultMonth))resultMonth=v.resultMonth;
 }
 function hasDraft(){return !!document.querySelector('dialog[open] form,form[data-refresh-dirty="true"]');}
 async function refresh(){
  if(refreshing)return false;
  // Commit the active table field before waiting for server acknowledgement.
  document.activeElement?.blur();
  if(hasDraft()){cloudRawNotify('Guarda ou fecha o formulário aberto antes de atualizar.');return false;}
  refreshing=true;const buttons=document.querySelectorAll('[data-refresh-view]');buttons.forEach(b=>{b.disabled=true;b.setAttribute('aria-busy','true');b.textContent='↻ A atualizar…';});
  try{await Cloud.settled();persist();location.reload();return true;}catch(e){cloudRawNotify('Não foi possível atualizar: '+e.message+' As alterações continuam nesta janela.');return false;}
  finally{refreshing=false;buttons.forEach(b=>{b.disabled=false;b.removeAttribute('aria-busy');b.textContent='↻ Atualizar';});}
 }
 function controls(){for(const parent of [document.querySelector('.header-right'),document.querySelector('.portal-demo > div')]){if(!parent||parent.querySelector('[data-refresh-view]'))continue;const b=document.createElement('button');b.type='button';b.dataset.refreshView='';b.textContent='↻ Atualizar';b.title='Atualizar os dados e manter esta página e posição';b.onclick=refresh;parent.prepend(b);}}
 const baseRender=render;
 render=function(){baseRender();controls();};
 document.addEventListener('input',e=>{const f=e.target.closest?.('form');if(f)f.dataset.refreshDirty='true';});
 window.addEventListener('beforeunload',e=>{persist();if(hasDraft()){e.preventDefault();e.returnValue='';}});
 window.addEventListener('pagehide',persist);
 let saved;try{saved=JSON.parse(sessionStorage.getItem(key));}catch{}
 if(saved?.version===1){restoring=true;apply(saved.view);render();requestAnimationFrame(()=>{restoreScroll(saved.scroll);restoring=false;});}else controls();
 return {refresh,persist};
})();
