/* Versioned, authenticated encrypted envelope. No key or plaintext is persisted. */
const VaultCrypto=(()=>{
 const iterations=600000,enc=new TextEncoder(),dec=new TextDecoder();
 const b64=bytes=>btoa(Array.from(new Uint8Array(bytes),b=>String.fromCharCode(b)).join(''));
 const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 function validate(e){if(!e||e.format!=='blendd-vault'||e.version!==1||e.iterations!==iterations||typeof e.salt!=='string'||typeof e.iv!=='string'||typeof e.ciphertext!=='string'||bytes(e.salt).length!==16||bytes(e.iv).length!==12||e.ciphertext.length>1000000)throw Error('Cópia do cofre inválida.');return e}
 async function key(password,salt){const material=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:bytes(salt),iterations},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
 async function seal(records,k,salt){const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('blendd-vault:1'),tagLength:128},k,enc.encode(JSON.stringify(records)));return{format:'blendd-vault',version:1,iterations,salt,iv:b64(iv),ciphertext:b64(ciphertext)}}
 async function open(e,password){validate(e);const k=await key(password,e.salt);let records;try{records=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(e.iv),additionalData:enc.encode('blendd-vault:1'),tagLength:128},k,bytes(e.ciphertext))))}catch{throw Error('Palavra-passe incorreta ou cópia do cofre danificada.')}if(!Array.isArray(records)||records.some(r=>!r||typeof r.id!=='string'||typeof r.name!=='string'||typeof r.password!=='string'||!['Blendd','UP'].includes(r.company)))throw Error('Conteúdo do cofre inválido.');return{key:k,records}}
 async function create(password,records=[]){if(password.length<14)throw Error('Use uma frase-passe com pelo menos 14 caracteres.');const salt=b64(crypto.getRandomValues(new Uint8Array(16))),k=await key(password,salt);return{key:k,envelope:await seal(records,k,salt)}}
 return{create,open,seal,validate};
})();
