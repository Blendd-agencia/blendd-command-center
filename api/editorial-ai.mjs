import {usageFromProvider,monthlyCosts,lisbonMonth} from '../lib/editorial-costs.mjs';
import {collectSources,imageData,BYTE_LIMIT} from '../lib/editorial-sources.mjs';
import {appOrigins,backendConfig} from '../lib/config.mjs';
import {identify,sb,response,failure,accessRemaining} from '../lib/supabase.mjs';
import {sameOrigin,HttpError,uuid} from '../lib/validation.mjs';
import {fullAdmin,joinWorkspace} from '../lib/workspace-model.mjs';
import {AI_MODEL,OUTPUT_KEYS,generationContext,systemPrompt,parseGeneration,enforceOwnership} from '../lib/editorial-ai.mjs';
export default async function handler(req,res){let jobId,session,usageMetrics;
 try{
  session=await identify(req);if(!fullAdmin(session.memberships))throw new HttpError(403,'Sem acesso de administração.');
  const credential=process.env.AI_GATEWAY_API_KEY||(process.env.VERCEL==='1'?req.headers['x-vercel-oidc-token']:process.env.VERCEL_OIDC_TOKEN);
  if(req.method==='GET'){
   const query=new URL(req.url||'/api/editorial-ai','https://internal.invalid').searchParams;
   const client=query.get('clientId'),selectedMonth=query.get('month')||lisbonMonth(Date.now());
   if(client&&(client.length>100||!/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)))throw new HttpError(400,'Cliente ou mês inválido.');
   let jobs=[];
   if(client){
    const [year,m]=selectedMonth.split('-').map(Number),from=new Date(Date.UTC(year,m-1,0)).toISOString(),to=new Date(Date.UTC(year,m,2)).toISOString();
    for(let offset=0;;offset+=500){const batch=await sb('/rest/v1/cc_ai_jobs?select=id,client_id,post_id,model,status,result,error,usage,created_at,context_hash&client_id=eq.'+encodeURIComponent(client)+'&created_at=gte.'+encodeURIComponent(from)+'&created_at=lt.'+encodeURIComponent(to)+'&order=created_at.desc,id.desc&limit=500&offset='+offset,{token:session.token});jobs.push(...batch);if(batch.length<500)break;}
   }else jobs=await sb('/rest/v1/cc_ai_jobs?select=id,client_id,post_id,model,status,result,error,usage,created_at,context_hash&order=created_at.desc&limit=50',{token:session.token});
   const summary=client?monthlyCosts(jobs,client,selectedMonth):null;
   return response(res,200,{configured:!!credential,model:AI_MODEL,monthlyTestLimit:20,reservePerRequestUsd:1.5,monthlyBudgetUsd:5,jobs:summary?.jobs||jobs,summary});
  }
  if(req.method!=='POST')throw new HttpError(405,'Método inválido.');sameOrigin(req,appOrigins());
  const b=req.body||{};uuid(b.operationId);
  if(typeof b.postId!=='string'||b.postId.length>100||b.templateId&&typeof b.templateId!=='string')throw new HttpError(400,'Pedido inválido.');
  if(!credential)throw new HttpError(503,'Ligação IA por configurar no servidor.');
  if(accessRemaining(session.token)<150)throw new HttpError(401,'Renove a sessão antes de gerar.');
  const rows=await sb('/rest/v1/cc_workspace_states?select=scope,payload,revision',{token:session.token});
  const ctx=generationContext(joinWorkspace(rows),b.postId,b.templateId);
  if(b.revision!==rows.find(r=>r.scope===ctx.c.company)?.revision)throw new HttpError(409,'Os dados mudaram. Atualize antes de gerar.');
  const reserved=await sb('/rest/v1/rpc/cc_reserve_ai',{method:'POST',token:session.token,body:{job_id:b.operationId,client:ctx.c.id,post:ctx.p.id,context:ctx.hash,model_name:AI_MODEL}}).catch(e=>{if(e.status===400)throw new HttpError(429,'Limite dos testes atingido: orçamento mensal de 5 USD, até 20 pedidos/mês e 3/minuto.');throw e;});
  if(!reserved.fresh)return response(res,200,{job:reserved.job});jobId=b.operationId;usageMetrics={model:AI_MODEL,reservedUsd:1.5,providerAttempted:false};
  const company=ctx.c.company==='UP'?'b1000000-0000-4000-8000-000000000002':'b1000000-0000-4000-8000-000000000001';
  const privateReader=async(id,signal)=>{
   const files=await sb('/rest/v1/cc_workspace_files?id=eq.'+encodeURIComponent(id)+'&ready=eq.true&select=id,mime,size,company_id',{token:session.token});
   const f=files[0];if(!f||f.company_id!==company||!['image/png','image/jpeg','image/webp'].includes(f.mime)||f.size>BYTE_LIMIT)throw new HttpError(400,'Use uma imagem privada válida desta empresa.');
   const {url,key}=backendConfig();const r=await fetch(url+'/functions/v1/command-center-files?id='+encodeURIComponent(f.id),{headers:{apikey:key,Authorization:'Bearer '+session.token},signal});
   if(!r.ok)throw new HttpError(503,'Não foi possível ler a imagem.');
   const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>BYTE_LIMIT)throw new HttpError(400,'Imagem demasiado grande.');return {bytes,mime:f.mime};
  };
  const sourceSignal=AbortSignal.timeout(15000);
  const sources=await collectSources(ctx.materials,{privateReader,signal:sourceSignal});
  let image;
  if(ctx.template?.fileId){const data=await privateReader(ctx.template.fileId,AbortSignal.timeout(8000));image=await imageData(data.bytes);}
  if(!sources.reports.some(r=>r.status==='text'||r.status==='image')&&!ctx.materials.some(m=>[m.raw,m.copyLinkedIn,m.copyInstagram,m.copyFacebook,m.artCopy].some(v=>v?.replace(/https:\/\/\S+/g,'').trim())))throw new HttpError(400,'Não foi possível ler as fontes. Cole o texto ou anexe uma imagem acessível aos materiais.');
  ctx.context.sources=sources.reports;
  if(Buffer.byteLength(JSON.stringify(ctx.context),'utf8')>60000)throw new HttpError(400,'Contexto demasiado extenso. Reduza os materiais ou as fontes antes de gerar.');
  const content=[{type:'text',text:JSON.stringify(ctx.context)},...sources.images.flatMap(i=>[{type:'text',text:'Imagem do material: '+i.source},{type:'image_url',image_url:{url:i.data,detail:'high'}}]),...(image?[{type:'text',text:'Template de referência visual, não representa os factos deste post.'},{type:'image_url',image_url:{url:image,detail:'high'}}]:[])];
  const properties=Object.fromEntries(OUTPUT_KEYS.map(k=>[k,k==='warnings'?{type:'array',items:{type:'string'}}:{type:'string'}]));
  let upstream;usageMetrics.providerAttempted=true;
  try{upstream=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:JSON.stringify({model:AI_MODEL,max_completion_tokens:6000,reasoning_effort:'low',messages:[{role:'system',content:systemPrompt},{role:'user',content}],response_format:{type:'json_schema',json_schema:{name:'editorial_draft',strict:true,schema:{type:'object',properties,required:OUTPUT_KEYS,additionalProperties:false}}}}),signal:AbortSignal.timeout(75000)});}catch{throw new HttpError(504,'A geração excedeu o tempo disponível. Consulte o histórico antes de tentar novamente.');}
  if(!upstream.ok){
   // Store only bounded diagnostics: never provider bodies, headers or credentials.
   const authMethod=process.env.AI_GATEWAY_API_KEY?'api_key':'oidc';
   usageMetrics.gateway={status:upstream.status,authMethod};
   console.error('editorial_gateway_rejected',{jobId,model:AI_MODEL,status:upstream.status,authMethod});
   const message=upstream.status===401?'O AI Gateway recusou a autenticação do servidor (401; '+authMethod+'). A administração deve verificar a credencial na Vercel.':upstream.status===403?'O AI Gateway recusou a autorização deste pedido (403). Verifique as permissões da equipa, do projeto e o acesso ao modelo '+AI_MODEL+'.':upstream.status===402?'O AI Gateway não tem saldo ou atingiu o limite de custos.':upstream.status===429?'A IA atingiu o limite de pedidos. Aguarde antes de tentar novamente.':'O fornecedor de IA está indisponível (HTTP '+upstream.status+').';
   throw new HttpError(503,message);
  }
  const raw=await upstream.json();usageMetrics={...usageMetrics,...usageFromProvider(raw,AI_MODEL)};let parsed;try{parsed=JSON.parse(raw.choices?.[0]?.message?.content);}catch{throw new HttpError(502,'Resposta incompleta da IA. Consulte o histórico.');}
  if(raw.choices?.[0]?.finish_reason!=='stop')throw new HttpError(502,'A IA não terminou a proposta. Não foi aplicada.');
  const result=enforceOwnership(parseGeneration(parsed),ctx);
  result.warnings=[...sources.reports.filter(r=>r.status==='failed').map(r=>'Fonte não lida: '+r.source.slice(0,500)+' · '+r.message),...result.warnings].slice(0,20);
  const usage={...usageMetrics,model:AI_MODEL,reservedUsd:1.5,sources:sources.reports.map(({text,...r})=>({...r,source:r.source.slice(0,500),characters:text?.length||0})),provenance:{briefRevision:ctx.c.social?.editorialBrief?.revision||0,ruleId:ctx.rule.id,ruleRevision:ctx.c.social?.workflow?.revision||0,templateId:ctx.template?.id||null,templateVersion:ctx.template?.version||null,memoryRevision:ctx.c.social?.ruleResources?.[ctx.rule.id]?.revision||0}};
  await sb('/rest/v1/rpc/cc_finish_ai',{method:'POST',token:session.token,body:{job_id:jobId,output:result,failure:null,metrics:usage}});
  return response(res,200,{job:{id:jobId,post_id:ctx.p.id,client_id:ctx.c.id,status:'complete',result,context_hash:ctx.hash,usage}});
 }catch(e){if(jobId&&session)await sb('/rest/v1/rpc/cc_finish_ai',{method:'POST',token:session.token,body:{job_id:jobId,output:null,failure:e.status?e.message:'Erro interno na geração.',metrics:usageMetrics||null}}).catch(()=>{});failure(res,e);}
}
