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
  const child=spawnSync(process.execPath,['--input-type=module','-e',`import './server.js';import {run,transaction} from './store.js';import {snapshotManaged} from './managed-backup.js';transaction(()=>run("INSERT INTO bookings(id,reference,name,status) VALUES('test','TEST','Synthetic','confirmed')"));console.log(JSON.stringify(snapshotManaged()));`],{env,encoding:'utf8',timeout:10000});
  assert.equal(child.status,0,child.stderr);const snapshot=JSON.parse(child.stdout).directory;
  assert.equal(fs.existsSync(path.join(snapshot,'enquiries')),false);assert.equal(fs.statSync(path.join(snapshot,'config.env')).mode&0o777,0o600);
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
