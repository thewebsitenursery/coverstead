import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import {createEnquiryInbox,enquirySettings,registerEnquiries} from '../enquiries.js';
import {request} from './request.js';
import {setupRequest} from '../public/setup-request.js';
const sample=()=>({id:crypto.randomUUID(),email:'owner@example.invalid',venue:'Synthetic Inn',kind:'managed',message:'Can we rehearse a sample service?',contact_permission:true,website:''});

test('two-detail hosted signup reaches the private inbox once without an open-ended question',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-signup-'));
 try{
  const app=express();app.use(express.json());registerEnquiries(app,{settings:{enabled:true,directory,contact:'support@example.invalid'}});
  const form=new FormData();form.set('venue','Synthetic Signup Inn');form.set('email','owner@example.invalid');form.set('contact_permission','on');
  const input=setupRequest(form,crypto.randomUUID());
  assert.equal((await request(app,'/api/enquiries',{method:'POST',body:input})).status,202);
  assert.equal((await request(app,'/api/enquiries',{method:'POST',body:input})).status,202);
  const inbox=createEnquiryInbox(directory);assert.equal(inbox.summary().total,1);
  const record=inbox.read(input.id);assert.equal(record.kind,'managed');assert.equal(record.email,'owner@example.invalid');assert.equal(record.venue,'Synthetic Signup Inn');assert.ok(record.message.includes('set up hosted Coverstead'));assert.equal(record.notice_version,'2026-11-18.1');
  form.set('message','x'.repeat(1400));inbox.accept(setupRequest(form,crypto.randomUUID()));
  form.delete('contact_permission');assert.throws(()=>inbox.accept(setupRequest(form,crypto.randomUUID())),/Confirm/);
  assert.equal((await request(app,'/api/enquiries')).status,404);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('enquiries require explicit readiness and preserve private records through retries and status changes',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-enquiries-'));let date=new Date('2026-11-17T06:00Z');const inbox=createEnquiryInbox(directory,()=>date);
 try{
  assert.equal(enquirySettings({ENQUIRIES_ENABLED:'true'}).enabled,false);
  const input=sample();inbox.accept(input);inbox.accept(input);
  assert.equal(inbox.summary().total,1);assert.equal(inbox.read(input.id).notice_version,'2026-11-18.1');
  assert.equal(fs.statSync(path.join(directory,input.id+'.json')).mode&0o077,0);
  assert.throws(()=>inbox.accept({...input,message:'different'}),/already been used/);
  assert.throws(()=>inbox.accept({...sample(),contact_permission:false}),/Confirm/);
  assert.throws(()=>inbox.accept({...sample(),email:'a\nb@example.invalid'}),/email/);
  assert.throws(()=>inbox.accept({...sample(),message:'x'.repeat(1501)}),/message/);
  inbox.accept({...sample(),website:'spam.invalid'});assert.equal(inbox.summary().total,1);
  inbox.setStatus(input.id,'contacted');assert.equal(inbox.read(input.id).email,input.email);assert.equal(inbox.summary().contacted,1);
  assert.throws(()=>inbox.read('../secret'),/Invalid/);
  date=new Date('2027-02-16T06:00Z');assert.equal(inbox.summary().total,0);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('private enquiry API is closed by default, rate-limited when enabled and has no public inbox',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-enquiries-api-'));
 try{
  const app=express();app.use(express.json());registerEnquiries(app,{settings:{enabled:false,directory,contact:''}});
  assert.equal((await request(app,'/api/enquiries',{method:'POST',body:sample()})).status,503);
  const enabled=express();enabled.use(express.json());registerEnquiries(enabled,{settings:{enabled:true,directory,contact:'support@example.invalid'}});
  const input=sample(),response=await request(enabled,'/api/enquiries',{method:'POST',body:input});
  assert.equal(response.status,202);assert.doesNotMatch(response.text,/owner@example|Synthetic Inn/);
  assert.equal((await request(enabled,'/api/enquiries')).status,404);
  for(let n=0;n<4;n++)assert.equal((await request(enabled,'/api/enquiries',{method:'POST',body:input})).status,202);
  assert.equal((await request(enabled,'/api/enquiries',{method:'POST',body:input})).status,429);
  assert.equal(createEnquiryInbox(directory).summary().total,1);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});

test('optional qualification stays bounded, retries agree and follow-up dates survive stage changes',async()=>{
 const {enquiryReplyDue}=await import('../enquiries.js');
 assert.equal(enquiryReplyDue(new Date('2026-11-20T12:00Z')),'2026-11-24');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-follow-up-'));let date=new Date('2026-11-20T12:00Z');const inbox=createEnquiryInbox(directory,()=>date);
 try{
  const input={...sample(),context:{venue_type:'pub',booking_method:'paper',timing:'soon',source:'demo',demo_completed:true}};inbox.accept(input);inbox.accept(input);
  assert.equal(inbox.read(input.id).context.demo_completed,true);assert.equal(inbox.summary().followUpsDue,0);
  assert.throws(()=>inbox.accept({...input,context:{...input.context,source:'github'}}),/already been used/);
  assert.throws(()=>inbox.accept({...sample(),context:{source:'arbitrary tracking value'}}),/valid source/);
  assert.throws(()=>inbox.accept({...sample(),context:{email:'unwanted@example.invalid'}}),/optional venue context/);
  inbox.setStatus(input.id,'qualified');inbox.setFollowUp(input.id,'2026-11-23');date=new Date('2026-11-23T12:00Z');
  assert.equal(inbox.summary().qualified,1);assert.equal(inbox.summary().followUpsDue,1);
  assert.throws(()=>inbox.setFollowUp(input.id,'2026-02-31'),/valid/);
  inbox.setStatus(input.id,'closed');assert.equal(inbox.summary().followUpsDue,0);
  date=new Date('2027-03-01T12:00Z');assert.equal(inbox.summary().total,0);
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
