import {execFileSync} from 'node:child_process';
import {readdirSync,readFileSync} from 'node:fs';
for(const directory of ['api','lib','public'])for(const name of readdirSync(directory))if(/\.(js|mjs)$/.test(name))execFileSync(process.execPath,['--check',`${directory}/${name}`],{stdio:'inherit'});
const html=readFileSync('public/index.html','utf8');if(/\bon[a-z]+\s*=|<script[^>]*>\s*[^<\s]/i.test(html))throw Error('Inline execution forbidden by CSP');
console.log('Build checks passed. Static assets and server functions ready.');
