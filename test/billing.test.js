import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import Stripe from 'stripe';
import {request} from './request.js';

const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-billing-'));
process.env.DB_PATH=path.join(temporary,'billing.sqlite');
const {createBilling,oneMonthFrom}=await import('../billing.js');
const {query}=await import('../store.js');
const config={enabled:true,key:'sk_test_fixture',webhookSecret:'whsec_billing_fixture',monthly:'price_monthly',annual:'price_annual',portal:'bpc_coverstead',origin:'http://localhost:3100',secure:true};
const sdk=new Stripe(config.key),sessions=new Map(),subscriptions=new Map(),checkoutCalls=[],portalCalls=[];
let customerCount=0,sessionCount=0,retrievals=0,failNextRetrieve=false,customerFailure=false;
const client={webhooks:sdk.webhooks,customers:{async create(){customerCount++;if(customerFailure)throw Error('offline');return {id:'cus_'+customerCount};}},
  prices:{async retrieve(id){return {id,active:true,livemode:false,currency:'gbp',unit_amount:id===config.monthly?1000:10000,recurring:{interval:id===config.monthly?'month':'year',interval_count:1},metadata:{application:'coverstead'}};}},
  checkout:{sessions:{async create(params,options){checkoutCalls.push({params,options});await new Promise(resolve=>setTimeout(resolve,10));const s={id:'cs_'+ ++sessionCount,status:'open',url:'https://checkout.stripe.com/c/pay/test_'+sessionCount};sessions.set(s.id,s);return s;},async retrieve(id){return sessions.get(id);},async expire(id){sessions.get(id).status='expired';return sessions.get(id);}}},
  subscriptions:{async retrieve(id){retrievals++;if(failNextRetrieve){failNextRetrieve=false;throw Error('offline');}return structuredClone(subscriptions.get(id));}},
  billingPortal:{sessions:{async create(params){portalCalls.push(params);return {url:'https://billing.stripe.com/p/session/test'};}}}
};
const app=express();const billing=createBilling({config,client});billing.registerWebhook(app);app.use(express.json());billing.registerRoutes(app);
const call=(url,method='GET',body,cookie,headers={},origin)=>request(app,url,{method,body,cookie,headers,...(origin?{origin}:{})});
const setCookie=r=>Array.isArray(r.headers['set-cookie'])?r.headers['set-cookie'][0]:r.headers['set-cookie'];
const cookie=r=>setCookie(r).split(';')[0];
const registration=email=>({name:'Test Owner',venueName:'Test Venue',email,password:'only-a-test-passphrase'});
function webhook(id,type,object,{signature=true,live=false}={}){
  const body={id,type,livemode:live,data:{object}};
  const header=signature?sdk.webhooks.generateTestHeaderString({payload:JSON.stringify(body),secret:config.webhookSecret}):'bad';
  return call('/api/stripe/webhook','POST',body,undefined,{'stripe-signature':header},'https://stripe.example');
}

