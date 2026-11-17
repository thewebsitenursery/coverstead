import '../env.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {managedRegistry} from '../managed.js';

// Restic encrypts before upload. Its repository credentials and encryption
// password belong in the separate private operator environment, never a venue.
const directory=path.dirname(path.resolve(process.env.ENV_FILE||'data/config.env'));
if(!process.env.RESTIC_REPOSITORY||!process.env.RESTIC_PASSWORD_FILE)throw Error('Configure an off-server Restic repository and private password file first.');
if(!/^(s3:|b2:|sftp:|rest:https:\/\/)/.test(process.env.RESTIC_REPOSITORY))throw Error('Use an off-server repository, not a local backup folder.');
if(fs.statSync(process.env.RESTIC_PASSWORD_FILE).mode&0o077)throw Error('Backup password file must be private.');
const command=process.env.RESTIC_BINARY||'restic';
const registry=managedRegistry(process.env.MANAGED_ROOT);
const backupRoots=[process.env.BACKUP_DIR,...(registry?.read().venues||[]).map(v=>path.join(registry.root,v.slug,'backups'))].filter(Boolean);
const selected=[];
for(const root of backupRoots){
 const candidates=fs.readdirSync(root).filter(n=>/^\d{4}-\d{2}-\d{2}T/.test(n)&&fs.existsSync(path.join(root,n,'snapshot.json'))).sort();
 const last=candidates.at(-1);if(!last)throw Error('A complete worker snapshot is required before offsite backup.');
 const snapshot=path.join(root,last);const meta=JSON.parse(fs.readFileSync(path.join(snapshot,'snapshot.json'),'utf8'));
 if(Date.now()-Date.parse(meta.created)>2*3600e3)throw Error('Worker snapshot is stale.');
 selected.push(snapshot);
}
if(!selected.length)throw Error('No complete snapshots to copy.');
// Include release source and the private registry. Do not copy live databases,
// enquiry records, socket files, logs, or the encryption-password file.
if(registry)selected.push(path.join(registry.root,'registry.json'));
const source=path.resolve('public/downloads/coverstead-community.zip');if(!fs.existsSync(source))throw Error('Build the matching source archive before backing up.');selected.push(source);
for(const args of [['backup','--quiet','--tag','coverstead-managed',...selected],['check','--read-data-subset=10%'],['forget','--tag','coverstead-managed','--group-by','host,tags','--keep-within','35d','--keep-last','1','--prune'],['check']]){
 const result=spawnSync(command,args,{env:process.env,stdio:['ignore','ignore','pipe'],timeout:600000});
 if(result.status!==0)throw Error('Off-server backup/check failed. Inspect the private storage configuration; no success marker was written.');
}
// Product enquiries have a separate short recovery window. They never enter
// the 35-day venue snapshots or source archive. Source files are atomic JSON
// records; expiry/deletion racing a read can only omit that record.
if(process.env.ENQUIRY_RECOVERY_DIR){
 const input=path.resolve(process.env.ENQUIRY_RECOVERY_DIR),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-enquiries-'));
 fs.chmodSync(temporary,0o700);
 try{
  if(fs.existsSync(input)){
   if(!fs.lstatSync(input).isDirectory())throw Error('Enquiry recovery requires a regular directory.');
   for(const entry of fs.readdirSync(input)){
    if(!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}\.json$/i.test(entry))continue;
    const source=path.join(input,entry);let contents;
    try{if(!fs.lstatSync(source).isFile())throw Error('Enquiry recovery refuses non-regular files.');contents=fs.readFileSync(source);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    const record=JSON.parse(contents),created=Date.parse(record.created);
    if(record.id+'.json'!==entry||!Number.isFinite(created))throw Error('Invalid enquiry recovery record.');
    if(created<Date.now()-90*86400e3)continue;
    fs.writeFileSync(path.join(temporary,entry),contents,{mode:0o600});
   }
  }
  fs.writeFileSync(path.join(temporary,'recovery.json'),JSON.stringify({version:1,created:new Date().toISOString(),purpose:'Private enquiry recovery; review expiry and deletions before restoring'})+'\n',{mode:0o600});
  for(const args of [['backup','--quiet','--tag','coverstead-enquiries',temporary],['forget','--tag','coverstead-enquiries','--group-by','host,tags','--keep-within','7d','--prune'],['check']]){
   const result=spawnSync(command,args,{env:process.env,stdio:['ignore','ignore','pipe'],timeout:600000});
   if(result.status!==0)throw Error('Private enquiry recovery backup/check failed.');
  }
 }finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
const status=process.env.OFFSITE_STATUS_FILE||path.join(directory,'offsite-status.json');fs.writeFileSync(status+'.tmp',JSON.stringify({verifiedAt:Date.now(),snapshotCount:backupRoots.length})+'\n',{mode:0o600});fs.renameSync(status+'.tmp',status);
console.log('Encrypted off-server backup completed and repository sample checked. Perform a full restore rehearsal before first customer use.');
