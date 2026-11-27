import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve('public');
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())out.push(...await walk(f));else if(e.name.endsWith('.html'))out.push(f)}return out}
let n=0;
for(const f of await walk(root)){const h=await readFile(f,'utf8');const next=h.replace(/<link rel="canonical" href="[^"]*">/g,'');if(next!==h){await writeFile(f,next,'utf8');n++}}
console.log('removed source canonicals from '+n+' files');