test('calendar month trial clamps to the last day and preserves time',()=>{
  for(const [from,to]of [['2027-01-31T12:30:00Z','2027-02-28T12:30:00Z'],['2028-01-31T12:30:00Z','2028-02-29T12:30:00Z'],['2026-11-16T12:30:00Z','2026-12-16T12:30:00Z']])assert.equal(new Date(oneMonthFrom(Date.parse(from)/1000)*1000).toISOString(),new Date(to).toISOString());
});
test('live keys fail closed',()=>assert.throws(()=>createBilling({config:{...config,key:'sk_live_fixture'}}),/test keys only/));
test('test subscription lifecycle and isolation',async t=>{
  let a,b,first,second,sub;
  await t.test('registers a separate billing identity with a protected cookie and hashed password',async()=>{
    const r=await call('/api/billing/register','POST',registration('one@example.invalid'));assert.equal(r.status,201,r.text);a=cookie(r);first=r.json.account;
    assert.match(setCookie(r),/HttpOnly/);assert.match(setCookie(r),/Secure/);assert.match(setCookie(r),/SameSite=Strict/);
    assert.match(setCookie(r),/Path=\/api\/billing/);assert.doesNotMatch(r.text,/password|stripe_customer/);
    assert.notEqual(query('SELECT password_hash FROM billing_accounts')[0].password_hash,registration('').password);
    const other=await call('/api/billing/register','POST',registration('two@example.invalid'));assert.equal(other.status,201);b=cookie(other);second=other.json.account;
    assert.equal((await call('/api/billing/register','POST',registration('one@example.invalid'))).status,409);
    assert.equal((await call('/api/billing/login','POST',{email:'one@example.invalid',password:'wrong'})).status,401);
    assert.equal((await call('/api/billing/login','POST',registration('one@example.invalid'))).status,200);
  });
  await t.test('rejects anonymous and cross-origin checkout; ignores customer/price/amount supplied by the browser',async()=>{
    assert.equal((await call('/api/billing/checkout','POST',{plan:'monthly'})).status,401);
    assert.equal((await call('/api/billing/checkout','POST',{plan:'monthly'},a,{},'https://evil.invalid')).status,403);
    assert.equal((await call('/api/billing/checkout','POST',{plan:'free'},a)).status,400);
    const results=await Promise.all([call('/api/billing/checkout','POST',{plan:'monthly',price:'price_wrong',amount:1,customer:'cus_other'},a),call('/api/billing/checkout','POST',{plan:'monthly'},a)]);
    assert.ok(results.every(r=>r.status===200));assert.equal(results[0].json.url,results[1].json.url);assert.equal(checkoutCalls.length,1);assert.equal(customerCount,1);
    const {params}=checkoutCalls[0];assert.deepEqual(params.line_items,[{price:config.monthly,quantity:1}]);assert.equal(params.customer,'cus_1');assert.equal(params.automatic_tax.enabled,false);assert.equal(params.subscription_data.billing_mode.type,'flexible');assert.equal(params.payment_method_collection,'always');assert.ok(params.subscription_data.trial_end>Date.now()/1000);assert.equal(params.payment_method_types,undefined);
    assert.equal((await call('/api/billing/me','GET',undefined,a)).json.account.status,'none');
  });
  await t.test('validates signature and mode before processing; checkout success URL grants nothing',async()=>{
    assert.equal((await webhook('evt_bad','customer.subscription.created',{}, {signature:false})).status,400);
    assert.equal((await webhook('evt_live','customer.subscription.created',{}, {live:true})).status,400);
    sub={id:'sub_one',customer:'cus_1',livemode:false,status:'trialing',metadata:{coverstead_account:first.id},trial_end:checkoutCalls[0].params.subscription_data.trial_end,items:{data:[{quantity:1,price:{id:config.monthly},current_period_end:checkoutCalls[0].params.subscription_data.trial_end}]},cancel_at_period_end:false};subscriptions.set(sub.id,sub);
    sessions.get('cs_1').status='complete';sessions.get('cs_1').subscription=sub.id;
    const r=await webhook('evt_created','checkout.session.completed',{customer:'cus_1',subscription:sub.id});assert.equal(r.status,200,r.text);
    const state=(await call('/api/billing/me','GET',undefined,a)).json.account;assert.equal(state.status,'trialing');assert.equal(state.trialUsed,true);assert.equal(state.serviceProvisioned,false);
  });
  await t.test('deduplicates delivery and reconciles current state even when an old event arrives later',async()=>{
    const before=retrievals;assert.equal((await webhook('evt_created','checkout.session.completed',{customer:'cus_1',subscription:sub.id})).status,200);assert.equal(retrievals,before);
    sub.status='active';sub.cancel_at_period_end=true;subscriptions.set(sub.id,sub);
    assert.equal((await webhook('evt_old','customer.subscription.updated',{id:sub.id,customer:'cus_1',status:'trialing'})).status,200);
    const state=(await call('/api/billing/me','GET',undefined,a)).json.account;assert.equal(state.status,'active');assert.equal(state.cancelAtPeriodEnd,true);
    assert.equal((await call('/api/billing/checkout','POST',{plan:'annual'},a)).status,409);
  });
  await t.test('portal always uses the signed-in customer and its dedicated configuration',async()=>{
    assert.equal((await call('/api/billing/portal','POST',{customer:'cus_1'},b)).status,409);
    const r=await call('/api/billing/portal','POST',{customer:'cus_other'},a);assert.equal(r.status,200);
    assert.equal(portalCalls[0].customer,'cus_1');assert.equal(portalCalls[0].configuration,config.portal);
    assert.equal((await call('/api/billing/me','GET',undefined,b)).json.account.id,second.id);
  });
  await t.test('portal cancellation timestamp is shown even when cancel_at_period_end is false',async()=>{
    sub.status='trialing';sub.cancel_at_period_end=false;sub.cancel_at=sub.trial_end;subscriptions.set(sub.id,sub);
    assert.equal((await call('/api/billing/refresh','POST',{},a)).status,200);
    const state=(await call('/api/billing/me','GET',undefined,a)).json.account;
    assert.equal(state.cancelAt,sub.trial_end);assert.equal(state.cancelAtPeriodEnd,false);
  });
  await t.test('failed invoice reflects current Stripe status and transient API failures remain retryable',async()=>{
    sub.status='past_due';subscriptions.set(sub.id,sub);failNextRetrieve=true;
    const invoice={customer:'cus_1',parent:{subscription_details:{subscription:sub.id}}};
    assert.equal((await webhook('evt_invoice','invoice.payment_failed',invoice)).status,503);
    assert.equal(query('SELECT id FROM stripe_events WHERE id=?',['evt_invoice']).length,0);
    assert.equal((await webhook('evt_invoice','invoice.payment_failed',invoice)).status,200);
    assert.equal((await call('/api/billing/me','GET',undefined,a)).json.account.status,'past_due');
  });
  await t.test('ignores unrelated Stripe objects and does not replace the account subscription',async()=>{
    assert.equal((await webhook('evt_other_customer','customer.subscription.updated',{id:'sub_unknown',customer:'cus_unrelated'})).status,200);
    subscriptions.set('sub_wrong',{...sub,id:'sub_wrong',metadata:{coverstead_account:'other'}});
    assert.equal((await webhook('evt_other_product','customer.subscription.updated',{id:'sub_wrong',customer:'cus_1'})).status,200);
    assert.equal(query('SELECT subscription_id FROM billing_accounts WHERE id=?',[first.id])[0].subscription_id,sub.id);
  });
  await t.test('cancelled accounts may restart but never receive a second trial',async()=>{
    sub.status='canceled';subscriptions.set(sub.id,sub);await webhook('evt_cancelled','customer.subscription.deleted',{id:sub.id,customer:'cus_1'});
    const r=await call('/api/billing/checkout','POST',{plan:'annual'},a);assert.equal(r.status,200,r.text);
    const params=checkoutCalls.at(-1).params;assert.equal(params.subscription_data.trial_end,undefined);assert.deepEqual(params.line_items,[{price:config.annual,quantity:1}]);
  });
  await t.test('logout revokes access',async()=>{
    assert.equal((await call('/api/billing/logout','POST',{},a)).status,200);assert.equal((await call('/api/billing/me','GET',undefined,a)).status,401);
  });
});
