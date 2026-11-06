/* Shared eye/copy controls for every password input, including dynamic forms. */
const PasswordControls=(()=>{
 const eye='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
 const copy='<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg>';
 const timers=new Map();
 function hide(input){clearTimeout(timers.get(input));timers.delete(input);input.type='password';const b=input.parentElement?.querySelector('[data-password-eye]');if(b){b.setAttribute('aria-pressed','false');b.setAttribute('aria-label','Mostrar password');b.title='Mostrar password'}}
 function hideAll(){for(const input of timers.keys())hide(input)}
 async function copyText(text,label){if(!text)throw Error('O campo está vazio.');if(!navigator.clipboard?.writeText)throw Error('A cópia requer HTTPS e permissão do navegador.');await navigator.clipboard.writeText(text);notifyAction(label==='Username'?'Username copiado.':'Password copiada para a área de transferência.')}
 function enhance(root=document){for(const input of root.querySelectorAll('input[type="password"]')){if(input.dataset.passwordEnhanced)continue;input.dataset.passwordEnhanced='true';if(!input.getAttribute('aria-label'))input.setAttribute('aria-label',input.closest('label')?.textContent.trim()||'Password');const wrap=document.createElement('span');wrap.className='password-control';input.parentNode.insertBefore(wrap,input);wrap.appendChild(input);wrap.insertAdjacentHTML('beforeend',`<button type="button" data-password-eye aria-label="Mostrar password" title="Mostrar password" aria-pressed="false">${eye}</button><button type="button" data-password-copy aria-label="Copiar password" title="Copiar password">${copy}</button>`)}}
 document.addEventListener('click',async e=>{const b=e.target.closest('[data-password-eye],[data-password-copy]');if(!b)return;e.preventDefault();const input=b.parentElement.querySelector('input');if(b.hasAttribute('data-password-eye')){if(input.type==='text')hide(input);else{input.type='text';b.setAttribute('aria-pressed','true');b.setAttribute('aria-label','Ocultar password');b.title='Ocultar password';timers.set(input,setTimeout(()=>hide(input),15000))}}else try{await copyText(input.value,'Password')}catch(err){notifyAction(err.message)}});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)hideAll()});
 document.addEventListener('close',e=>{if(e.target.tagName==='DIALOG')for(const input of e.target.querySelectorAll('[data-password-enhanced]')){hide(input);input.value=''}},true);
 const observer=new MutationObserver(()=>enhance());observer.observe(document.body,{childList:true,subtree:true});enhance();
 return{eye,copy,copyText,hideAll,enhance};
})();
