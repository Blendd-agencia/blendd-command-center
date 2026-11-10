import {appOrigins} from '../lib/config.mjs';
import {sb,identify,sessionCookie,refreshCookie,accessRemaining,response,failure,cookies} from '../lib/supabase.mjs';
import {HttpError,sameOrigin} from '../lib/validation.mjs';
export default async function handler(req,res){try{
 if(req.method==='GET'){const {user,memberships,token}=await identify(req);return response(res,200,{email:user.email,memberships,expires_in:accessRemaining(token)});}
 sameOrigin(req,appOrigins());
 if(req.method==='DELETE'){
  let token=cookies(req)['__Host-cc'];
  const refresh=cookies(req)['__Host-cc-refresh'];
  if(!token&&refresh){try{token=(await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refresh}})).access_token;}catch(e){if(e.status!==400&&e.status!==401)throw e;}}
  if(token){try{await sb('/auth/v1/logout?scope=local',{method:'POST',token});}catch(e){if(e.status!==401)throw e;}}
  sessionCookie(res,null);refreshCookie(res,null);return response(res,200,{ok:true});
 }
 if(req.method!=='POST')throw new HttpError(405,'Método não permitido.');
 const {email,password,action,expected_email}=req.body||{};
 if(expected_email!==undefined&&(typeof expected_email!=='string'||expected_email.length>254))throw new HttpError(400,'Conta inválida.');
 let data;
 if(action==='refresh'){
  const refresh=cookies(req)['__Host-cc-refresh'];
  if(!refresh)throw new HttpError(401,'Confirme a sua entrada para continuar.');
  try{data=await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:refresh}});}
  catch(e){if(e.status===400||e.status===401)throw new HttpError(401,'Confirme a sua entrada para continuar.');throw e;}
 }else{
  if(typeof email!=='string'||email.length>254||typeof password!=='string'||!password||password.length>256)throw new HttpError(400,'Credenciais inválidas.');
  if(expected_email&&email.trim().toLowerCase()!==expected_email.toLowerCase())throw new HttpError(403,'Entre com a mesma conta para recuperar o trabalho.');
  data=await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
 }
 if(expected_email&&data.user?.email?.toLowerCase()!==expected_email.toLowerCase())throw new HttpError(401,'Entre com a mesma conta para recuperar o trabalho.');
 const memberships=await sb('/rest/v1/cc_memberships?select=company_id,role,client_id',{token:data.access_token});
 if(!data.user?.email_confirmed_at||!memberships?.length)throw new HttpError(403,'Conta sem acesso atribuído.');
 sessionCookie(res,data.access_token,data.expires_in);refreshCookie(res,data.refresh_token);
 response(res,200,{ok:true,email:data.user.email,expires_in:Math.min(data.expires_in,600)});
 }catch(e){failure(res,e);}}
