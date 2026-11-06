// All privileged credentials are supplied by Supabase's server runtime.
const root=Deno.env.get('SUPABASE_URL')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const headers=(token:string)=>({apikey:service,Authorization:`Bearer ${token}`});
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
async function call(path:string,token:string,init:RequestInit={}){return fetch(root+path,{...init,headers:{...headers(token),...init.headers},signal:AbortSignal.timeout(10000)});}
Deno.serve(async req=>{try{
 const token=req.headers.get('Authorization')?.replace(/^Bearer /,'');if(!token)return reply(401,{error:'Sessão necessária.'});
 const auth=await call('/auth/v1/user',token);if(!auth.ok)return reply(401,{error:'Sessão inválida.'});const user=await auth.json();if(!user.email_confirmed_at)return reply(403,{error:'Conta não confirmada.'});
 const memberResponse=await call('/rest/v1/cc_memberships?select=company_id,role',token);if(!memberResponse.ok)return reply(403,{error:'Sem acesso.'});const members=await memberResponse.json();
 const ids=['b1000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002'];if(!ids.every(id=>members.some((m:any)=>m.company_id===id&&m.role==='admin')))return reply(403,{error:'Sem acesso de administração.'});
 const budget=await call('/rest/v1/rpc/cc_consume_request',token,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!budget.ok||await budget.json()!==true)return reply(429,{error:'Aguarde antes de repetir.'});
 const url=new URL(req.url),id=url.searchParams.get('id');
 if(req.method==='GET'){
  if(!id){const r=await call('/rest/v1/cc_workspace_files?ready=eq.true&select=id,name,mime,size,company_id,sha256',token);return new Response(await r.text(),{status:r.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});}
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id))return reply(400,{error:'Identificador inválido.'});
  const rr=await call('/rest/v1/cc_workspace_files?id=eq.'+id+'&ready=eq.true&select=*',token);const rows=await rr.json();const row=rows[0];if(!row)return reply(404,{error:'Documento não encontrado.'});
  const object=await call('/storage/v1/object/authenticated/cc-private/'+row.path,service);if(!object.ok)return reply(502,{error:'Documento temporariamente indisponível.'});
  return new Response(object.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(row.name),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(req.method!=='POST')return reply(405,{error:'Método inválido.'});
 const text=await req.text();if(text.length>4250000)return reply(413,{error:'O limite por ficheiro é 3 MB.'});const b=JSON.parse(text);
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(b.id)||!ids.includes(b.company_id)||typeof b.name!=='string'||typeof b.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(b.data))return reply(400,{error:'Ficheiro inválido.'});
 const bytes=Uint8Array.from(atob(b.data),(c:string)=>c.charCodeAt(0));if(!bytes.length||bytes.length>3145728)return reply(413,{error:'O limite por ficheiro é 3 MB.'});
 const prefix=[...bytes.slice(0,8)],pdf=new TextDecoder().decode(bytes.slice(0,5))==='%PDF-',png=prefix.join(',')==='137,80,78,71,13,10,26,10',jpeg=prefix[0]===255&&prefix[1]===216&&prefix[2]===255;
 const mime=pdf?'application/pdf':png?'image/png':jpeg?'image/jpeg':null;if(!mime)return reply(400,{error:'Só são aceites PDF, PNG e JPEG com conteúdo válido.'});
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');const name=b.name.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,200)||'documento';
 const reserve=await call('/rest/v1/rpc/cc_reserve_file',token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file_id:b.id,company:b.company_id,file_name:name,file_mime:mime,file_size:bytes.length,file_hash:hash})});
 if(!reserve.ok)return reply(reserve.status===409?409:400,{error:'Não foi possível reservar o ficheiro. Verifique o identificador e a quota de 100 MB.'});const row=await reserve.json();if(row.ready)return reply(200,{id:row.id,name:row.name,size:row.size});
 const upload=await call('/storage/v1/object/cc-private/'+row.path,service,{method:'POST',headers:{'Content-Type':mime,'x-upsert':'false'},body:bytes});
 if(!upload.ok){const details=await upload.json().catch(()=>({}));if(details.statusCode!=='409'&&details.error!=='Duplicate'&&details.error!=='ResourceAlreadyExists')return reply(502,{error:'Upload não concluído. Pode repetir a mesma operação.'});}
 const mark=await call('/rest/v1/cc_workspace_files?id=eq.'+b.id,service,{method:'PATCH',headers:{'Content-Type':'application/json'},body:'{"ready":true}'});if(!mark.ok)return reply(502,{error:'Confirmação do upload pendente. Repita a operação.'});
 return reply(201,{id:row.id,name:row.name,size:row.size});
 }catch{return reply(500,{error:'Não foi possível processar o documento.'});}});
