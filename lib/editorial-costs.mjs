// Standard Gateway catalog prices checked 2026-11-11, USD per million tokens.
// Preserve this snapshot on each new job; old jobs use this documented estimate.
export const RATES={ 'openai/gpt-4.1':{input:2,cached:0.5,output:8},'openai/gpt-6-astra':{input:10,cached:1,output:50} };
export function costEstimate(usage,model){
 if(usage?.providerAttempted===false)return {usd:0,basis:'not-called'};
 if(usage?.cost?.basis==='token-estimate'&&Number.isFinite(usage.cost.usd)&&usage.cost.usd>=0)return usage.cost;
 const rates=RATES[model],input=usage?.inputTokens,output=usage?.outputTokens;
 if(!rates||!Number.isFinite(input)||!Number.isFinite(output)||input<0||output<0)return {usd:null,basis:'unknown'};
 const cached=Math.min(input,Math.max(0,Number(usage.cachedInputTokens)||0));
 return {usd:Number(((input-cached)*rates.input/1e6+cached*rates.cached/1e6+output*rates.output/1e6).toFixed(8)),basis:'token-estimate',currency:'USD',rates,pricingDate:'2026-11-11',cacheKnown:Number.isFinite(usage.cachedInputTokens)};
}
export function usageFromProvider(raw,model){const u=raw?.usage;const usage={model,providerAttempted:true};
 if(Number.isFinite(u?.prompt_tokens))usage.inputTokens=u.prompt_tokens;
 if(Number.isFinite(u?.completion_tokens))usage.outputTokens=u.completion_tokens;
 if(Number.isFinite(u?.prompt_tokens_details?.cached_tokens))usage.cachedInputTokens=u.prompt_tokens_details.cached_tokens;
 usage.cost=costEstimate(usage,model);return usage;
}
export function lisbonMonth(value){const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit'}).formatToParts(new Date(value));return parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;}
export function monthlyCosts(jobs,clientId,month){
 const rows=jobs.filter(j=>j.client_id===clientId&&lisbonMonth(j.created_at)===month);
 let total=0,unknown=0;const history=rows.map(j=>{const cost=costEstimate(j.usage,j.model);if(cost.usd===null)unknown++;else total+=cost.usd;return {...j,cost};});
 return {clientId,month,currency:'USD',estimatedUsd:Number(total.toFixed(8)),requests:rows.length,completed:rows.filter(j=>j.status==='complete').length,failed:rows.filter(j=>j.status==='failed').length,running:rows.filter(j=>j.status==='running').length,unknownCostRequests:unknown,jobs:history};
}
