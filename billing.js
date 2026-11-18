import crypto from 'node:crypto';
import express from 'express';
import Stripe from 'stripe';
import {createBillingIdentity,billingIdentityMail} from './billing-identity.js';
import {stripeMode} from './billing-mode.js';
import {managedRegistry} from './managed.js';
import {query,run,transaction} from './store.js';

export const STRIPE_API_VERSION='2026-10-28.endive';
export const STRIPE_EVENTS=['checkout.session.completed','checkout.session.async_payment_succeeded','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','customer.subscription.paused','customer.subscription.resumed','invoice.paid','invoice.payment_failed','invoice.payment_action_required'];
const terminal=new Set(['canceled','incomplete_expired']);
const idOf=value=>typeof value==='string'?value:value?.id;
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const passwordHash=value=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(value,salt,64).toString('hex');};
const passwordMatches=(value,stored)=>{const [salt,digest]=(stored||'unknown:'+Buffer.alloc(64).toString('hex')).split(':');return crypto.timingSafeEqual(crypto.scryptSync(value,salt,64),Buffer.from(digest,'hex'));};
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const account=id=>query('SELECT * FROM billing_accounts WHERE id=?',[id])[0];
const clean=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';

export function oneMonthFrom(seconds){
  const date=new Date(seconds*1000),day=date.getUTCDate();
  date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()+1);
  const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
  date.setUTCDate(Math.min(day,last));return Math.floor(date.getTime()/1000);
}

export function billingConfig(env=process.env){
  return {mode:env.STRIPE_MODE||'test',liveReady:env.STRIPE_LIVE_READY==='true',launchFile:env.MANAGED_LAUNCH_FILE||'',managedRoot:env.MANAGED_ROOT||'',termsVersion:env.SERVICE_TERMS_VERSION||'2026-11-18',enabled:env.STRIPE_BILLING_ENABLED==='true',key:env.STRIPE_SECRET_KEY||'',webhookSecret:env.STRIPE_WEBHOOK_SECRET||'',monthly:env.STRIPE_PRICE_MONTHLY||'',annual:env.STRIPE_PRICE_ANNUAL||'',portal:env.STRIPE_PORTAL_CONFIGURATION||'',origin:env.PUBLIC_URL?new URL(env.PUBLIC_URL).origin:'',secure:env.COOKIE_SECURE!=='false'};
}

