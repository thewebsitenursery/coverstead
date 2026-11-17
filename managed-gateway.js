import './env.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {isIP} from 'node:net';
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {managedRegistry} from './managed.js';

// One externally allocated Coverstead port; private Unix sockets for workers.
const source=path.dirname(fileURLToPath(import.meta.url));
const requestedRoot=path.resolve(process.env.MANAGED_ROOT||path.join(path.dirname(process.env.ENV_FILE||'data/config.env'),'managed'));
const root=fs.existsSync(requestedRoot)?fs.realpathSync(requestedRoot):requestedRoot;
const registry=fs.existsSync(path.join(root,'registry.json'))?managedRegistry(root):null;
const host=new URL(process.env.PUBLIC_URL).hostname;
const socketRoot=path.join(path.dirname(path.resolve(process.env.ENV_FILE||'data/config.env')),'sockets');
fs.mkdirSync(socketRoot,{recursive:true,mode:0o700});fs.chmodSync(socketRoot,0o700);
const workers=new Map();let stopping=false;
function worker(name,config){
  let record=workers.get(name);if(record)return record;
  const socket=path.join(socketRoot,crypto.createHash('sha256').update(name).digest('hex').slice(0,20)+'.sock');
  record={socket,ready:false,child:null,restarts:0};workers.set(name,record);
  const start=()=>{
    if(stopping)return;
    if(fs.existsSync(socket))fs.unlinkSync(socket);
    const env={PATH:process.env.PATH,ENV_FILE:config,INSTANCE_SOCKET:socket,NODE_ENV:'production'};
    const child=fork(path.join(source,'server.js'),[],{cwd:source,env,stdio:['ignore','inherit','inherit','ipc']});record.child=child;
    child.on('message',message=>{
      if(message?.ready){record.ready=true;record.restarts=0;process.send?.({workerReady:name,pid:child.pid});}
      if(message?.snapshot){record.backupAt=message.snapshot.created;record.backupError=false;}
      if(message?.snapshotError)record.backupError=true;
    });
    child.on('error',()=>console.error('Coverstead worker could not start: '+name));
    child.on('exit',()=>{record.ready=false;if(!stopping&&record.restarts++<5)setTimeout(start,Math.min(30000,1000*2**record.restarts)).unref();});
  };start();return record;
}
function routes(){
  const entries=[[host,'product',path.resolve(process.env.ENV_FILE||'data/config.env')]];
  for(const v of registry?.read().venues||[]){
    const config=path.join(root,v.slug,'config.env');
    if(fs.realpathSync(path.dirname(config))!==path.join(root,v.slug))throw Error('Venue directories must not be symlinks.');
    entries.push([new URL(v.url).hostname,v.slug,config]);
  }
  return new Map(entries.map(([hostname,name,config])=>[hostname,worker(name,config)]));
}
let current=routes();
setInterval(()=>{try{current=routes();}catch{console.error('Managed registry reload failed; existing routes retained.');}},30000).unref();
setInterval(()=>{
  for(const record of workers.values())if(record.ready&&Date.now()-(record.backupAt||0)>3600e3)record.child.send({operation:'snapshot'});
  const status={updated:Date.now(),workers:[...workers].map(([name,w])=>({name,ready:w.ready,backupAt:w.backupAt||null,backupError:!!w.backupError}))};
  try{fs.writeFileSync(path.join(socketRoot,'status.json.tmp'),JSON.stringify(status)+'\n',{mode:0o600});fs.renameSync(path.join(socketRoot,'status.json.tmp'),path.join(socketRoot,'status.json'));}catch{console.error('Managed status could not be saved.');}
},60000).unref();
const server=http.createServer((req,res)=>{
  const authority=req.headers.host||'';
  const hostname=authority.toLowerCase().replace(/:\d+$/,'');
  const target=current.get(hostname);
  if(!target){res.writeHead(421,{'Content-Type':'text/plain'});res.end('Unknown Coverstead venue.');return;}
  if(!target.ready){res.writeHead(503,{'Retry-After':'5'});res.end('This venue is restarting. Please try again shortly.');return;}
  const headers={...req.headers};delete headers['x-forwarded-host'];
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',').at(-1).trim();
  headers['x-forwarded-for']=isIP(forwarded)?forwarded:req.socket.remoteAddress||'127.0.0.1';
  const upstream=http.request({socketPath:target.socket,path:req.url,method:req.method,headers},response=>{
    res.writeHead(response.statusCode,response.headers);response.pipe(res);
  });
  upstream.setTimeout(30000,()=>upstream.destroy());
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Venue temporarily unavailable.');});
  req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
});
server.listen(Number(process.env.PORT||3100),process.env.HOST||'127.0.0.1',()=>process.send?.({gatewayReady:true,port:server.address().port}));
function stop(){if(stopping)return;stopping=true;server.close();for(const w of workers.values())w.child?.kill('SIGTERM');const deadline=setTimeout(()=>process.exit(1),10000);deadline.unref();Promise.all([...workers.values()].map(w=>new Promise(resolve=>{if(!w.child||w.child.exitCode!==null)return resolve();w.child.once('exit',resolve);}))).then(()=>process.exit(0));}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
