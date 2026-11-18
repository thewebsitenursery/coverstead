import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import {spawn} from 'node:child_process';
test('monitor checks the configured host on a shared gateway without sending mail',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-monitor-'));
 const server=http.createServer((req,res)=>{res.statusCode=req.headers.host==='preview.example.invalid'?200:421;res.end('{}');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  fs.mkdirSync(path.join(root,'sockets'));fs.writeFileSync(path.join(root,'sockets/status.json'),JSON.stringify({updated:Date.now(),workers:[{name:'product',ready:true,backupAt:Date.now()}]}));fs.writeFileSync(path.join(root,'offsite-status.json'),JSON.stringify({verifiedAt:Date.now()}));
  const child=spawn(process.execPath,['scripts/managed-alert.js'],{env:{PATH:process.env.PATH,ENV_FILE:path.join(root,'none.env'),PUBLIC_URL:'https://preview.example.invalid',PORT:String(server.address().port)},stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
  const code=await new Promise(resolve=>child.once('exit',resolve));assert.equal(code,0,error);assert.equal(JSON.parse(output).status,'healthy');assert.equal(fs.existsSync(path.join(root,'monitor-alert.json')),false);
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});

test('health catches an unresponsive venue despite a healthy product and flags failed backups',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-worker-health-'));
 let broken=true;const hosts=[];
 const server=http.createServer((req,res)=>{hosts.push(req.headers.host);res.statusCode=broken&&req.headers.host==='synthetic.coverstead.net'?503:200;res.end('{}');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const run=async(...args)=>{const child=spawn(process.execPath,['scripts/managed-health.js',...args],{env:{PATH:process.env.PATH,ENV_FILE:path.join(root,'none.env'),MANAGED_ROOT:root,PUBLIC_URL:'https://preview.coverstead.net',PORT:String(server.address().port)},stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);const code=await new Promise(resolve=>child.once('exit',resolve));assert.equal(error,'');return {code,...JSON.parse(output)};};
 try{
  fs.mkdirSync(path.join(root,'sockets'));fs.writeFileSync(path.join(root,'sockets/status.json'),JSON.stringify({updated:Date.now(),workers:['product','synthetic'].map(name=>({name,ready:true,backupAt:Date.now()}))}));
  fs.writeFileSync(path.join(root,'registry.json'),JSON.stringify({version:1,venues:[{slug:'synthetic',mode:'test',email:'test@example.invalid',url:'https://synthetic.coverstead.net'}]}));
  fs.writeFileSync(path.join(root,'offsite-status.json'),JSON.stringify({verifiedAt:Date.now()}));
  let result=await run('--workers-only');assert.equal(result.code,1);assert.deepEqual(result.issues,['synthetic: worker HTTP health check failed.']);assert.ok(hosts.includes('preview.coverstead.net'));
  broken=false;assert.equal((await run('--workers-only')).code,0);
  fs.writeFileSync(path.join(root,'offsite-failed'),'');result=await run();assert.equal(result.code,1);assert.match(result.issues.join(' '),/latest off-server backup attempt failed/);
  assert.equal((await run('--workers-only')).code,0,'backup failure must not restart healthy workers');
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});
