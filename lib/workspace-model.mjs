import {HttpError,plain} from './validation.mjs';
export const COMPANY_IDS={Blendd:'b1000000-0000-4000-8000-000000000001',UP:'b1000000-0000-4000-8000-000000000002'};
export const collections=['transactions','tasks','staff','billing','finance','financeLegacyBilling','debts','leads','clients','posts','clientDocuments','accessReferences','clientRequests','clientReports','clientIdeas','clientKpis'];
const clientCollections=new Set(['posts','clientDocuments','accessReferences','clientRequests','clientReports','clientIdeas','clientKpis']);
export function fullAdmin(memberships){return Object.values(COMPANY_IDS).every(id=>memberships.some(m=>m.company_id===id&&m.role==='admin'));}
export function validateWorkspace(db){
 if(!db||typeof db!=='object'||Array.isArray(db))throw new HttpError(400,'Cópia inválida.');plain(db);
 if(Buffer.byteLength(JSON.stringify(db))>1500000)throw new HttpError(413,'O conjunto de dados excede o limite desta versão.');
 const allowed=new Set([...collections,'marketing','financeVersion','alertSettings','source']);
 for(const k of Object.keys(db))if(!allowed.has(k))throw new HttpError(400,'Campo de aplicação desconhecido: '+k);
 const clients=new Map((db.clients||[]).map(c=>[String(c.id),c.company]));
 for(const key of collections){if(!Array.isArray(db[key]))throw new HttpError(400,'Coleção em falta: '+key);if(db[key].length>5000)throw new HttpError(413,'Demasiados registos.');const seen=new Set();for(const r of db[key]){
  if(!r||!['string','number'].includes(typeof r.id)||!/^[a-zA-Z0-9_-]{1,100}$/.test(String(r.id))||seen.has(String(r.id)))throw new HttpError(400,'Identificador inválido ou repetido em '+key);seen.add(String(r.id));
  const company=clientCollections.has(key)?clients.get(String(r.clientId)):r.company;
  if(!COMPANY_IDS[company])throw new HttpError(400,'Empresa ou cliente inválido em '+key);
  if(r.clientId&&clients.get(String(r.clientId))!==company)throw new HttpError(400,'Relação entre empresas inválida.');
  if(key==='finance'&&(!['retainers','oneoffs','fixed','variable'].includes(r.kind)||!r.months||!Array.isArray(r.terms)||!Array.isArray(r.states)||!r.adjustments))throw new HttpError(400,'Registo financeiro inválido.');
 }}
 return db;
}
export function splitWorkspace(db){validateWorkspace(db);const out={Blendd:{},UP:{},global:{}};const cs=new Map(db.clients.map(c=>[String(c.id),c.company]));for(const company of ['Blendd','UP']){for(const key of collections)out[company][key]=db[key].filter(r=>(clientCollections.has(key)?cs.get(String(r.clientId)):r.company)===company);out[company].marketing=db.marketing?.[company]||{};}
 for(const k of ['financeVersion','alertSettings','source'])if(db[k]!==undefined)out.global[k]=db[k];return out;
}
export function joinWorkspace(rows){const by=Object.fromEntries(rows.map(r=>[r.scope,r.payload]));const out={...(by.global||{}),marketing:{}};for(const key of collections)out[key]=['Blendd','UP'].flatMap(c=>by[c]?.[key]||[]);for(const c of ['Blendd','UP'])out.marketing[c]=by[c]?.marketing||{};return out;}
export function validateEnvelope(e){if(e===null)return;if(!e||Object.keys(e).sort().join(',')!=='ciphertext,format,iterations,iv,salt,version'||e.format!=='blendd-vault'||e.version!==1||e.iterations!==600000||!['salt','iv','ciphertext'].every(k=>typeof e[k]==='string'&&/^[A-Za-z0-9+/]*={0,2}$/.test(e[k]))||Buffer.from(e.salt,'base64').length!==16||Buffer.from(e.iv,'base64').length!==12||Buffer.from(e.ciphertext,'base64').length<16||e.ciphertext.length>1000000)throw new HttpError(400,'Envelope cifrado inválido.');}
