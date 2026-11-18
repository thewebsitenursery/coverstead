import '../env.js';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {managedRegistry} from '../managed.js';
const directory=path.dirname(path.resolve(process.env.ENV_FILE||'data/config.env'));
const issues=[];let status;
try{status=JSON.parse(fs.readFileSync(path.join(directory,'sockets/status.json'),'utf8'));}catch{issues.push('Gateway monitoring record is missing.');}
if(status){
 if(!Number.isFinite(status.updated)||Date.now()-status.updated>180000)issues.push('Gateway monitoring record is stale.');
 if(!Array.isArray(status.workers))issues.push('Gateway worker record is invalid.');
 for(const worker of Array.isArray(status.workers)?status.workers:[]){
  if(!worker.ready)issues.push(worker.name+': worker is unavailable.');
  if(!process.argv.includes('--workers-only')&&(worker.backupError||!worker.backupAt||Date.now()-worker.backupAt>2*3600e3))issues.push(worker.name+': recent consistent backup is missing or failed.');
 }
}
let offsite;
try{offsite=JSON.parse(fs.readFileSync(path.join(directory,'offsite-status.json'),'utf8'));}catch{}
if(!process.argv.includes('--workers-only')){
 if(!offsite?.verifiedAt||Date.now()-offsite.verifiedAt>26*3600e3)issues.push('Verified off-server backup is missing or older than 26 hours.');
 if(fs.existsSync(path.join(directory,'offsite-failed')))issues.push('The latest off-server backup attempt failed.');
}
// A ready IPC flag does not prove a worker is still answering requests.
try{
 const registry=managedRegistry(process.env.MANAGED_ROOT);
 const targets=[['product',new URL(process.env.PUBLIC_URL).hostname],...(registry?.read().venues||[]).map(v=>[v.slug,new URL(v.url).hostname])];
 if(status?.workers?.length!==targets.length)issues.push('Gateway worker count does not match the configured venues.');
 await Promise.all(targets.map(async([name,host])=>{try{await new Promise((resolve,reject)=>{const req=http.get({hostname:'127.0.0.1',port:Number(process.env.PORT),path:'/api/platform',headers:{Host:host,'X-Coverstead-Check':'1'}},response=>{response.resume();response.statusCode===200?resolve():reject(Error());});req.setTimeout(5000,()=>req.destroy(Error()));req.on('error',reject);});}catch{issues.push(name+': worker HTTP health check failed.');}}));
}catch{issues.push('Configured worker health checks could not run.');}
issues.sort();
console.log(JSON.stringify({status:issues.length?'attention':'healthy',workers:status?.workers?.length||0,issues},null,2));
if(issues.length)process.exitCode=1;
