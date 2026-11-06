import {execFileSync} from 'node:child_process';
import {readdirSync,readFileSync,mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
const order=['cloud-prelude','backup-validation','finance','management','app','workspace','social','portal','client-content','post-mirror','crm-details','vault-crypto','password-controls','vault','cloud-bridge'];
mkdirSync('public/workspace/vendor',{recursive:true});
for(const name of readdirSync('workspace-src'))if(/\.css$/.test(name)||['index.html','boot.js','sanitize.js'].includes(name))copyFileSync('workspace-src/'+name,'public/workspace/'+name);
copyFileSync('node_modules/dompurify/dist/purify.min.js','public/workspace/vendor/purify.min.js');
writeFileSync('public/workspace/workspace.bundle.js','(()=>{\n'+order.map(n=>readFileSync('workspace-src/'+n+'.js','utf8')).join('\n;\n')+'\n})();');
for(const directory of ['api','lib','public','public/workspace'])for(const name of readdirSync(directory))if(/\.(js|mjs)$/.test(name))execFileSync(process.execPath,['--check',`${directory}/${name}`],{stdio:'inherit'});
console.log('Build checks passed.');
