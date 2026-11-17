import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import Stripe from 'stripe';
import {request} from './request.js';
import {readinessChecks,serviceAccess} from '../managed.js';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'cs-live-fake-'));
process.env.DB_PATH=path.join(root,'live.sqlite');
const {createBilling}=await import('../billing.js');
const {query,run,transaction}=await import('../store.js');
const launchFile=path.join(root,'launch.json');
fs.writeFileSync(launchFile,JSON.stringify(Object.fromEntries(['company','terms','privacy','mail','backups','recovery','monitoring','support','stripeAccount','trialReminders'].map(k=>[k,'Synthetic evidence for automated test']))));
fs.mkdirSync(path.join(root,'sample-pub'));
const registry={version:1,venues:[{slug:'sample-pub',url:'https://sample-pub.coverstead.net',email:'live-owner@example.invalid',mode:'live',checks:{}}]};
const writeRegistry=()=>fs.writeFileSync(path.join(root,'registry.json'),JSON.stringify(registry));writeRegistry();
const config={mode:'live',key:'sk_live_fixture',enabled:true,liveReady:true,launchFile,managedRoot:root,termsVersion:'2026-11-17',origin:'https://coverstead.net',secure:true,monthly:'price_monthly',annual:'price_annual',portal:'bpc_fixture',webhookSecret:'whsec_fixture'};
const sdk=new Stripe('sk_test_fixture');let subscription;
const checkout=[];
const client={webhooks:sdk.webhooks,customers:{create:async()=>({id:'cus_fixture'})},prices:{retrieve:async id=>({id,livemode:true,active:true,currency:'gbp',unit_amount:1000,recurring:{interval:'month',interval_count:1},metadata:{application:'coverstead'}})},checkout:{sessions:{create:async params=>{checkout.push(params);return {id:'cs_fixture',url:'https://checkout.stripe.com/example'};}}},subscriptions:{retrieve:async()=>subscription}};
const app=express(),billing=createBilling({config,client,sendIdentityEmail:async()=>{}});billing.registerWebhook(app);app.use(express.json());billing.registerRoutes(app);
const token=crypto.randomBytes(32).toString('hex'),cookie='cs_billing='+token;
transaction(()=>{run('INSERT INTO billing_accounts(id,email,name,venue_name,password_hash,created,email_verified_at) VALUES(?,?,?,?,?,?,?)',['acct_fixture','live-owner@example.invalid','Synthetic','Sample','unused','now','now']);run('INSERT INTO billing_sessions VALUES(?,?,?)',[crypto.createHash('sha256').update(token).digest('hex'),'acct_fixture',Date.now()+60000]);});
const call=(body)=>request(app,'/api/billing/checkout',{method:'POST',origin:config.origin,cookie,body});
test('live checkout requires a prepared venue and terms, with mode-correct webhooks controlling service',async()=>{
 try{
  assert.equal((await call({plan:'monthly',acceptTerms:true})).status,409);assert.equal(checkout.length,0);
  registry.venues[0].checks=Object.fromEntries(readinessChecks.map(k=>[k,'Synthetic test evidence']));writeRegistry();
  assert.equal((await call({plan:'monthly'})).status,400);assert.equal(checkout.length,0);
  assert.equal((await call({plan:'monthly',acceptTerms:true})).status,200);assert.equal(checkout.length,1);
  assert.equal(query('SELECT * FROM billing_acceptances')[0].version,config.termsVersion);
  assert.ok(checkout[0].subscription_data.trial_end>Date.now()/1000);
  subscription={id:'sub_fixture',livemode:true,customer:'cus_fixture',status:'trialing',metadata:{coverstead_account:'acct_fixture'},trial_end:checkout[0].subscription_data.trial_end,items:{data:[{quantity:1,price:'price_monthly',current_period_end:Date.now()/1000+86400}]}};
  async function webhook(livemode,id){const body={id,type:'customer.subscription.updated',livemode,data:{object:{id:'sub_fixture',customer:'cus_fixture'}}};return request(app,'/api/stripe/webhook',{method:'POST',body,headers:{'stripe-signature':sdk.webhooks.generateTestHeaderString({payload:JSON.stringify(body),secret:config.webhookSecret})}});}
  assert.equal((await webhook(false,'evt_wrong_mode')).status,400);assert.equal(serviceAccess(path.join(root,'sample-pub','entitlement.json')).allowed,false);
  assert.equal((await webhook(true,'evt_live_fixture')).status,200);assert.equal(serviceAccess(path.join(root,'sample-pub','entitlement.json')).allowed,true);
  subscription.status='canceled';assert.equal((await webhook(true,'evt_cancel_fixture')).status,200);assert.equal(serviceAccess(path.join(root,'sample-pub','entitlement.json')).allowed,false);
  assert.throws(()=>createBilling({config:{...config,mode:'test',key:'sk_test_fixture'},client}),/separate billing database/);
 }finally{billing.close();}
});
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));
