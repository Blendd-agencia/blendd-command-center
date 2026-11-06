import {appOrigins} from '../lib/config.mjs';
import {sb,identify,response,failure} from '../lib/supabase.mjs';
import {HttpError,sameOrigin,validateRecord,uuid} from '../lib/validation.mjs';
export default async function handler(req,res){try{
 const {token,memberships}=await identify(req);
 if(req.method==='GET'){
  const kind=req.query?.resource||'records';
  const paths={companies:'/rest/v1/cc_companies?select=id,name',clients:'/rest/v1/cc_clients?select=id,company_id,name',records:'/rest/v1/cc_records?select=*&order=updated_at.desc&limit=1000',integrations:'/rest/v1/cc_integrations?select=*&order=provider',audit:'/rest/v1/cc_audit?select=*&order=at.desc&limit=100'};
  if(!paths[kind])throw new HttpError(400,'Recurso inválido.');return response(res,200,await sb(paths[kind],{token}));
 }
 sameOrigin(req,appOrigins());
 const body=req.body||{};
 if(req.method==='POST'&&req.query?.resource==='clients'){
  uuid(body.company_id);if(!memberships.some(m=>m.company_id===body.company_id&&['admin','editor'].includes(m.role)))throw new HttpError(403,'Sem acesso.');
  if(typeof body.name!=='string'||!body.name.trim()||body.name.length>200)throw new HttpError(400,'Nome inválido.');
  return response(res,201,await sb('/rest/v1/cc_clients',{token,method:'POST',body:{id:uuid(body.id),company_id:body.company_id,name:body.name.trim()},headers:{Prefer:'return=representation'}}));
 }
 if(req.method==='PATCH'&&req.query?.resource==='integrations'){
  uuid(body.company_id);if(!memberships.some(m=>m.company_id===body.company_id&&m.role==='admin'))throw new HttpError(403,'Sem acesso.');
  if(!['supabase','moloni','email','otp','google_ads','meta','whatsapp','google_voice'].includes(body.provider)||!Number.isSafeInteger(body.monthly_limit_cents)||body.monthly_limit_cents<0||body.monthly_limit_cents>10000000||!Number.isInteger(body.timeout_seconds)||body.timeout_seconds<1||body.timeout_seconds>30)throw new HttpError(400,'Limites inválidos.');
  return response(res,200,await sb(`/rest/v1/cc_integrations?company_id=eq.${body.company_id}&provider=eq.${body.provider}`,{token,method:'PATCH',body:{monthly_limit_cents:body.monthly_limit_cents,timeout_seconds:body.timeout_seconds},headers:{Prefer:'return=representation'}}));
 }
 if(!['POST','PATCH'].includes(req.method))throw new HttpError(405,'Método não permitido.');validateRecord(body);
 if(!memberships.some(m=>m.company_id===body.company_id&&['admin','editor'].includes(m.role)))throw new HttpError(403,'Sem acesso de gestão.');
 if(req.method==='POST')return response(res,201,await sb('/rest/v1/cc_records',{token,method:'POST',body:{id:uuid(body.id),company_id:body.company_id,client_id:body.client_id||null,kind:body.kind,title:body.title.trim(),payload:body.payload,visibility:body.visibility},headers:{Prefer:'return=representation'}}));
 uuid(body.id);if(!Number.isSafeInteger(body.revision)||body.revision<1||typeof body.archived!=='boolean')throw new HttpError(400,'Revisão inválida.');
 response(res,200,await sb('/rest/v1/rpc/cc_update_record',{token,method:'POST',body:{record_id:body.id,expected_revision:body.revision,new_title:body.title.trim(),new_payload:body.payload,new_visibility:body.visibility,new_archived:body.archived}}));
 }catch(e){failure(res,e);}}
