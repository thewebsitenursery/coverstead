import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('running-worker snapshot restores exact database rows and excludes enquiries',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-snapshot-'));
 try{
  const env={PATH:process.env.PATH,ENV_FILE:path.join(root,'config.env'),PUBLIC_URL:'https://example.invalid',DB_PATH:path.join(root,'data.sqlite'),ASSET_PATH:path.join(root,'assets'),BACKUP_DIR:path.join(root,'backups'),NO_LISTEN:'true'};
  fs.writeFileSync(env.ENV_FILE,'STRIPE_BILLING_ENABLED=false\n');fs.mkdirSync(path.join(root,'enquiries'));fs.writeFileSync(path.join(root,'enquiries','private.json'),'Do not include enquiry records');
  env.MANAGED_LAUNCH_FILE=path.join(root,'launch.json');env.MANAGED_ENTITLEMENT=path.join(root,'entitlement.json');
  fs.writeFileSync(env.MANAGED_LAUNCH_FILE,JSON.stringify({purpose:'Synthetic launch evidence'}));fs.writeFileSync(env.MANAGED_ENTITLEMENT,JSON.stringify({status:'trialing',checkedAt:Date.now()}));
  const expired=path.join(env.BACKUP_DIR,'2020-01-01T00-00-00-000Z');fs.mkdirSync(expired,{recursive:true});fs.writeFileSync(path.join(expired,'snapshot.json'),JSON.stringify({version:1,created:'2020-01-01T00:00:00Z'}));
  const unrecognised=path.join(env.BACKUP_DIR,'2020-01-02T00-00-00-000Z');fs.mkdirSync(unrecognised);fs.writeFileSync(path.join(unrecognised,'operator-note'),'Retain for inspection');
  const child=spawnSync(process.execPath,['--input-type=module','-e',`import './server.js';import {run,transaction} from './store.js';import {snapshotManaged} from './managed-backup.js';transaction(()=>run("INSERT INTO bookings(id,reference,name,status) VALUES('test','TEST','Synthetic','confirmed')"));console.log(JSON.stringify(snapshotManaged()));`],{env,encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stderr);const snapshot=JSON.parse(child.stdout).directory;
  assert.equal(fs.existsSync(path.join(snapshot,'enquiries')),false);assert.equal(fs.statSync(path.join(snapshot,'config.env')).mode&0o777,0o600);
  for(const [source,name] of [[env.MANAGED_LAUNCH_FILE,'launch.json'],[env.MANAGED_ENTITLEMENT,'entitlement.json']]){
   const copied=path.join(snapshot,'operator',name);assert.equal(fs.readFileSync(copied,'utf8'),fs.readFileSync(source,'utf8'));assert.equal(fs.statSync(copied).mode&0o777,0o600);
  }
  assert.equal(fs.existsSync(expired),false);assert.equal(fs.existsSync(unrecognised),true);
  const restored=spawnSync(process.execPath,['scripts/rehearse-backup.js',snapshot],{encoding:'utf8',timeout:30000});assert.equal(restored.status,0,restored.stderr);assert.equal(JSON.parse(restored.stdout).result,'passed');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('failed offsite command never creates a successful backup marker',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-offsite-'));
 try{
  const backups=path.join(root,'backups');const stamp=new Date().toISOString().replace(/[:.]/g,'-');fs.mkdirSync(path.join(backups,stamp),{recursive:true});fs.writeFileSync(path.join(backups,stamp,'snapshot.json'),JSON.stringify({created:new Date().toISOString()}));
  const password=path.join(root,'password');fs.writeFileSync(password,'synthetic password',{mode:0o600});
  const result=spawnSync(process.execPath,['scripts/managed-offsite.js'],{env:{PATH:process.env.PATH,ENV_FILE:path.join(root,'none.env'),BACKUP_DIR:backups,RESTIC_PASSWORD_FILE:password,RESTIC_REPOSITORY:'s3:https://storage.example.invalid/test',RESTIC_BINARY:'/usr/bin/false'},encoding:'utf8',timeout:10000});
  assert.notEqual(result.status,0);assert.equal(fs.existsSync(path.join(root,'offsite-status.json')),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('enquiry recovery excludes expired and deleted records without replaying alerts',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-enquiry-recovery-'));
 try{
  const input=path.join(root,'restored'),output=path.join(root,'review'),deletions=path.join(root,'deletions.json');fs.mkdirSync(input);
  const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
  ids.forEach((id,index)=>fs.writeFileSync(path.join(input,id+'.json'),JSON.stringify({id,created:new Date(Date.now()-(index===1?91:0)*86400e3).toISOString(),message:'Synthetic enquiry',notification:{attempts:0}})));
  fs.writeFileSync(deletions,JSON.stringify([ids[2]]));
  const args=['scripts/recover-enquiries.js',input,output,deletions];
  const result=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(result.status,0,result.stderr);
  assert.equal(JSON.parse(result.stdout).restored,1);assert.equal(JSON.parse(result.stdout).omitted,2);
  const record=JSON.parse(fs.readFileSync(path.join(output,ids[0]+'.json')));assert.equal(record.notification.attempts,20);assert.equal(record.notification.acceptedAt,undefined);
  assert.equal(fs.statSync(path.join(output,ids[0]+'.json')).mode&0o777,0o600);
  assert.notEqual(spawnSync(process.execPath,args,{encoding:'utf8'}).status,0,'Never overwrite an existing inbox');
  assert.equal(JSON.parse(fs.readFileSync(path.join(input,ids[0]+'.json'))).notification.attempts,0,'Original recovery snapshot stays untouched');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
