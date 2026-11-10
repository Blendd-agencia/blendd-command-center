/* Tokens stay in HttpOnly cookies; this module only knows the signed-in email. */
const CCSession=(()=>{
 let email=null,renewal=null,prompt=null,timer=null;
 async function raw(url,options={}){
  const r=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(email?{'X-CC-User':email}:{}),...options.headers},signal:options.signal||AbortSignal.timeout(20000)});
  if(r.ok&&options.responseType==='blob')return r.blob();
  const data=await r.json();
  if(!r.ok){const e=Error(data.error||'Não foi possível concluir a operação.');e.status=r.status;throw e;}
  return data;
 }
 function plan(seconds=600){clearTimeout(timer);timer=setTimeout(()=>{if(document.visibilityState==='visible')ensure().catch(()=>{});else plan(120);},Math.max(30,seconds-90)*1000);}
 function start(identity){email=identity.email;plan(identity.expires_in);}
 function element(tag,text){const n=document.createElement(tag);if(text)n.textContent=text;return n;}
 function unlock(reason){
  if(prompt)return prompt;
  prompt=new Promise(resolve=>{
   const previous=document.activeElement;
   const dialog=element('dialog');dialog.id='sessionLock';dialog.setAttribute('aria-labelledby','sessionLockTitle');
   const form=element('form'),title=element('h2','Confirma a tua entrada');title.id='sessionLockTitle';
   const intro=element('p','A edição está suspensa. O formulário e as alterações por guardar continuam nesta janela. Não feches nem atualizes a página.');
   const identity=element('p',email),label=element('label','Palavra-passe'),input=element('input');
   input.type='password';input.autocomplete='current-password';input.required=true;input.maxLength=256;label.append(input);
   const username=element('input');username.type='email';username.autocomplete='username';username.value=email;username.readOnly=true;username.hidden=true;
   const status=element('p',reason||'A sessão precisa de ser validada.');status.setAttribute('role','alert');
   const submit=element('button','Entrar e continuar');submit.type='submit';submit.className='primary';
   const retry=element('button','Tentar restabelecer a ligação');retry.type='button';
   const finish=data=>{start(data);input.value='';dialog.close();dialog.remove();previous?.focus();resolve();};
   const attempt=async(fn)=>{submit.disabled=retry.disabled=true;status.textContent='A validar…';try{finish(await fn());}catch(e){status.textContent=e.status===400?'Não foi possível entrar. Confirma a palavra-passe.':e.message;}finally{submit.disabled=retry.disabled=false;}};
   form.onsubmit=e=>{e.preventDefault();const password=input.value;input.value='';attempt(()=>raw('/api/auth',{method:'POST',body:JSON.stringify({email,password,expected_email:email})}));};
   retry.onclick=()=>attempt(()=>refresh());
   dialog.addEventListener('cancel',e=>e.preventDefault());
   form.append(title,intro,identity,username,label,status,submit,retry);dialog.append(form);document.body.append(dialog);dialog.showModal();input.focus();
  }).finally(()=>{prompt=null;});return prompt;
 }
 async function refresh(){
  const run=()=>raw('/api/auth',{method:'POST',body:JSON.stringify({action:'refresh',expected_email:email})});
  // Serialize rotation between tabs sharing the same HttpOnly cookie jar.
  const data=await (navigator.locks?navigator.locks.request('cc-session-refresh',run):run());
  if(email&&data.email!==email)throw Object.assign(Error('Entre com a mesma conta para recuperar o trabalho.'),{status:401});
  plan(data.expires_in);return data;
 }
 async function ensure(){
  if(renewal)return renewal;
  renewal=(async()=>{try{const data=await raw('/api/auth');if(data.expires_in>90){plan(data.expires_in);return;}await refresh();}catch(e){
   // A transient failure must not clear cookies or discard pending work.
   try{if(e.status===401){await refresh();return;}}catch(refreshError){e=refreshError;}
   if(email)await unlock(e.message);else throw e;
  }})().finally(()=>{renewal=null;});return renewal;
 }
 async function request(url,options={}){
  if(url==='/api/auth'&&options.method&&options.method!=='GET')return raw(url,options);
  if(prompt)await prompt;
  try{return await raw(url,options);}catch(e){
   if(e.status!==401)throw e;
   await ensure();
   try{return await raw(url,options);}catch(retryError){
    if(retryError.status!==401||!email)throw retryError;
    await unlock(retryError.message);return raw(url,options);
   }
  }
 }
 window.addEventListener('focus',()=>{if(email)ensure().catch(()=>{});});
 document.addEventListener('visibilitychange',()=>{if(email&&document.visibilityState==='visible')ensure().catch(()=>{});});
 window.addEventListener('online',()=>{if(email)ensure().catch(()=>{});});
 return {request,start,ensure};
})();
