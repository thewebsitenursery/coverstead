import '../env.js';
import fs from 'node:fs';
import path from 'node:path';
import Stripe from 'stripe';

// Provision only Coverstead-tagged objects. Never change account-wide settings.
const key=process.env.STRIPE_SECRET_KEY||'';
const live=process.argv.includes('--live');
if(!new RegExp('^(sk|rk)_'+(live?'live':'test')+'_').test(key))throw Error('Provide a key matching the selected mode. Live setup requires --live.');
const file=path.resolve(process.env.ENV_FILE||'data/stripe-test.env');
if(!fs.existsSync(file))throw Error('Create a private configuration file and set ENV_FILE first.');
const stripe=new Stripe(key,{apiVersion:'2026-10-28.endive',maxNetworkRetries:2,timeout:20000});
const fields={STRIPE_MODE:live?'live':'test'};
if(live){const account=await stripe.accounts.retrieve();if(!account.charges_enabled||!account.payouts_enabled)throw Error('Stripe account is not ready for live charges and payouts. Complete its account requirements first.');console.log(JSON.stringify({account:account.id,chargesEnabled:account.charges_enabled,payoutsEnabled:account.payouts_enabled,businessName:account.business_profile?.name||null}));}
const productId=live?'coverstead_enterprise_v1':'coverstead_enterprise_pilot_v1';
let product;
try{product=await stripe.products.retrieve(productId);}catch(error){if(error.code!=='resource_missing')throw error;}
if(!product)product=await stripe.products.create({id:productId,name:'Coverstead Enterprise',description:'Managed reservation software for one venue. Operated by Classicbikemerch Ltd.'+(live?'':' Test mode.'),metadata:{application:'coverstead'}},{idempotencyKey:'coverstead-product-pilot-v1'});
if(!!product.livemode!==live||product.metadata.application!=='coverstead')throw Error('Unexpected existing product. No changes made to it.');
for(const [plan,amount,interval]of [['MONTHLY',2500,'month'],['ANNUAL',25000,'year']]){
  const lookup='coverstead_enterprise_gbp_'+plan.toLowerCase()+'_v2';
  let price=(await stripe.prices.list({lookup_keys:[lookup],limit:1})).data[0];
  if(!price)price=await stripe.prices.create({product:product.id,currency:'gbp',unit_amount:amount,recurring:{interval},lookup_key:lookup,metadata:{application:'coverstead'}},{idempotencyKey:lookup});
  if(!price.active||price.recurring?.interval_count!==1||price.product!==product.id||!!price.livemode!==live||price.unit_amount!==amount||price.currency!=='gbp'||price.recurring?.interval!==interval||price.metadata.application!=='coverstead')throw Error('Unexpected existing price. No changes made to it.');
  fields['STRIPE_PRICE_'+plan]=price.id;
}
let portal=process.env.STRIPE_PORTAL_CONFIGURATION?await stripe.billingPortal.configurations.retrieve(process.env.STRIPE_PORTAL_CONFIGURATION):null;
if(!portal)portal=await stripe.billingPortal.configurations.create({business_profile:{headline:'Coverstead · Classicbikemerch Ltd'},metadata:{application:'coverstead'},features:{customer_update:{enabled:true,allowed_updates:['email','name','address']},invoice_history:{enabled:true},payment_method_update:{enabled:true},subscription_cancel:{enabled:true,mode:'at_period_end',proration_behavior:'none'},subscription_update:{enabled:false}}},{idempotencyKey:'coverstead-portal-pilot-v1'});
if(!!portal.livemode!==live||portal.metadata.application!=='coverstead')throw Error('Unexpected portal configuration. No changes made to it.');
fields.STRIPE_PORTAL_CONFIGURATION=portal.id;
const urlArg=process.argv.find(x=>x.startsWith('--webhook-url='));
if(urlArg){
  const url=new URL(urlArg.slice('--webhook-url='.length));
  if(url.origin!=='https://coverstead.net'||url.pathname!=='/api/stripe/webhook'||url.search||url.hash)throw Error('This helper only registers the authorised Coverstead webhook URL.');
  if(!process.env.STRIPE_WEBHOOK_SECRET){
    const existing=(await stripe.webhookEndpoints.list({limit:100})).data.find(e=>e.url===url.href);
    if(existing)throw Error('This webhook already exists. Recover its signing secret privately; do not create a duplicate.');
    const webhook=await stripe.webhookEndpoints.create({url:url.href,api_version:'2026-10-28.endive',description:'Coverstead subscriptions',metadata:{application:'coverstead'},enabled_events:['checkout.session.completed','checkout.session.async_payment_succeeded','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','invoice.paid','invoice.payment_failed','invoice.payment_action_required']},{idempotencyKey:'coverstead-webhook-pilot-v1'});
    fields.STRIPE_WEBHOOK_SECRET=webhook.secret;fields.STRIPE_WEBHOOK_ENDPOINT=webhook.id;
  }
}
// Preserve existing configuration, write privately and never print a key/signing secret.
let text=fs.readFileSync(file,'utf8');
for(const [name,value]of Object.entries(fields)){
  const pattern=new RegExp('^'+name+'=.*$','m');
  if(pattern.test(text))text=text.replace(pattern,name+'='+value);else text+='\n'+name+'='+value+'\n';
}
fs.writeFileSync(file+'.tmp',text,{mode:0o600});fs.renameSync(file+'.tmp',file);fs.chmodSync(file,0o600);
console.log('Coverstead catalog and dedicated portal configured. Private configuration updated.');
console.log(JSON.stringify({product:product.id,monthly:fields.STRIPE_PRICE_MONTHLY,annual:fields.STRIPE_PRICE_ANNUAL,portal:portal.id,webhookConfigured:!!(fields.STRIPE_WEBHOOK_SECRET||process.env.STRIPE_WEBHOOK_SECRET)}));
