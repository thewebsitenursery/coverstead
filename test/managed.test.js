import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,fork} from 'node:child_process';
import {managedRegistry,serviceAccess,readinessChecks} from '../managed.js';
import {stripeMode} from '../billing-mode.js';

test('managed invitation validation, readiness and dated entitlement grace',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-registry-'));
 try{
  execFileSync(process.execPath,['scripts/managed-venue.js','create',root,'sample-pub','owner@example.invalid','test']);
  const registry=managedRegistry(root);assert.equal(registry.status('owner@example.invalid','test').ready,false);assert.equal(registry.find('owner@example.invalid','live'),undefined);
  const state=registry.read();state.venues[0].checks=Object.fromEntries(readinessChecks.map(k=>[k,'Synthetic evidence only']));fs.writeFileSync(path.join(root,'registry.json'),JSON.stringify(state));
  assert.equal(registry.status('owner@example.invalid','test').ready,true);
  registry.entitlement('owner@example.invalid','test',{id:'sub_fixture',status:'trialing'});
  const file=path.join(root,'sample-pub','entitlement.json');assert.equal(serviceAccess(file).allowed,true);assert.equal(serviceAccess(file,Date.now()+49*3600e3).allowed,false);
  registry.entitlement('owner@example.invalid','test',{id:'sub_fixture',status:'past_due'});const past=JSON.parse(fs.readFileSync(file));assert.equal(serviceAccess(file).allowed,true);
  past.pastDueSince=Date.now()-8*86400e3;fs.writeFileSync(file,JSON.stringify(past));assert.equal(serviceAccess(file).allowed,false);
  registry.entitlement('owner@example.invalid','test',{id:'sub_fixture',status:'active'});assert.equal(serviceAccess(file).allowed,true);
  registry.entitlement('owner@example.invalid','test',{id:'sub_fixture',status:'canceled'});assert.equal(serviceAccess(file).allowed,false);
  state.venues[0].url='https://another-company.example';fs.writeFileSync(path.join(root,'registry.json'),JSON.stringify(state));assert.throws(()=>registry.read(),/address/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('live Stripe mode requires explicit evidence and a matching key',()=>{
 assert.equal(stripeMode({key:'sk_test_fixture'}),'test');
 assert.throws(()=>stripeMode({key:'sk_live_fixture'}),/test keys only/);
 assert.throws(()=>stripeMode({mode:'live',key:'sk_live_fixture'}),/launch record/);
 assert.throws(()=>stripeMode({mode:'live',key:'sk_test_fixture'}),/key mode/);
});

test('gateway isolates venue owners, rejects unknown hosts and restores data after restart',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-gateway-'));let gateway;const workerPids=new Map();
 const configs=[];
 const managed=path.join(root,'managed');
 for(const slug of ['first-pub','second-pub']){
  execFileSync(process.execPath,['scripts/managed-venue.js','create',managed,slug,slug+'@example.invalid','test']);
  configs.push(fs.readFileSync(path.join(managed,slug,'config.env'),'utf8'));
 }
 const config=path.join(root,'config.env');fs.writeFileSync(config,`PUBLIC_URL=https://coverstead.net\nPORT=0\nHOST=127.0.0.1\nDB_PATH=${root}/product.sqlite\nASSET_PATH=${root}/assets\nMANAGED_ROOT=${managed}\nSTRIPE_BILLING_ENABLED=false\n`);
 async function start(){gateway=fork('managed-gateway.js',[],{env:{PATH:process.env.PATH,ENV_FILE:config},stdio:['ignore','ignore','pipe','ipc']});let errors='';gateway.stderr.on('data',b=>{errors+=b;});return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Gateway failed: '+errors)),15000);gateway.on('message',m=>{if(m.workerReady)workerPids.set(m.workerReady,m.pid);if(m.gatewayReady){clearTimeout(timer);resolve(m.port);}});gateway.once('exit',()=>{clearTimeout(timer);reject(Error(errors));});});}
 async function stop(){if(gateway.exitCode!==null||gateway.signalCode!==null){gateway=null;return;}const exited=new Promise(resolve=>gateway.once('exit',resolve));gateway.kill('SIGTERM');await exited;gateway=null;}
 let port;
 async function call(host,url,method='GET',body,cookie){return new Promise((resolve,reject)=>{const r=http.request({hostname:'127.0.0.1',port,path:url,method,headers:{Host:host,Origin:'https://'+host,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})}},response=>{const chunks=[];response.on('data',c=>chunks.push(c));response.on('end',()=>{const text=Buffer.concat(chunks).toString();resolve({status:response.statusCode,headers:{get:name=>{const value=response.headers[name];return Array.isArray(value)?value[0]:value;}},json:async()=>JSON.parse(text),text:async()=>text});});});r.on('error',reject);r.end(body?JSON.stringify(body):undefined);});}
 async function ready(host){let last;for(let n=0;n<100;n++){const r=await call(host,'/api/platform');if(r.status===200)return r.json();last=r.status+' '+await r.text();await new Promise(resolve=>setTimeout(resolve,100));}throw Error('Worker not ready: '+host+' '+last);}
 try{
  port=await start();await ready('coverstead.net');await ready('first-pub.coverstead.net');await ready('second-pub.coverstead.net');
  assert.equal((await call('unknown.coverstead.net','/api/platform')).status,421);
  const token=JSON.parse(configs[0].match(/^SETUP_TOKEN=(.+)$/m)[1]);
  const owner=await call('first-pub.coverstead.net','/api/setup-owner','POST',{token,email:'owner@example.invalid',name:'Synthetic Owner',password:'synthetic-owner-passphrase'});assert.equal(owner.status,201);const cookie=owner.headers.get('set-cookie').split(';')[0];
  assert.equal((await call('first-pub.coverstead.net','/api/admin/me','GET',undefined,cookie)).status,200);
  assert.equal((await call('second-pub.coverstead.net','/api/admin/me','GET',undefined,cookie)).status,401);
  assert.equal((await call('coverstead.net','/api/admin/me','GET',undefined,cookie)).status,401);
  assert.equal((await ready('first-pub.coverstead.net')).needsOwner,false);assert.equal((await ready('second-pub.coverstead.net')).needsOwner,true);
  const crashed=workerPids.get('first-pub');process.kill(crashed,'SIGKILL');
  for(let i=0;i<100&&workerPids.get('first-pub')===crashed;i++)await new Promise(resolve=>setTimeout(resolve,100));
  assert.notEqual(workerPids.get('first-pub'),crashed);assert.equal((await ready('first-pub.coverstead.net')).needsOwner,false);
  await stop();port=await start();assert.equal((await ready('first-pub.coverstead.net')).needsOwner,false);assert.equal((await ready('second-pub.coverstead.net')).needsOwner,true);
 }finally{if(gateway)await stop();fs.rmSync(root,{recursive:true,force:true});}
});
