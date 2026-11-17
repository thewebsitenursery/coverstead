import '../env.js';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import nodemailer from 'nodemailer';
const directory=path.dirname(path.resolve(process.env.ENV_FILE||'data/config.env'));
const check=spawnSync(process.execPath,['scripts/managed-health.js'],{env:process.env,encoding:'utf8',timeout:15000});
let report;try{report=JSON.parse(check.stdout);}catch{report={status:'attention',issues:['Health diagnostic failed.']};}
try{await new Promise((resolve,reject)=>{const request=http.get({hostname:'127.0.0.1',port:Number(process.env.PORT),path:'/api/platform',headers:{Host:'coverstead.net','X-Coverstead-Check':'1'}},response=>{response.resume();response.statusCode===200?resolve():reject(Error());});request.setTimeout(5000,()=>request.destroy(Error('Health request timed out')));request.on('error',reject);});}catch{report.status='attention';report.issues.push('Coverstead public worker is not responding.');}
console.log(JSON.stringify(report));
const enabled=process.env.MANAGED_ALERTS_ENABLED==='true';
const stateFile=path.join(directory,'monitor-alert.json');let previous;try{previous=JSON.parse(fs.readFileSync(stateFile,'utf8'));}catch{}
const signature=JSON.stringify({status:report.status,issues:report.issues});
if(enabled&&(process.argv.includes('--test')||previous?.signature!==signature||report.status==='attention'&&Date.now()-(previous?.sentAt||0)>6*3600e3)){
 const transport=nodemailer.createTransport({sendmail:true,path:'/usr/sbin/sendmail',newline:'unix'});
 try{
  await transport.sendMail({from:'Coverstead monitoring <hello@coverstead.net>',to:'hello@coverstead.net',subject:'Coverstead monitoring: '+(process.argv.includes('--test')?'delivery test':report.status),text:'Coverstead hosted-service monitoring\n\n'+(report.issues.length?report.issues.join('\n'):'Workers and recent backup checks passed.')+'\n\nNo guest data is included. Check the private operator records for details.\n'});
  fs.writeFileSync(stateFile+'.tmp',JSON.stringify({signature,sentAt:Date.now()})+'\n',{mode:0o600});fs.renameSync(stateFile+'.tmp',stateFile);
  console.log('Monitoring message accepted by the local mail service.');
 }catch{console.error('Monitoring email failed; no delivery marker written.');process.exitCode=1;}finally{transport.close?.();}
}
if(report.status!=='healthy')process.exitCode=1;
