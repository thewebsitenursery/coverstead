import '../env.js';
import fs from 'node:fs';
import path from 'node:path';
const directory=path.dirname(path.resolve(process.env.ENV_FILE||'data/config.env'));
const issues=[];let status;
try{status=JSON.parse(fs.readFileSync(path.join(directory,'sockets/status.json'),'utf8'));}catch{issues.push('Gateway monitoring record is missing.');}
if(status){
 if(Date.now()-status.updated>180000)issues.push('Gateway monitoring record is stale.');
 for(const worker of status.workers){
  if(!worker.ready)issues.push(worker.name+': worker is unavailable.');
  if(worker.backupError||!worker.backupAt||Date.now()-worker.backupAt>2*3600e3)issues.push(worker.name+': recent consistent backup is missing or failed.');
 }
}
let offsite;
try{offsite=JSON.parse(fs.readFileSync(path.join(directory,'offsite-status.json'),'utf8'));}catch{}
if(!offsite?.verifiedAt||Date.now()-offsite.verifiedAt>26*3600e3)issues.push('Verified off-server backup is missing or older than 26 hours.');
console.log(JSON.stringify({status:issues.length?'attention':'healthy',workers:status?.workers.length||0,issues},null,2));
if(issues.length)process.exitCode=1;
