import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {createHash} from 'node:crypto';
import ipaddr from 'ipaddr.js';
import {load} from 'cheerio';
import sharp from 'sharp';
export const SOURCE_LIMIT=6, IMAGE_LIMIT=4, BYTE_LIMIT=3145728;
export function publicAddress(address){try{const a=ipaddr.process(address);return a.range()==='unicast';}catch{return false;}}
export function sourceUrl(value){if(value.length>2000)throw Error('URL demasiado longo');const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||u.hostname.endsWith('.local')||['localhost','accounts.google.com'].includes(u.hostname))throw Error('URL não permitido');u.hash='';return u;}
export function driveDownload(value){const u=sourceUrl(value);if(u.hostname==='drive.google.com'){const id=u.pathname.match(/^\/file\/d\/([\w-]+)/)?.[1]||u.searchParams.get('id');if(!id||!/^[-\w]{10,100}$/.test(id))throw Error('Use um link para um ficheiro do Drive, não uma pasta.');const target=new URL('https://drive.usercontent.google.com/download');target.searchParams.set('id',id);target.searchParams.set('export','download');if(u.searchParams.get('resourcekey'))target.searchParams.set('resourcekey',u.searchParams.get('resourcekey'));return target.href;}return u.href;}
// Resolve every redirect and pin the approved address to the actual TLS connection.
// No cookies, application credentials or referer are forwarded to external hosts.
export async function readPublic(value,{signal=AbortSignal.timeout(12000),resolve=lookup,request=https.request}={},depth=0){
 const u=sourceUrl(value);if(depth>3)throw Error('Demasiados redirecionamentos');signal.throwIfAborted();
 const host=u.hostname.replace(/^\[|\]$/g,'');const addresses=await Promise.race([resolve(host,{all:true,verbatim:true}),new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('Tempo de leitura excedido')),{once:true}))]);
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw Error('Destino não público');signal.throwIfAborted();const chosen=addresses[0];
 return new Promise((resolveResult,reject)=>{
  const req=request(u,{method:'GET',agent:false,signal,lookup:(_host,opts,cb)=>opts.all?cb(null,[chosen]):cb(null,chosen.address,chosen.family),headers:{Accept:'text/html,text/plain,image/jpeg,image/png,image/webp','Accept-Encoding':'identity','User-Agent':'BlenddCommandCenter/1.0'}},res=>{
   if([301,302,303,307,308].includes(res.statusCode)){res.destroy();try{readPublic(new URL(res.headers.location,u).href,{signal,resolve,request},depth+1).then(resolveResult,reject);}catch(e){reject(e);}return;}
   if(res.statusCode!==200){res.destroy();reject(Error('Fonte indisponível ou acesso restrito'));return;}
   if(Number(res.headers['content-length'])>BYTE_LIMIT){res.destroy();reject(Error('Ficheiro excede 3 MB'));return;}
   let size=0;const chunks=[];res.on('data',chunk=>{size+=chunk.length;if(size>BYTE_LIMIT){res.destroy(Error('Ficheiro excede 3 MB'));return;}chunks.push(chunk);});res.on('error',reject);res.on('end',()=>resolveResult({bytes:Buffer.concat(chunks),mime:String(res.headers['content-type']||'').split(';')[0],url:u.href}));
  });req.on('error',reject);req.end();
 });
}
export async function imageData(bytes){if(bytes.length>BYTE_LIMIT)throw Error('Imagem excede 3 MB');const b=await sharp(bytes,{limitInputPixels:25000000,animated:false}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:85}).toBuffer();return 'data:image/jpeg;base64,'+b.toString('base64');}
export function pageText(bytes,mime){if(mime==='text/plain')return bytes.toString('utf8').replace(/\s+/g,' ').trim().slice(0,6000);if(!['text/html','application/xhtml+xml'].includes(mime))throw Error('Formato não suportado para leitura automática');const $=load(bytes.toString('utf8'));$('script,style,nav,footer,header,form,iframe,noscript').remove();const root=$('main,article').first();const text=(root.length?root:$('body')).text().replace(/\s+/g,' ').trim();if(text.length<100||/sign in to continue|access denied|enable javascript and cookies|google drive.*virus scan/i.test(text.slice(0,1000)))throw Error('Página sem conteúdo acessível');return text.slice(0,6000);}
export function materialUrls(materials){return [...new Set(materials.flatMap(m=>((m.links||'')+'\n'+(m.raw||'')).match(/https:\/\/[^\s<>"']+/g)||[]).map(u=>u.replace(/[).,;]+$/,'')))];}
export async function collectSources(materials,{reader=readPublic,privateReader,signal=AbortSignal.timeout(15000)}={}){
 const urls=materialUrls(materials),docs=materials.flatMap(m=>m.documents||[]),tasks=[...urls.map(url=>({url})),...docs.map(d=>({fileId:d.fileId,name:d.fileName||'Anexo'}))];
 const reports=[],images=[];let totalText=0;
 // Bounded parallel reads; deterministic input order and shared overall deadline.
 const results=await Promise.all(tasks.slice(0,SOURCE_LIMIT).map(async source=>{try{const data=source.fileId?await privateReader(source.fileId,signal):await reader(driveDownload(source.url),{signal});return {source,data};}catch{return {source,error:'Não foi possível ler. Verifique permissões, formato e limite de 3 MB.'};}}));
 for(const {source,data,error} of results){const report={source:source.url||source.name,status:'failed'};if(error){report.message=error;reports.push(report);continue;}try{
  report.sha256=createHash('sha256').update(data.bytes).digest('hex');
  if(['image/jpeg','image/png','image/webp'].includes(data.mime)){
   if(images.length>=IMAGE_LIMIT)throw Error('Limite de quatro imagens por proposta');images.push({source:report.source,data:await imageData(data.bytes)});report.status='image';
  }else{const text=pageText(data.bytes,data.mime);report.text=text.slice(0,Math.max(0,24000-totalText));totalText+=report.text.length;if(!report.text)throw Error('Limite de texto das fontes atingido');report.status='text';}
 }catch(e){report.status='failed';report.message=e.message;}reports.push(report);}
 if(tasks.length>SOURCE_LIMIT)reports.push({source:'Outras fontes',status:'failed',message:`${tasks.length-SOURCE_LIMIT} fonte(s) não lida(s): limite de ${SOURCE_LIMIT} por proposta.`});
 return {reports,images};
}
