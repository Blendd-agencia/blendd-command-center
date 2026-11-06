import {backendConfig} from './config.mjs';
import {HttpError} from './validation.mjs';
export async function sb(path,{token,method='GET',body,headers={}}={}){
 const {url,key}=backendConfig();
 if(!url||!key)throw new HttpError(503,'Configuração de autenticação por concluir.');
 let response;try{response=await fetch(url+path,{method,headers:{apikey:key,...(token?{Authorization:`Bearer ${token}`}:{}) ,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});}catch{throw new HttpError(503,'Serviço temporariamente indisponível. Tente novamente.');}
 const data=await response.json().catch(()=>null);
 if(!response.ok){const status=data?.code==='40001'?409:response.status===401?401:response.status===403?403:response.status===429?429:400;throw new HttpError(status,status===409?'Outro utilizador alterou este registo. Atualize antes de guardar.':status===401?'Sessão expirada. Entre novamente.':status===403?'Não tem acesso a esta operação.':status===429?'Limite de pedidos atingido. Aguarde.':'Não foi possível concluir a operação.');}
 return data;
}
export function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=' )).filter(x=>x.length===2));}
export async function identify(req){const token=cookies(req)['__Host-cc'];if(!token)throw new HttpError(401,'Entre para continuar.');const user=await sb('/auth/v1/user',{token});if(!user?.id||!user.email_confirmed_at)throw new HttpError(401,'Conta não confirmada.');const memberships=await sb('/rest/v1/cc_memberships?select=company_id,role,client_id',{token});if(!memberships?.length)throw new HttpError(403,'A sua conta ainda não tem acesso atribuído.');const allowed=await sb('/rest/v1/rpc/cc_consume_request',{token,method:'POST',body:{}});if(!allowed)throw new HttpError(429,'Limite de pedidos atingido. Aguarde um minuto.');return {token,user,memberships};}
export function sessionCookie(res,token,maxAge=3600){res.setHeader('Set-Cookie',`__Host-cc=${token||''}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${token?Math.min(maxAge,3600):0}`);}
export function response(res,status,data){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.status(status).json(data);}
export function failure(res,error){if(!(error instanceof HttpError))console.error(JSON.stringify({event:'request_failed',code:'internal'}));response(res,error.status||500,{error:error.status?error.message:'Ocorreu um erro. Tente novamente.'});}
