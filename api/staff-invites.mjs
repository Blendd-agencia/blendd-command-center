import {sb,identify,response,failure} from '../lib/supabase.mjs';
import {sameOrigin,HttpError} from '../lib/validation.mjs';
import {appOrigins} from '../lib/config.mjs';
import {fullAdmin} from '../lib/workspace-model.mjs';
export default async function handler(req,res){try{
 const session=await identify(req);
 if(!fullAdmin(session.memberships))throw new HttpError(403,'Acesso reservado à administração.');
 if(!['GET','POST'].includes(req.method))throw new HttpError(405,'Método não permitido.');
 if(req.method==='POST')sameOrigin(req,appOrigins());
 const action=req.method==='GET'?'list':req.body?.action;
 if(!['list','create','reveal','revoke','apply'].includes(action))throw new HttpError(400,'Pedido inválido.');
 const args=req.method==='GET'?{}:req.body?.args||{};
 if(Buffer.byteLength(JSON.stringify(args))>1000)throw new HttpError(413,'Pedido demasiado grande.');
 const result=await sb('/rest/v1/rpc/cc_staff_admin',{method:'POST',token:session.token,body:{action,args}});
 response(res,result.error?400:200,result);
 }catch(e){failure(res,e);}}
