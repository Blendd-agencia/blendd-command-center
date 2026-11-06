import {isDeepStrictEqual} from 'node:util';
import {appOrigins} from '../lib/config.mjs';
import {sb,identify,response,failure} from '../lib/supabase.mjs';
import {sameOrigin,HttpError,uuid} from '../lib/validation.mjs';
import {fullAdmin,joinWorkspace,splitWorkspace,validateEnvelope} from '../lib/workspace-model.mjs';
export default async function handler(req,res){try{
 const session=await identify(req);if(!fullAdmin(session.memberships))throw new HttpError(403,'Esta área requer administração das duas empresas.');
 const rows=await sb('/rest/v1/cc_workspace_states?select=scope,payload,revision',{token:session.token});
 if(req.method==='GET')return response(res,200,{data:joinWorkspace(rows),revisions:Object.fromEntries(rows.map(r=>[r.scope,r.revision])),vault:rows.find(r=>r.scope==='vault')?.payload||null,user:{email:session.user.email}});
 if(req.method==='POST'){sameOrigin(req,appOrigins());splitWorkspace(req.body?.data);return response(res,200,{valid:true});}
 if(req.method!=='PUT')throw new HttpError(405,'Método não permitido.');sameOrigin(req,appOrigins());const body=req.body||{};uuid(body.operation_id);
 const changes=[];
 if(body.type==='vault'){validateEnvelope(body.envelope);if(body.envelope===null)throw new HttpError(400,'Não pode apagar o cofre por esta operação.');changes.push({scope:'vault',revision:body.revision,payload:body.envelope});}
 else{const parts=splitWorkspace(body.data);for(const scope of ['Blendd','UP','global'])if(!isDeepStrictEqual(parts[scope],rows.find(r=>r.scope===scope)?.payload))changes.push({scope,revision:body.revisions?.[scope],payload:parts[scope]});}
 for(const c of changes)if(!Number.isSafeInteger(c.revision)||c.revision<1)throw new HttpError(400,'Revisão inválida.');
 if(!changes.length)return response(res,200,{revisions:Object.fromEntries(rows.map(r=>[r.scope,r.revision]))});
 const revisions=await sb('/rest/v1/rpc/cc_save_workspace',{method:'POST',token:session.token,body:{changes,operation_id:body.operation_id}});response(res,200,{revisions});
 }catch(e){failure(res,e);}}
