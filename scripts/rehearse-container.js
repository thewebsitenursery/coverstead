// Optional integration rehearsal; needs an already built Coverstead Docker image.
// Creates and removes only its own uniquely named containers and synthetic volumes.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const image=process.argv[2];
if(!image||image.startsWith('-'))throw Error('Usage: node scripts/rehearse-container.js IMAGE');
const tag='coverstead-rehearsal-'+crypto.randomBytes(6).toString('hex');
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),tag+'-')),containers=[],volumes=[];
const token=crypto.randomBytes(32).toString('hex'),password=crypto.randomBytes(24).toString('hex');
const envFile=path.join(temporary,'synthetic.env'),origin='http://localhost:3100';
fs.writeFileSync(envFile,`PUBLIC_URL=${origin}\nCOOKIE_SECURE=false\nENV_FILE=/dev/null\nDB_PATH=/app/data/coverstead.sqlite\nASSET_PATH=/app/data/assets\nDEMO_MODE=false\nEDITION=community\nSETUP_TOKEN=${token}\nSTRIPE_BILLING_ENABLED=false\nSMTP_HOST=\nEMAIL_DNS_READY=false\nENQUIRIES_ENABLED=false\nBILLING_EMAIL_ENABLED=false\n`,{mode:0o600});
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:120000,stdio:['ignore','pipe','pipe']}).trim();
const containerURL=name=>'http://127.0.0.1:'+JSON.parse(docker('inspect','--format','{{json .NetworkSettings.Ports}}',name))['3100/tcp'][0].HostPort;
async function api(url,route,method='GET',body,cookie){
 const response=await fetch(url+route,{method,headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:cookie}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10000)});
 const text=await response.text();let json;try{json=JSON.parse(text);}catch{}
 return {status:response.status,text,json,cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function healthy(url){
 for(let i=0;i<60;i++){try{if((await api(url,'/api/platform')).status===200)return;}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
 throw Error('Rehearsal container did not become healthy.');
}
async function launch(suffix){
 const name=tag+'-'+suffix,volume=name+'-data';docker('volume','create','--label','coverstead.rehearsal='+tag,volume);volumes.push(volume);
 docker('run','--detach','--name',name,'--label','coverstead.rehearsal='+tag,'--env-file',envFile,'--publish','127.0.0.1::3100','--mount','type=volume,src='+volume+',dst=/app/data',image);containers.push(name);
 const url=containerURL(name);await healthy(url);return {name,url};
}
try{
 const a=await launch('one');assert.equal((await api(a.url,'/api/admin/bookings')).status,401);assert.equal((await api(a.url,'/api/demo-login','POST',{})).status,404);
 const credentials={name:'Synthetic Owner',email:'owner@example.invalid',password,token};
 const owner=await api(a.url,'/api/setup-owner','POST',credentials);assert.equal(owner.status,201,owner.text);
 const current=(await api(a.url,'/api/admin/settings','GET',null,owner.cookie)).json.venue;
 const saved=await api(a.url,'/api/admin/settings','PUT',{...current,name:'Synthetic Container Inn',email:'inn@example.invalid',phone:'01632 960123'},owner.cookie);assert.equal(saved.status,200,saved.text);
 const day=new Date();day.setUTCDate(day.getUTCDate()+14);while(day.getUTCDay()!==2)day.setUTCDate(day.getUTCDate()+1);
 const booking={date:day.toISOString().slice(0,10),time:'12:00',size:2,name:'Synthetic Container Guest',phone:'01632 960123',email:'guest@example.invalid',booking_type:'standard',acknowledge:true,request_id:crypto.randomUUID()};
 const first=await api(a.url,'/api/bookings','POST',booking);assert.equal(first.status,201,first.text);assert.equal((await api(a.url,'/api/bookings','POST',booking)).json.reference,first.json.reference);
 docker('restart',a.name);a.url=containerURL(a.name);await healthy(a.url);
 const login=await api(a.url,'/api/login','POST',credentials);assert.equal(login.status,200,login.text);
 const diary=await api(a.url,'/api/admin/bookings','GET',null,login.cookie);assert.equal(diary.json.bookings.length,1);assert.equal(diary.json.bookings[0].reference,first.json.reference);assert.equal(diary.json.mailConfigured,false);
 const b=await launch('two');assert.equal((await api(b.url,'/api/admin/bookings','GET',null,login.cookie)).status,401);
 const second=await api(b.url,'/api/setup-owner','POST',{...credentials,name:'Other Synthetic Owner'});assert.equal(second.status,201,second.text);
 const settings=(await api(b.url,'/api/admin/settings','GET',null,second.cookie)).json.venue;assert.notEqual(settings.name,'Synthetic Container Inn');
 assert.equal((await api(b.url,'/api/admin/settings','PUT',{...settings,name:'Separate Synthetic Inn',email:'other@example.invalid',phone:'01632 960124'},second.cookie)).status,200);
 assert.equal((await api(b.url,'/api/admin/bookings','GET',null,second.cookie)).json.bookings.length,0);
 assert.equal(docker('exec',a.name,'id','-u'),'1000');
 console.log(JSON.stringify({result:'passed',image,nonRoot:true,ownerBootstrap:true,bookingRetryDeduplicated:true,bookingSurvivedRestart:true,secondInstallationIsolated:true,mailAndStripeDisabled:true,syntheticOnly:true},null,2));
} catch(error) {
 for(const name of containers)try{console.error('Synthetic container diagnostics for '+name+'\n'+docker('logs','--tail','15',name));}catch{}
 throw error;
} finally {
 for(const name of containers.reverse())try{docker('rm','--force',name);}catch{console.error('Remove owned rehearsal container manually: '+name);}
 for(const volume of volumes)try{docker('volume','rm',volume);}catch{console.error('Remove owned rehearsal volume manually: '+volume);}
 fs.rmSync(temporary,{recursive:true,force:true});
}
