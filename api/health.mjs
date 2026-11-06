import {identify,sb,response,failure} from '../lib/supabase.mjs';
export default async function handler(req,res){try{const {token}=await identify(req);await sb('/rest/v1/cc_companies?select=id&limit=1',{token});response(res,200,{database:'reachable',externalIntegrations:'not_configured'});}catch(e){failure(res,e);}}
