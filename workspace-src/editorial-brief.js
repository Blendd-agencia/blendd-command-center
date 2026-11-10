function editorialBriefView(c){
  const b=c.social?.editorialBrief;
  if(!b)return '<section class="card brief-panel"><h2>Briefing editorial</h2><p>Ainda não foi preparado o briefing deste cliente.</p></section>';
  return `<section class="card brief-panel"><h2>Briefing editorial</h2><p>${esc(b.status||'Documento de trabalho')}</p><small>Revisão ${Number(b.revision)||1} · ${esc((b.updatedAt||'').slice(0,10))}</small><p>${esc(b.coverage||'')}</p></section><div class="brief-sections">${(b.sections||[]).map((s,i)=>`<section class="card brief-panel"><div class="brief-heading"><div><span class="brief-evidence">${esc(s.evidenceType||'Orientação editorial')}</span><h3>${esc(s.title)}</h3></div><button data-brief-edit="${i}" data-brief-client="${esc(c.id)}">Editar</button></div><p class="brief-body">${esc(s.body)}</p><div class="brief-sources">${(s.sources||[]).filter(x=>safeUrl(x.url)).map(x=>`<a href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer">${esc(x.label)} ↗</a>`).join('')}</div></section>`).join('')}</div>`;
}
function editEditorialBrief(clientId,index){
  if(portalClient)return;
  const c=db.clients.find(c=>c.id===clientId),b=c?.social?.editorialBrief,s=b?.sections?.[index];
  if(!s)return;
  wModal(s.title,editorialText('Orientações editoriais','body',s.body,14)+'<p class="fin-wide fin-footnote">A alteração fica no briefing. As regras de quantidade e aprovação são configuradas em Serviços e rubricas.</p>',v=>{
    const body=String(v.body||'').trim();
    if(!body||body.length>6000)throw Error('Preencha o texto, até 6000 caracteres.');
    s.body=body;s.evidenceType='Revisto pela equipa';b.revision=(Number(b.revision)||1)+1;b.updatedAt=new Date().toISOString();
    save();notifyAction('Briefing atualizado.');
  });
}
document.addEventListener('click',e=>{const b=e.target.closest('button[data-brief-edit]');if(b&&!b.disabled)editEditorialBrief(b.dataset.briefClient,Number(b.dataset.briefEdit));});
