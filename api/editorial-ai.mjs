import {appOrigins,backendConfig} from '../lib/config.mjs';
import {identify,sb,response,failure,accessRemaining} from '../lib/supabase.mjs';
import {sameOrigin,HttpError,uuid} from '../lib/validation.mjs';
import {fullAdmin,joinWorkspace} from '../lib/workspace-model.mjs';
import {AI_MODEL,OUTPUT_KEYS,generationContext,systemPrompt,parseGeneration,enforceOwnership} from '../lib/editorial-ai.mjs';
export default async function handler(req,res){let jobId,session;
 try{
  session=await identify(req);if(!fullAdmin(session.memberships))throw new HttpError(403,'Sem acesso de administração.');
  const credential=process.env.AI_GATEWAY_API_KEY||(process.env.VERCEL==='1'?req.headers['x-vercel-oidc-token']:process.env.VERCEL_OIDC_TOKEN);
  if(req.method==='GET'){
   const jobs=await sb('/rest/v1/cc_ai_jobs?select=id,client_id,post_id,status,result,error,usage,created_at,context_hash&order=created_at.desc&limit=50',{token:session.token});
   return response(res,200,{configured:!!credential,model:AI_MODEL,monthlyTestLimit:20,reservePerRequestUsd:0.25,jobs});
  }
  if(req.method!=='POST')throw new HttpError(405,'Método inválido.');sameOrigin(req,appOrigins());
  const b=req.body||{};uuid(b.operationId);
  if(typeof b.postId!=='string'||b.postId.length>100||b.templateId&&typeof b.templateId!=='string')throw new HttpError(400,'Pedido inválido.');
  if(!credential)throw new HttpError(503,'Ligação IA por configurar no servidor.');
  if(accessRemaining(session.token)<90)throw new HttpError(401,'Renove a sessão antes de gerar.');
  const rows=await sb('/rest/v1/cc_workspace_states?select=scope,payload,revision',{token:session.token});
  const ctx=generationContext(joinWorkspace(rows),b.postId,b.templateId);
  if(b.revision!==rows.find(r=>r.scope===ctx.c.company)?.revision)throw new HttpError(409,'Os dados mudaram. Atualize antes de gerar.');
  let image;
  if(ctx.template?.fileId){
   const files=await sb('/rest/v1/cc_workspace_files?id=eq.'+encodeURIComponent(ctx.template.fileId)+'&ready=eq.true&select=id,mime,size,company_id',{token:session.token});
   const f=files[0],company=ctx.c.company==='UP'?'b1000000-0000-4000-8000-000000000002':'b1000000-0000-4000-8000-000000000001';
   if(!f||f.company_id!==company||!['image/png','image/jpeg'].includes(f.mime)||f.size>3145728)throw new HttpError(400,'Use uma pré-visualização PNG/JPEG privada válida neste template.');
   const {url,key}=backendConfig();const r=await fetch(url+'/functions/v1/command-center-files?id='+encodeURIComponent(f.id),{headers:{apikey:key,Authorization:'Bearer '+session.token},signal:AbortSignal.timeout(10000)});
   if(!r.ok)throw new HttpError(503,'Não foi possível ler o template.');
   const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>3145728)throw new HttpError(400,'Template demasiado grande.');image='data:'+f.mime+';base64,'+bytes.toString('base64');
  }
  const reserved=await sb('/rest/v1/rpc/cc_reserve_ai',{method:'POST',token:session.token,body:{job_id:b.operationId,client:ctx.c.id,post:ctx.p.id,context:ctx.hash,model_name:AI_MODEL}}).catch(e=>{if(e.status===400)throw new HttpError(429,'Limite de testes atingido: 3 pedidos por minuto e 20 por mês.');throw e;});
  if(!reserved.fresh)return response(res,200,{job:reserved.job});jobId=b.operationId;
  const properties=Object.fromEntries(OUTPUT_KEYS.map(k=>[k,k==='warnings'?{type:'array',items:{type:'string'}}:{type:'string'}]));
  let upstream;
  try{upstream=await fetch('https://ai-gateway.vercel.sh/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:JSON.stringify({model:AI_MODEL,max_tokens:3500,temperature:0.4,messages:[{role:'system',content:systemPrompt},{role:'user',content:[{type:'text',text:JSON.stringify(ctx.context)},...(image?[{type:'image_url',image_url:{url:image,detail:'high'}}]:[])]}],response_format:{type:'json_schema',json_schema:{name:'editorial_draft',strict:true,schema:{type:'object',properties,required:OUTPUT_KEYS,additionalProperties:false}}}}),signal:AbortSignal.timeout(25000)});}catch{throw new HttpError(504,'A geração excedeu o tempo disponível. Consulte o histórico antes de tentar novamente.');}
  if(!upstream.ok)throw new HttpError(503,[401,403].includes(upstream.status)?'O AI Gateway requer ativação ou autenticação válida na Vercel.':upstream.status===402?'O AI Gateway não tem saldo ou atingiu o limite de custos.':upstream.status===429?'A IA atingiu o limite de pedidos. Aguarde antes de tentar novamente.':'O fornecedor de IA está indisponível.');
  const raw=await upstream.json();let parsed;try{parsed=JSON.parse(raw.choices?.[0]?.message?.content);}catch{throw new HttpError(502,'Resposta incompleta da IA. Consulte o histórico.');}
  if(raw.choices?.[0]?.finish_reason!=='stop')throw new HttpError(502,'A IA não terminou a proposta. Não foi aplicada.');
  const result=enforceOwnership(parseGeneration(parsed),ctx);
  const usage={inputTokens:Number(raw.usage?.prompt_tokens)||0,outputTokens:Number(raw.usage?.completion_tokens)||0,model:AI_MODEL,reservedUsd:0.25,provenance:{briefRevision:ctx.c.social?.editorialBrief?.revision||0,ruleId:ctx.rule.id,ruleRevision:ctx.c.social?.workflow?.revision||0,templateId:ctx.template?.id||null,templateVersion:ctx.template?.version||null,memoryRevision:ctx.c.social?.ruleResources?.[ctx.rule.id]?.revision||0}};
  await sb('/rest/v1/rpc/cc_finish_ai',{method:'POST',token:session.token,body:{job_id:jobId,output:result,failure:null,metrics:usage}});
  return response(res,200,{job:{id:jobId,post_id:ctx.p.id,client_id:ctx.c.id,status:'complete',result,context_hash:ctx.hash,usage}});
 }catch(e){if(jobId&&session)await sb('/rest/v1/rpc/cc_finish_ai',{method:'POST',token:session.token,body:{job_id:jobId,output:null,failure:e.status?e.message:'Erro interno na geração.',metrics:null}}).catch(()=>{});failure(res,e);}
}
