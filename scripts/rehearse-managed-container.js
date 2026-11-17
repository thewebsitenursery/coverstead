// Exercises the staged Compose gateway using synthetic data in a unique volume.
// No production configuration, network DNS or cloud account access is used.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import http from 'node:http';
import dotenv from 'dotenv';
const image=process.argv[2];
if(!image||image.startsWith('-'))throw Error('Usage: node scripts/rehearse-managed-container.js IMAGE');
const name='cs-cloud-check-'+crypto.randomBytes(6).toString('hex');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),name)),data=path.join(temp,'data');
const volume=name+'-data',seed=name+'-seed';let volumeCreated=false,seedCreated=false,started=false;
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']}).trim();
const override=path.join(temp,'override.yaml');
fs.writeFileSync(override,`services:\n  coverstead:\n    volumes:\n      - rehearsal-data:/var/lib/coverstead\nvolumes:\n  rehearsal-data:\n    external: true\n    name: ${volume}\n`);
const env={...process.env,COVERSTEAD_IMAGE:image,COVERSTEAD_DATA_DIR:'/unused-synthetic-path',COVERSTEAD_LOCAL_PORT:'0'};
const compose=(...args)=>execFileSync('docker',['compose','-p',name,'-f','compose.managed.yaml','-f',override,...args],{env,encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']}).trim();
let container,url;
const venueHost='cloud-rehearsal.coverstead.net';
async function api(host,route,method='GET',body,cookie){
 return new Promise((resolve,reject)=>{
  const request=http.request(url+route,{method,headers:{Host:host,Origin:'https://'+host,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})}},response=>{
   const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>{const text=Buffer.concat(chunks).toString();let json;try{json=JSON.parse(text);}catch{}resolve({status:response.statusCode,text,json,cookie:response.headers['set-cookie']?.[0]?.split(';')[0]});});response.on('error',reject);
  });request.setTimeout(10000,()=>request.destroy(Error('Synthetic HTTP request timed out')));request.on('error',reject);request.end(body?JSON.stringify(body):undefined);
 });
}
async function ready(){
 for(let i=0;i<100;i++){try{if((await api('preview.coverstead.net','/api/platform')).status===200&&(await api(venueHost,'/api/platform')).status===200)return;}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
 throw Error('Managed container did not become ready.');
}
function address(){const ports=JSON.parse(docker('inspect','--format','{{json .NetworkSettings.Ports}}',container));assert.equal(ports['3100/tcp'][0].HostIp,'127.0.0.1');url='http://127.0.0.1:'+ports['3100/tcp'][0].HostPort;}
try{
 execFileSync(process.execPath,['scripts/cloud-stage.js',data],{stdio:'pipe'});
 assert.throws(()=>execFileSync(process.execPath,['scripts/cloud-stage.js',data],{stdio:'pipe'}));
 const rendered=JSON.parse(compose('config','--format','json'));
 assert.equal(rendered.services.coverstead.volumes[0].type,'volume');
 assert.equal(rendered.services.coverstead.volumes[0].source,'rehearsal-data');
 docker('volume','create','--label','coverstead.rehearsal='+name,volume);volumeCreated=true;
 docker('create','--name',seed,'--user','0','--entrypoint','chown','--mount','type=volume,src='+volume+',dst=/var/lib/coverstead',image,'-R','1000:1000','/var/lib/coverstead');seedCreated=true;
 docker('cp',data+'/.',seed+':/var/lib/coverstead');docker('start','--attach',seed);docker('rm',seed);seedCreated=false;
 started=true;compose('up','-d','--no-build','--pull','never','coverstead');container=compose('ps','-q','coverstead');address();await ready();
 assert.equal((await api('coverstead.net','/api/platform')).status,421);
 assert.equal((await api('rehearsal.coverstead.net','/api/platform')).status,421);
 assert.equal((await api('unknown.coverstead.net','/api/platform')).status,421);
 assert.equal((await api(venueHost,'/api/admin/bookings')).status,401);
 const configuration=dotenv.parse(fs.readFileSync(path.join(data,'managed/cloud-rehearsal/config.env')));
 const credentials={token:configuration.SETUP_TOKEN,name:'Synthetic Cloud Owner',email:'owner@example.invalid',password:crypto.randomBytes(24).toString('hex')};
 const owner=await api(venueHost,'/api/setup-owner','POST',credentials);assert.equal(owner.status,201,owner.text);
 const current=(await api(venueHost,'/api/admin/settings','GET',null,owner.cookie)).json.venue;
 assert.equal((await api(venueHost,'/api/admin/settings','PUT',{...current,name:'Synthetic Cloud Inn',email:'venue@example.invalid',phone:'01632 960123'},owner.cookie)).status,200);
 const day=new Date();day.setUTCDate(day.getUTCDate()+14);while(day.getUTCDay()!==2)day.setUTCDate(day.getUTCDate()+1);
 const booking={date:day.toISOString().slice(0,10),time:'12:00',size:2,name:'Synthetic Cloud Guest',phone:'01632 960123',email:'guest@example.invalid',booking_type:'standard',acknowledge:true,request_id:crypto.randomUUID()};
 const first=await api(venueHost,'/api/bookings','POST',booking);assert.equal(first.status,201,first.text);
 assert.equal((await api(venueHost,'/api/bookings','POST',booking)).json.reference,first.json.reference);
 assert.equal((await api('preview.coverstead.net','/api/admin/me','GET',null,owner.cookie)).status,401);
 compose('restart','coverstead');address();await ready();
 const login=await api(venueHost,'/api/login','POST',credentials);assert.equal(login.status,200,login.text);
 const diary=await api(venueHost,'/api/admin/bookings','GET',null,login.cookie);assert.equal(diary.json.bookings.length,1);assert.equal(diary.json.bookings[0].reference,first.json.reference);assert.equal(diary.json.mailConfigured,false);
 assert.equal(docker('exec',container,'id','-u'),'1000');
 const inspection=JSON.parse(docker('inspect',container))[0];assert.equal(inspection.HostConfig.ReadonlyRootfs,true);
 const release=docker('exec',container,'test','-s','/app/public/downloads/coverstead-community.zip');assert.equal(release,'');
 // Wait for the actual supervisor to ask its workers for consistent snapshots.
 let snapshots=false;
 for(let i=0;i<80;i++){
  try{docker('exec',container,'node','--input-type=module','-e',"import fs from 'node:fs';for(const p of ['/var/lib/coverstead/backups','/var/lib/coverstead/managed/cloud-rehearsal/backups']){if(!fs.readdirSync(p).some(n=>fs.existsSync(p+'/'+n+'/snapshot.json')))process.exit(1);}");snapshots=true;break;}catch{}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 assert.equal(snapshots,true,'Both workers must produce complete snapshots');
 const health=JSON.parse(docker('inspect','--format','{{json .State.Health}}',container));assert.equal(health.Status,'healthy');
 console.log(JSON.stringify({result:'passed',image,node:docker('exec',container,'node','--version'),checks:['loopback-only Compose deployment','fresh configuration refuses overwrite','production hostnames rejected','owner setup and customer booking','booking retry deduplication','product/venue session isolation','saved owner login and booking survive restart','non-root read-only runtime','product and venue consistent snapshots','Compose health check','matching source archive present'],limits:'Local synthetic rehearsal only. Cloud server, HTTPS, email receipt, offsite restore and Stripe delivery still require verification.'},null,2));
}catch(error){
 if(container)try{console.error(docker('logs','--tail','30',container));}catch{}
 throw error;
}finally{
 if(started)try{compose('down','--timeout','20');}catch{console.error('Inspect owned rehearsal project: '+name);}
 if(seedCreated)try{docker('rm','--force',seed);}catch{}
 if(volumeCreated)try{docker('volume','rm',volume);}catch{console.error('Inspect owned rehearsal volume: '+volume);}
 fs.rmSync(temp,{recursive:true,force:true});
}
