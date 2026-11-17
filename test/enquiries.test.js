import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import {createEnquiryInbox,enquirySettings,registerEnquiries} from '../enquiries.js';
import {request} from './request.js';
const sample=()=>({id:crypto.randomUUID(),email:'owner@example.invalid',venue:'Synthetic Inn',kind:'managed',message:'Can we rehearse a sample service?',contact_permission:true,website:''});

test('enquiries require explicit readiness and preserve private records through retries and status changes',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-enquiries-'));let date=new Date('2026-11-17T06:00Z');const inbox=createEnquiryInbox(directory,()=>date);
 try{
  assert.equal(enquirySettings({ENQUIRIES_ENABLED:'true'}).enabled,false);
  const input=sample();inbox.accept(input);inbox.accept(input);
  assert.equal(inbox.summary().total,1);assert.equal(inbox.read(input.id).notice_version,'2026-11-17');
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
