import {sb,identify,sessionCookie,response,failure,cookies} from '../lib/supabase.mjs';
import {HttpError,sameOrigin} from '../lib/validation.mjs';
export default async function handler(req,res){try{
 if(req.method==='GET'){const {user,memberships}=await identify(req);return response(res,200,{email:user.email,memberships});}
 sameOrigin(req,process.env.APP_ORIGIN);
 if(req.method==='DELETE'){const token=cookies(req)['__Host-cc'];sessionCookie(res,null);if(token)await sb('/auth/v1/logout',{method:'POST',token});return response(res,200,{ok:true});}
 if(req.method!=='POST')throw new HttpError(405,'Método não permitido.');
 const {email,password}=req.body||{};
 if(typeof email!=='string'||email.length>254||typeof password!=='string'||password.length>256)throw new HttpError(400,'Credenciais inválidas.');
 const data=await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});
 const memberships=await sb('/rest/v1/cc_memberships?select=company_id,role,client_id',{token:data.access_token});
 if(!data.user?.email_confirmed_at||!memberships?.length)throw new HttpError(403,'Conta sem acesso atribuído.');
 sessionCookie(res,data.access_token,data.expires_in);response(res,200,{ok:true});
 }catch(e){failure(res,e);}}
