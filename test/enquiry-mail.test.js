import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {createEnquiryInbox} from '../enquiries.js';
import {createEnquiryDelivery,createEnquiryNotifier} from '../enquiry-mail.js';

const sample=()=>({id:crypto.randomUUID(),email:'venue@example.invalid',venue:'Synthetic Inn',kind:'managed',message:'A test question, not a real lead.',contact_permission:true,website:''});

test('enquiry alerts survive a failed send and restart, preserve operator changes and never resurrect deletions',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-enquiry-mail-'));
 let time=new Date('2026-11-17T10:00Z');const now=()=>time,inbox=createEnquiryInbox(directory,now),input=sample();
 try {
  inbox.accept(input);let calls=0;
  const fail=createEnquiryNotifier({inbox,now,deliver:async()=>{calls++;throw Error('private transport error');}});
  await fail();assert.equal(calls,1);assert.equal(inbox.read(input.id).notification.attempts,1);
  assert.doesNotMatch(JSON.stringify(inbox.read(input.id)),/private transport error/);
  await fail();assert.equal(calls,1);assert.equal(inbox.summary().alertsPending,1);
  time=new Date(time.getTime()+120000);
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const restarted=createEnquiryNotifier({inbox:createEnquiryInbox(directory,now),now,deliver:async()=>{calls++;await gate;}});
  const pending=restarted();await restarted();assert.equal(calls,2);
  inbox.setStatus(input.id,'contacted');release();await pending;
  assert.equal(inbox.read(input.id).status,'contacted');assert.ok(inbox.read(input.id).notification.acceptedAt);
  await restarted();assert.equal(calls,2);assert.equal(inbox.summary().alertsPending,0);
  const deleted=sample();inbox.accept(deleted);
  await createEnquiryNotifier({inbox,now,deliver:async record=>inbox.remove(record.id)})();
  assert.throws(()=>inbox.read(deleted.id),/not found/);
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('sendmail transport keeps recipients fixed, composes reply-to and treats nonzero exit as failure',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-sendmail-'));
 const output=path.join(directory,'message.eml'),record={...sample(),created:'2026-11-17T10:00:00Z'};
 try {
  const launch=(command,args,options)=>{
   assert.equal(command,'/usr/sbin/sendmail');
   assert.deepEqual(args,['-i','-f','hello@example.invalid','--','hello@example.invalid']);
   assert.equal(options.timeout,30000);
   return spawn(process.execPath,['-e',"const fs=require('fs');const data=[];process.stdin.on('data',x=>data.push(x));process.stdin.on('end',()=>fs.writeFileSync(process.argv[1],Buffer.concat(data)));",output],options);
  };
  await createEnquiryDelivery('hello@example.invalid',{launch})(record);
  const message=fs.readFileSync(output,'utf8');
  assert.match(message,/To: hello@example.invalid/);assert.match(message,/Reply-To: venue@example.invalid/);
  assert.match(message,/A test question, not a real lead/);assert.match(message,/Content-Type: text\/plain/);
  await assert.rejects(createEnquiryDelivery('hello@example.invalid',{launch:(_c,_a,options)=>spawn(process.execPath,['-e','process.exit(75)'],options)})(record),/did not accept/);
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('enquiry mail batch and daily budget bound abuse without discarding pending enquiries',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-enquiry-budget-')),now=()=>new Date('2026-11-17T10:00Z'),inbox=createEnquiryInbox(directory,now);
 try {
  for(let i=0;i<11;i++)inbox.accept(sample());
  let count=0;const flush=createEnquiryNotifier({inbox,now,deliver:async()=>{count++;}});
  await flush();assert.equal(count,10);assert.equal(inbox.summary().alertsPending,1);
  for(const record of inbox.list().filter(r=>r.notification?.acceptedAt))inbox.setNotification(record.id,{attempts:10,lastAttempt:now().toISOString(),acceptedAt:now().toISOString()});
  await flush();assert.equal(count,10);assert.equal(inbox.summary().alertsPending,1);
 } finally {fs.rmSync(directory,{recursive:true,force:true});}
});
