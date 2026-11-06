// Project identifiers and publishable key are public configuration, never privileged credentials.
// Database access still requires a verified user token and is restricted by RLS.
export function backendConfig(env=process.env){
 return {url:env.SUPABASE_URL||'https://opdkslnhmvvmgymenetb.supabase.co',key:env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_CVXnQcNQNO1-WB94TZJjhQ_7wG_uufY'};
}
export function appOrigin(env=process.env){
 if(env.APP_ORIGIN){const u=new URL(env.APP_ORIGIN);if(u.protocol!=='https:'||u.origin!==env.APP_ORIGIN)throw Error('Invalid APP_ORIGIN');return u.origin;}
 // Never derive trusted origins from Host, X-Forwarded-Host or incoming Origin headers.
 const host=env.VERCEL_PROJECT_PRODUCTION_URL;
 if(!host||!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host))return undefined;
 return `https://${host}`;
}
