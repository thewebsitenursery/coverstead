import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import {spawn} from 'node:child_process';
test('monitor checks the configured host on a shared gateway without sending mail',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-monitor-'));
 const server=http.createServer((req,res)=>{res.statusCode=req.headers.host==='coverstead.net'?200:421;res.end('{}');});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  fs.mkdirSync(path.join(root,'sockets'));fs.writeFileSync(path.join(root,'sockets/status.json'),JSON.stringify({updated:Date.now(),workers:[{name:'product',ready:true,backupAt:Date.now()}]}));fs.writeFileSync(path.join(root,'offsite-status.json'),JSON.stringify({verifiedAt:Date.now()}));
  const child=spawn(process.execPath,['scripts/managed-alert.js'],{env:{PATH:process.env.PATH,ENV_FILE:path.join(root,'none.env'),PORT:String(server.address().port)},stdio:['ignore','pipe','pipe']});let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);
  const code=await new Promise(resolve=>child.once('exit',resolve));assert.equal(code,0,error);assert.equal(JSON.parse(output).status,'healthy');assert.equal(fs.existsSync(path.join(root,'monitor-alert.json')),false);
 }finally{await new Promise(resolve=>server.close(resolve));fs.rmSync(root,{recursive:true,force:true});}
});