export function createBilling({config=billingConfig(),client,sendIdentityEmail,identityNow}={}){
  const mode=stripeMode(config),live=mode==='live',managed=managedRegistry(config.managedRoot);
  if(live)managed.read();
  const stripe=client||(config.key?new Stripe(config.key,{apiVersion:STRIPE_API_VERSION,maxNetworkRetries:2,timeout:15000}):null);
  const ready=()=>!!(config.enabled&&stripe&&config.webhookSecret&&config.monthly&&config.annual&&config.portal&&config.origin);
  const locks=new Map();
  async function exclusive(id,fn){
    const previous=locks.get(id)||Promise.resolve();
    const pending=previous.catch(()=>{}).then(fn);locks.set(id,pending);
    try{return await pending;}finally{if(locks.get(id)===pending)locks.delete(id);}
  }
  transaction(()=>run(`CREATE TABLE IF NOT EXISTS billing_accounts(
    id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,venue_name TEXT NOT NULL,password_hash TEXT NOT NULL,created TEXT NOT NULL,
    stripe_customer_id TEXT UNIQUE,subscription_id TEXT UNIQUE,status TEXT NOT NULL DEFAULT 'none',price_id TEXT,trial_end INTEGER,current_period_end INTEGER,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,trial_used INTEGER NOT NULL DEFAULT 0,checkout_attempt TEXT,checkout_session_id TEXT,
    checkout_plan TEXT,checkout_trial_end INTEGER,checkout_expires_at INTEGER);
    CREATE TABLE IF NOT EXISTS billing_sessions(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS stripe_events(id TEXT PRIMARY KEY,type TEXT NOT NULL,processed TEXT NOT NULL);`));
  if(!query('PRAGMA table_info(billing_accounts)').some(column=>column.name==='cancel_at'))transaction(()=>run('ALTER TABLE billing_accounts ADD COLUMN cancel_at INTEGER'));
  transaction(()=>run('CREATE TABLE IF NOT EXISTS billing_environment(mode TEXT NOT NULL); CREATE TABLE IF NOT EXISTS billing_acceptances(id TEXT PRIMARY KEY,account_id TEXT NOT NULL,version TEXT NOT NULL,plan TEXT NOT NULL,accepted TEXT NOT NULL);'));
  let savedMode=query('SELECT mode FROM billing_environment')[0]?.mode;
  if(!savedMode){savedMode=query('SELECT id FROM billing_accounts LIMIT 1').length?'test':mode;transaction(()=>run('INSERT INTO billing_environment VALUES(?)',[savedMode]));}
  if(savedMode!==mode&&(config.enabled||config.key))throw Error('Use a separate billing database for live mode; never mix test and live accounts.');
  const identity=createBillingIdentity({origin:config.origin,send:sendIdentityEmail===undefined?billingIdentityMail({...process.env,STRIPE_MODE:mode},{recipientAllowed:live?email=>!!managed.find(email,mode):undefined}):sendIdentityEmail,passwordHash,now:identityNow});
  const safeAccount=a=>({id:a.id,email:a.email,emailVerified:!!a.email_verified_at,name:a.name,venueName:a.venue_name,status:a.status,plan:a.price_id===config.monthly?'monthly':a.price_id===config.annual?'annual':null,trialEnd:a.trial_end,periodEnd:a.current_period_end,cancelAt:a.cancel_at,cancelAtPeriodEnd:!!a.cancel_at_period_end,trialUsed:!!a.trial_used,serviceProvisioned:!!managed?.status(a.email,mode).ready,venueUrl:managed?.status(a.email,mode).url||null});
  function cookieToken(req){return (req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('cs_billing='))?.slice(11)||'';}
  function session(res,a){
    const token=crypto.randomBytes(32).toString('hex');
    transaction(()=>{run('DELETE FROM billing_sessions WHERE expires<=?',[Date.now()]);run('INSERT INTO billing_sessions VALUES(?,?,?)',[hash(token),a.id,Date.now()+8*3600e3]);});
    res.cookie('cs_billing',token,{httpOnly:true,secure:config.secure,sameSite:'strict',path:'/api/billing',maxAge:8*3600e3});
  }
  function auth(req,res,next){
    const token=cookieToken(req);
    const saved=token&&query('SELECT account_id FROM billing_sessions WHERE token_hash=? AND expires>?',[hash(token),Date.now()])[0];
    if(!saved)return res.status(401).json({error:'Sign in to your Coverstead billing account.'});
    req.billingAccount=account(saved.account_id);next();
  }
  const route=fn=>async(req,res)=>{try{await fn(req,res);}catch(error){
    if(error.status)return res.status(error.status).json({error:error.message});
    console.error('Coverstead billing request failed.');
    res.status(502).json({error:'Billing is temporarily unavailable. Please try again. Your reservation data is unaffected.'});
  }};
  function saveSubscription(a,subscription){
    if(!!subscription.livemode!==live||idOf(subscription.customer)!==a.stripe_customer_id||subscription.metadata?.coverstead_account!==a.id)return false;
    const items=subscription.items?.data||[];
    if(items.length!==1||items[0].quantity!==1||![config.monthly,config.annual].includes(idOf(items[0].price)))return false;
    if(a.subscription_id&&a.subscription_id!==subscription.id&&!terminal.has(a.status))return false;
    transaction(()=>run('UPDATE billing_accounts SET subscription_id=?,status=?,price_id=?,trial_end=?,current_period_end=?,cancel_at_period_end=?,cancel_at=?,trial_used=1 WHERE id=?',[
      subscription.id,subscription.status,idOf(items[0].price),subscription.trial_end||null,items[0].current_period_end||null,Number(!!subscription.cancel_at_period_end),subscription.cancel_at||null,a.id
    ]));
    managed?.entitlement(a.email,mode,subscription);
    return true;
  }
  async function reconcile(a,subscriptionId=a.subscription_id){
    if(!subscriptionId)return a;
    const subscription=await stripe.subscriptions.retrieve(subscriptionId);
    if(!saveSubscription(a,subscription))throw fail('This subscription does not match this Coverstead account.',409);
    return account(a.id);
  }
  async function checkout(a,plan,acceptedTerms){
    if(!a.email_verified_at)throw fail('Verify your email before starting checkout.',403);
    if(live&&!managed.status(a.email,mode).ready)throw fail('Your hosted venue must be ready before you start your subscription. Contact hello@coverstead.net.',409);
    if(live&&acceptedTerms!==true)throw fail('Please accept the service terms and recurring subscription before continuing.');
    const priceId=plan==='monthly'?config.monthly:config.annual;
    // A terminal subscription cannot resume; a new checkout may use replacement prices.
    if(!terminal.has(a.status))a=await reconcile(a);
    if(a.subscription_id&&!terminal.has(a.status))throw fail('You already have a subscription. Use Manage billing to update or cancel it.',409);
    if(a.checkout_session_id){
      const previous=await stripe.checkout.sessions.retrieve(a.checkout_session_id);
      if(previous.status==='complete'){
        if(previous.subscription&&!(terminal.has(a.status)&&idOf(previous.subscription)===a.subscription_id)){a=await reconcile(a,idOf(previous.subscription));if(!terminal.has(a.status))throw fail('Your checkout is complete. Refresh your billing status.',409);}
      }else if(previous.status==='open'){
        if(a.checkout_plan===plan)return {url:previous.url};
        await stripe.checkout.sessions.expire(previous.id);
      }
      transaction(()=>run('UPDATE billing_accounts SET checkout_attempt=NULL,checkout_session_id=NULL WHERE id=?',[a.id]));a=account(a.id);
    }
    if(a.checkout_attempt&&a.checkout_plan!==plan)throw fail('Retry your previous plan first so we can safely resolve its checkout.',409);
    if(a.checkout_attempt&&a.checkout_expires_at<=Math.floor(Date.now()/1000))throw fail('A previous checkout attempt needs reconciliation. Contact the installation owner before retrying.',409);
    if(!a.stripe_customer_id){
      const customer=await stripe.customers.create({email:a.email,name:a.name,metadata:{application:'coverstead',coverstead_account:a.id}},{idempotencyKey:'coverstead-customer-'+a.id});
      transaction(()=>run('UPDATE billing_accounts SET stripe_customer_id=? WHERE id=?',[customer.id,a.id]));a=account(a.id);
    }
    // Refuse accidental use of another company's catalog or client-supplied amounts.
    const price=await stripe.prices.retrieve(priceId);
    if(!!price.livemode!==live||!price.active||price.currency!=='gbp'||price.unit_amount!==(plan==='monthly'?2500:25000)||price.recurring?.interval!==(plan==='monthly'?'month':'year')||price.recurring?.interval_count!==1||price.metadata?.application!=='coverstead')throw fail('The Coverstead price needs administrator review.',503);
    if(!a.checkout_attempt){
      const now=Math.floor(Date.now()/1000);
      transaction(()=>run('UPDATE billing_accounts SET checkout_attempt=?,checkout_plan=?,checkout_trial_end=?,checkout_expires_at=? WHERE id=?',[crypto.randomUUID(),plan,a.trial_used?null:oneMonthFrom(now),now+3600,a.id]));a=account(a.id);
    }
    if(live)transaction(()=>run('INSERT INTO billing_acceptances VALUES(?,?,?,?,?)',[crypto.randomUUID(),a.id,config.termsVersion,plan,new Date().toISOString()]));
    const subscriptionData={billing_mode:{type:'flexible'},metadata:{application:'coverstead',coverstead_account:a.id},trial_settings:{end_behavior:{missing_payment_method:'cancel'}}};
    if(a.checkout_trial_end)subscriptionData.trial_end=a.checkout_trial_end;
    const result=await stripe.checkout.sessions.create({mode:'subscription',customer:a.stripe_customer_id,client_reference_id:a.id,
      integration_identifier:'coverstead_pilot_hqvrnaps',line_items:[{price:priceId,quantity:1}],subscription_data:subscriptionData,
      payment_method_collection:'always',automatic_tax:{enabled:false},expires_at:a.checkout_expires_at,
      metadata:{application:'coverstead',coverstead_account:a.id},
      success_url:config.origin+'/billing?checkout=success',cancel_url:config.origin+'/billing?checkout=cancelled'
    },{idempotencyKey:'coverstead-checkout-'+a.checkout_attempt});
    transaction(()=>run('UPDATE billing_accounts SET checkout_session_id=? WHERE id=?',[result.id,a.id]));
    return {url:result.url};
  }
  function registerWebhook(app){
    app.post('/api/stripe/webhook',express.raw({type:'application/json',limit:'1mb'}),async(req,res)=>{
      if(!ready())return res.status(503).json({error:'Stripe billing is not configured.'});
      let event;
      try{event=stripe.webhooks.constructEvent(req.body,req.get('stripe-signature'),config.webhookSecret);}catch{return res.status(400).json({error:'Invalid Stripe signature.'});}
      if(event.livemode!==live)return res.status(400).json({error:'This event does not match the configured Stripe mode.'});
      try{
        await exclusive('event:'+event.id,async()=>{
          if(query('SELECT id FROM stripe_events WHERE id=?',[event.id]).length)return;
          const object=event.data.object;
          let subscriptionId;
          if(event.type.startsWith('customer.subscription.'))subscriptionId=object.id;
          else if(event.type.startsWith('checkout.session.'))subscriptionId=idOf(object.subscription);
          else if(event.type.startsWith('invoice.'))subscriptionId=idOf(object.parent?.subscription_details?.subscription)||idOf(object.subscription);
          const a=query('SELECT * FROM billing_accounts WHERE stripe_customer_id=?',[idOf(object.customer)||''])[0];
          if(a&&subscriptionId&&STRIPE_EVENTS.includes(event.type))await exclusive(a.id,async()=>{
            // Fetch current state within the account lock: event timestamps do not establish ordering.
            const current=await stripe.subscriptions.retrieve(subscriptionId);saveSubscription(account(a.id),current);
          });
          transaction(()=>run('INSERT INTO stripe_events VALUES(?,?,?)',[event.id,event.type,new Date().toISOString()]));
        });
        res.json({received:true});
      }catch{console.error('Stripe webhook processing failed; delivery can be retried.');res.status(503).json({error:'Please retry this event.'});}
    });
  }
  function registerRoutes(app,throttle=(_req,_res,next)=>next()){
    app.use('/api/billing',(req,res,next)=>{
      res.set('Cache-Control','no-store');
      if(req.method!=='GET'&&req.get('origin')!==config.origin)return res.status(403).json({error:'Please submit from this website.'});
      if(req.path==='/config')return next();
      if(!ready())return res.status(503).json({error:'Stripe billing is not configured yet.'});next();
    });
    app.get('/api/billing/config',(_req,res)=>res.json({enabled:ready(),identityEmailReady:identity.ready,identityTestOnly:!live,testMode:!live,assistedEnrolment:live,termsVersion:config.termsVersion||'2026-11-18',company:'Classicbikemerch Ltd',vatRegistered:false,monthly:2500,annual:25000,currency:'GBP'}));
    const acknowledgement={ok:true,message:'If this address can receive a link, it will arrive shortly. Check your inbox or request another link after a minute.'};
    app.post('/api/billing/register',throttle,route(async(req,res)=>{
      if(!identity.ready)throw fail('Account email is not configured yet.',503);
      const email=clean(req.body.email,254).toLowerCase(),name=clean(req.body.name,100),venueName=clean(req.body.venueName,100);
      if(!name||!venueName||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('Enter your name, venue and email.');
      const pendingPassword=passwordHash(crypto.randomBytes(32).toString('hex'));
      if(identity.canRegister(email)&&!query('SELECT id FROM billing_accounts WHERE email=?',[email]).length){
        const id=crypto.randomUUID();transaction(()=>run('INSERT INTO billing_accounts(id,email,name,venue_name,password_hash,created) VALUES(?,?,?,?,?,?)',[id,email,name,venueName,pendingPassword,new Date().toISOString()]));
      }
      identity.issue(email,'verify');res.status(202).json(acknowledgement);
    }));
    for(const [endpoint,purpose] of [['request-verification','verify'],['request-reset','reset']])app.post('/api/billing/'+endpoint,throttle,route(async(req,res)=>{
      if(!identity.ready)throw fail('Account email is not configured yet.',503);
      const email=clean(req.body.email,254).toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail('Enter a valid email address.');
      identity.issue(email,purpose);res.status(202).json(acknowledgement);
    }));
    app.post('/api/billing/complete-identity',throttle,route(async(req,res)=>{
      identity.complete(req.body);res.clearCookie('cs_billing',{path:'/api/billing'});res.json({ok:true,message:'Your email is verified and password saved. Sign in with your new password.'});
    }));
    app.post('/api/billing/login',throttle,route(async(req,res)=>{
      const a=query('SELECT * FROM billing_accounts WHERE email=?',[clean(req.body.email,254).toLowerCase()])[0];
      if(!passwordMatches(String(req.body.password||'').slice(0,256),a?.password_hash)||!a||!a.email_verified_at)throw fail('Incorrect email or password.',401);
      session(res,a);res.json({account:safeAccount(a)});
    }));
    app.post('/api/billing/logout',auth,route(async(req,res)=>{
      transaction(()=>run('DELETE FROM billing_sessions WHERE token_hash=?',[hash(cookieToken(req))]));res.clearCookie('cs_billing',{path:'/api/billing'});res.json({ok:true});
    }));
    app.get('/api/billing/me',auth,(req,res)=>res.json({account:safeAccount(req.billingAccount)}));
    app.post('/api/billing/refresh',auth,throttle,route(async(req,res)=>{
      const a=await exclusive(req.billingAccount.id,async()=>{
        let current=account(req.billingAccount.id);
        if(current.checkout_session_id){const s=await stripe.checkout.sessions.retrieve(current.checkout_session_id);if(s.status==='complete'&&s.subscription)current=await reconcile(current,idOf(s.subscription));}
        return reconcile(current);
      });res.json({account:safeAccount(a)});
    }));
    app.post('/api/billing/checkout',auth,throttle,route(async(req,res)=>{
      if(!['monthly','annual'].includes(req.body.plan))throw fail('Choose monthly or annual billing.');
      res.json(await exclusive(req.billingAccount.id,()=>checkout(account(req.billingAccount.id),req.body.plan,req.body.acceptTerms)));
    }));
    app.post('/api/billing/portal',auth,throttle,route(async(req,res)=>{
      const a=req.billingAccount;if(!a.email_verified_at)throw fail('Verify your email before managing billing.',403);if(!a.stripe_customer_id||!a.subscription_id)throw fail('Complete your checkout first.',409);
      const result=await stripe.billingPortal.sessions.create({customer:a.stripe_customer_id,configuration:config.portal,return_url:config.origin+'/billing?portal=return'});
      res.json({url:result.url});
    }));
  }
  let reconciliationRunning=false;
  async function reconcileAll(){
    if(!ready()||reconciliationRunning)return;reconciliationRunning=true;
    try{for(const row of query('SELECT * FROM billing_accounts WHERE subscription_id IS NOT NULL')){
      try{await exclusive(row.id,()=>reconcile(account(row.id)));}catch{console.error('Managed billing reconciliation failed; inspect the subscription privately.');}
    }}finally{reconciliationRunning=false;}
  }
  let timer,initialReconciliation;
  if(managed&&ready()){timer=setInterval(()=>void reconcileAll(),3600e3);timer.unref();initialReconciliation=setImmediate(()=>void reconcileAll());}
  return {registerWebhook,registerRoutes,reconcileAll,close(){clearInterval(timer);clearImmediate(initialReconciliation);}};
}
