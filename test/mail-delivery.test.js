import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import nodemailer from 'nodemailer';
import {createMailSender} from '../mail-delivery.js';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-smtp-'));
process.env.DB_PATH=path.join(directory,'test.sqlite');
const {query,run,transaction}=await import('../store.js');

test('real SMTP dialogue accepts synthetic mail, records rejection, and suppresses withdrawn marketing',async()=>{
 const messages=[],sockets=new Set();
 const smtp=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.setEncoding('utf8');socket.write('220 localhost test SMTP\r\n');
  let buffer='',data=false,message='';
  socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
   if(data){if(line==='.') {messages.push(message);message='';data=false;socket.write('250 accepted locally\r\n');}else message+=line+'\r\n';continue;}
   if(/^EHLO|^HELO/.test(line))socket.write('250-localhost\r\n250 SIZE 1000000\r\n');
   else if(/^MAIL FROM/.test(line))socket.write('250 ok\r\n');
   else if(/^RCPT TO/.test(line))socket.write(line.includes('reject@')?'550 rejected for rehearsal\r\n':'250 ok\r\n');
   else if(line==='DATA'){data=true;socket.write('354 send message\r\n');}
   else if(line==='QUIT'){socket.end('221 bye\r\n');}
   else socket.write('250 ok\r\n');
  }});
 });
 await new Promise(resolve=>smtp.listen(0,'127.0.0.1',resolve));
 try{
  transaction(()=>{for(const [id,recipient,category] of [['accept','guest@example.invalid',null],['reject','reject@example.invalid',null],['withdrawn','former@example.invalid','loyalty']])run('INSERT INTO outbox(id,recipient,subject,body,category,customer_id,attachments_json) VALUES(?,?,?,?,?,?,?)',[id,recipient,'Synthetic rehearsal','No real guest data',category,'missing-customer','[]']);});
  const env={SMTP_HOST:'127.0.0.1',SMTP_PORT:String(smtp.address().port),EMAIL_DNS_READY:'true',SMTP_FROM:'Test <sender@example.invalid>',PUBLIC_URL:'http://localhost:3100'};
  const send=createMailSender({query,run,transaction,venue:{name:'Synthetic Inn',email:'venue@example.invalid'},assets:directory,env,transportFactory:options=>{
   assert.equal(options.requireTLS,true); // Production keeps TLS mandatory.
   // Only this loopback test sink disables TLS; no production option is added.
   return nodemailer.createTransport({...options,requireTLS:false,ignoreTLS:true});
  }});
  const results=await Promise.all([send(),send()]);
  assert.equal(results.reduce((n,r)=>n+r.accepted,0),1);assert.equal(results.reduce((n,r)=>n+r.failed,0),1);assert.equal(results.reduce((n,r)=>n+r.skipped,0),1);
  assert.equal(messages.length,1);assert.match(messages[0],/No real guest data/);assert.match(messages[0],/Message-ID: <accept@localhost>/i);
  assert.ok(query("SELECT sent FROM outbox WHERE id='accept'")[0].sent);
  assert.equal(query("SELECT attempts FROM outbox WHERE id='reject'")[0].attempts,1);
  assert.equal(query("SELECT id FROM outbox WHERE id='withdrawn'").length,0);
  const disabled=createMailSender({query,run,transaction,venue:{},assets:directory,env:{...env,EMAIL_DNS_READY:'false'},transportFactory:()=>{throw Error('Must not connect');}});
  assert.equal((await disabled()).accepted,0);
 }finally{for(const socket of sockets)socket.destroy();await new Promise(resolve=>smtp.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
});
