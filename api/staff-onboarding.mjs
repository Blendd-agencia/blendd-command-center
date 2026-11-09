import {randomBytes} from 'node:crypto';
import {sb,cookies,response,failure} from '../lib/supabase.mjs';
import {sameOrigin,HttpError} from '../lib/validation.mjs';
import {appOrigins} from '../lib/config.mjs';
const cookie='__Host-cc-onboarding';
function setSession(res,value){res.setHeader('Set-Cookie',`${cookie}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${value?1800:0}`);}
export default async function handler(req,res){try{
 if(!['GET','POST'].includes(req.method))throw new HttpError(405,'Método não permitido.');
 const body=req.body||{};
 if(req.method==='POST')sameOrigin(req,appOrigins());
 if(Buffer.byteLength(JSON.stringify(body))>8000)throw new HttpError(413,'Formulário demasiado grande.');
 const action=req.method==='GET'?'read':body.action;
 if(!['open','read','submit'].includes(action))throw new HttpError(400,'Pedido inválido.');
 let session=cookies(req)[cookie]||null;
 if(action==='open')session=randomBytes(32).toString('hex');
 const result=await sb('/rest/v1/rpc/cc_staff_guest',{method:'POST',body:{action,token:action==='open'?body.token:null,code:action==='open'?body.code:null,session_token:session,fields:action==='submit'?body.fields:null}});
 if(result.error){if(action==='read')setSession(res,'');return response(res,400,{error:result.error});}
 if(action==='open')setSession(res,session);
 if(action==='submit')setSession(res,'');
 response(res,200,result);
 }catch(e){failure(res,e);}}
