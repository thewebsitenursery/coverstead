import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const files=[];for(const dir of ['.','public','scripts','test'])for(const f of fs.readdirSync(dir))if(f.endsWith('.js'))files.push(path.join(dir,f));
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status)process.exit(r.status);}
console.log(`Syntax verified in ${files.length} JavaScript files.`);
