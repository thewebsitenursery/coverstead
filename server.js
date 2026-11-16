import './env.js';
import {venue,publicVenue} from './venue.js';
import {auth,registerPlatform,assets,demo} from './platform.js';
import {serviceSheet} from './service-sheet.js';
import {registerWalkins} from './walkins.js';
import {closures,serviceClosed,registerClosures} from './closures.js';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import nodemailer from 'nodemailer';
import {bookingMessage} from './email.js';
import {upsertCustomer,registerCrm} from './crm.js';
import {validSignature,dnaConfigured,createPaymentLink} from './payments.js';
import {tables,combinations,configurations,slots,available,kitchenAvailable,kitchenLimit,londonNow,bookingSlots,christmasSeason,depositDue,needsPreorder,assignedTablesAvailable,calculateDeposit} from './rules.js';
import {query,run,transaction,bookings} from './store.js';
import {createBilling} from './billing.js';
import {createWebsiteMetrics} from './website-metrics.js';
import {registerMarketing} from './marketing.js';
const app=express(),dirname=path.dirname(fileURLToPath(import.meta.url));
if(!process.env.PUBLIC_URL)throw Error('Set PUBLIC_URL to this installation URL');
const publicOrigin=new URL(process.env.PUBLIC_URL).origin;
const limits=new Map();
app.disable('x-powered-by');app.set('trust proxy','loopback');
const websiteMetrics=createWebsiteMetrics({enabled:process.env.WEBSITE_METRICS_ENABLED==='true',file:path.join(path.dirname(path.resolve(process.env.DB_PATH||'data/coverstead.sqlite')),'website-counts.json')});
app.use(websiteMetrics.middleware);
process.on('exit',()=>websiteMetrics.close());
app.use((req,res,next)=>{if(/^\/(admin|onboarding|enterprise|billing|book)(?:\/|\.|$)/.test(req.path))res.set('X-Robots-Tag','noindex, nofollow');next();});
app.use((req,res,next)=>{res.set({'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https: http:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"});next();});
const billing=createBilling();
billing.registerWebhook(app);
app.use(express.json({limit:'8mb'}));
app.use(express.urlencoded({extended:false,limit:'10kb'}));
app.use('/api',(req,res,next)=>{res.set('Cache-Control','no-store');if(req.method!=='GET'&&req.path!=='/payments/dna-callback'){const origin=req.get('origin');if(!origin||origin!==publicOrigin)return res.status(403).json({error:'Please submit from this website.'});}next();});
function throttle(req,res,next){const key=req.ip+':'+req.path;const now=Date.now();let x=limits.get(key);if(!x||x.end<now){x={n:0,end:now+15*60e3};limits.set(key,x);}if(++x.n>30)return res.status(429).json({error:'Too many attempts. Please try again in 15 minutes.'});next();}
const clean=(x,max)=>typeof x==='string'?x.trim().slice(0,max):'';
registerPlatform(app,throttle);
billing.registerRoutes(app,throttle);
app.get('/api/config',(req,res)=>res.json({...publicVenue(),tables,combinations,duration:venue.duration,kitchenLimit,christmasSeason,today:londonNow().slice(0,10),deposit:venue.groupDeposit/100,depositBasis:'booking',paymentsConfigured:false,emailReady:!demo&&!!process.env.SMTP_HOST&&process.env.EMAIL_DNS_READY==='true',demo}));
app.use(['/api/availability','/api/bookings','/api/admin/bookings','/api/admin/walk-ins'],(req,res,next)=>{if(!venue.setupComplete)return res.status(503).json({error:'This venue is still completing setup.'});next();});
app.get('/api/availability',(req,res)=>{const date=clean(req.query.date,10),size=Number(req.query.size),type=req.query.type||'standard';if(!['standard','christmas'].includes(type))return res.status(400).json({error:'Choose a valid booking type.'});const horizon=new Date(londonNow().slice(0,10)+'T12:00Z');horizon.setUTCDate(horizon.getUTCDate()+venue.advanceDays);if(date>horizon.toISOString().slice(0,10))return res.json({slots:[]});res.json({soldOut:false,slots:bookingSlots(date,type,londonNow(new Date(Date.now()+Math.max(venue.leadMinutes*60000,needsPreorder({size,booking_type:type})?venue.preorderHours*3600e3:0)))).map(s=>({...s,available:!serviceClosed(date,s.service)&&available(date,s.time,size,bookings(),venue.duration).length>0}))});});
function queue(b,kind=b.status==='pending_deposit'?'pending_deposit':'confirmed'){
 if(b.walk_in)return;
 const message=bookingMessage(b,kind,process.env.PUBLIC_URL,venue.phone);
 for(const recipient of [b.email,...(b.staff_created?[]:[venue.email])].filter(Boolean))run('INSERT INTO outbox(id,booking_id,recipient,subject,body,attachments_json) VALUES(?,?,?,?,?,?)',[crypto.randomUUID(),b.id,recipient,message.subject,message.body+(recipient===venue.email?message.staffNote:''),JSON.stringify(message.attachments)]);
}
function createBooking(req,res){
 const staff=req.staff===true,duration=venue.duration;
 const requestId=String(req.body.request_id||'');
 if(requestId&&!/^[a-f0-9-]{36}$/.test(requestId))return res.status(400).json({error:'Invalid booking request ID.'});
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify(req.body)+':'+staff).digest('hex');
 if(requestId){const previous=query('SELECT * FROM booking_requests WHERE id=?',[requestId])[0];if(previous)return previous.fingerprint===fingerprint?res.status(201).json(JSON.parse(previous.response)):res.status(409).json({error:'This request was already used for different details. Refresh to start a new booking.'});}
 const response=b=>({reference:b.reference,date:b.date,time:b.time,size:b.size,largeGroup:b.size>=venue.groupThreshold,bookingType:b.booking_type,status:b.status,depositAmount:b.deposit_amount,preorderRequired:needsPreorder(b),emailStatus:'queued',paymentToken:depositDue(b)>0?b.payment_token:undefined});
 const x=req.body,b={id:crypto.randomUUID(),reference:'CS-'+crypto.randomBytes(5).toString('hex').toUpperCase(),created:new Date().toISOString(),date:clean(x.date,10),time:clean(x.time,5),name:clean(x.name,100),phone:clean(x.phone,40),email:clean(x.email,254).toLowerCase(),size:Number(x.size),requirements:clean(x.requirements,2000),duration,status:'confirmed',payment_token:crypto.randomBytes(32).toString('hex')};
 b.staff_created=staff?1:0;b.booking_type=x.booking_type||'standard';if(!['standard','christmas'].includes(b.booking_type))return res.status(400).json({error:'Choose a valid booking type.'});b.deposit_amount=depositDue(b);if(b.booking_type==='christmas'&&b.deposit_amount>0)b.status='pending_deposit';
 if(staff&&b.size>venue.onlineMax&&(!Array.isArray(x.tables)||!x.tables.length))return res.status(400).json({error:'Select the tables being rearranged for this group.'});
 if(staff&&b.size>venue.onlineMax&&x.large_party_arranged!==true)return res.status(400).json({error:'Confirm the seating and kitchen arrangements for this large party.'});
 b.kitchen_override=staff&&x.large_party_arranged===true&&b.size>venue.onlineMax?1:0;
 if(x.website)return res.status(400).json({error:'Unable to accept this request.'});
 if(b.name.length<2||!/^[-+()\d .]{7,40}$/.test(b.phone)||b.phone.replace(/\D/g,'').length<7||((!staff||b.email)&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email))||!Number.isSafeInteger(b.size)||!Number.isSafeInteger(b.size*500)||b.size<1||(!staff&&b.size>venue.onlineMax)||!x.acknowledge)return res.status(400).json({error:'Please complete all required details and acknowledge the booking conditions.'});
 if(!(staff&&x.preorder_exception===true)&&needsPreorder(b)&&b.date+'T'+b.time<londonNow(new Date(Date.now()+venue.preorderHours*3600e3)))return res.status(400).json({error:'Pre-ordered meals need at least the configured pre-order notice. Please contact the venue for a shorter-notice booking.'});
 const slot=bookingSlots(b.date,b.booking_type,londonNow(new Date(Date.now()+venue.leadMinutes*60000))).find(s=>s.time===b.time);const horizon=new Date(londonNow().slice(0,10)+'T12:00Z');horizon.setUTCDate(horizon.getUTCDate()+venue.advanceDays);
 if(!slot||b.date>horizon.toISOString().slice(0,10))return res.status(400).json({error:'Choose an available service time. Check the venue’s service times and seasonal dates.'});b.service=slot.service;
 try{transaction(()=>{if(serviceClosed(b.date,b.service))throw Error('CLOSED');if(!b.kitchen_override&&!kitchenAvailable(b.date,b.time,b.size,bookings()))throw Error('KITCHEN_FULL');const option=available(b.date,b.time,b.size,bookings(),venue.duration)[0];b.seating_mode=staff&&b.size>venue.onlineMax?'rearranged':'joined';if(staff&&Array.isArray(x.tables)&&x.tables.length){if(!assignedTablesAvailable(b.date,b.time,b.size,x.tables,bookings(),duration,b.seating_mode==='separate',b.seating_mode==='rearranged'))throw Error('TABLES');b.tables=x.tables;}else{if(!option)throw Error('FULL');b.tables=option.ids;}if(staff&&x.deposit_paid===true){b.deposit_paid=1;if(b.status==='pending_deposit')b.status='confirmed';}
 run('INSERT INTO bookings(id,reference,created,date,time,service,name,phone,email,size,requirements,tables_json,duration,status,payment_token,booking_type,deposit_amount,seating_mode,deposit_paid,notes,staff_created,kitchen_override) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[b.id,b.reference,b.created,b.date,b.time,b.service,b.name,b.phone,b.email,b.size,b.requirements,JSON.stringify(b.tables),duration,b.status,b.payment_token,b.booking_type,b.deposit_amount,b.seating_mode,b.deposit_paid||0,staff?clean(x.notes,4000)+(b.kitchen_override?'\nStaff confirmed rearranged seating and kitchen arrangements; normal arrival limit overridden.':'')+(x.preorder_exception===true?'\nStaff confirmed the short-notice pre-order with the kitchen.':''):'',b.staff_created,b.kitchen_override]);upsertCustomer(b,staff?'Staff booking':'Online booking',x.marketing_email===true);queue(b);if(requestId)run('INSERT INTO booking_requests VALUES(?,?,?)',[requestId,fingerprint,JSON.stringify(response(b))]);});res.status(201).json(response(b));void sendMail();}catch(e){if(e.message==='CLOSED')return res.status(409).json({error:'This dining session is closed for a private event. Please choose another service or call the pub.'});if(e.message==='TABLES')return res.status(409).json({error:'The selected tables are unavailable, too small, or not a permitted table combination. Please choose other tables.'});if(e.message==='KITCHEN_FULL')return res.status(409).json({error:'That arrival time has reached the kitchen’s arrival limit. Please choose another time.'});if(e.message==='FULL')return res.status(409).json({error:'That time has just filled up. Please choose another time.'});throw e;}
}
app.post('/api/bookings',throttle,createBooking);
app.post('/api/admin/bookings',auth,(req,res)=>{req.staff=true;createBooking(req,res);});
app.get('/api/admin/slots',auth,(req,res)=>res.json({slots:bookingSlots(clean(req.query.date,10),req.query.type||'standard').filter(s=>!serviceClosed(clean(req.query.date,10),s.service))}));

const paymentRequests=new Map();
app.get('/api/deposit/:token',(req,res)=>{const b=bookings().find(b=>b.payment_token===req.params.token);if(!b||depositDue(b)<=0)return res.status(404).json({error:'Booking not found.'});res.json({reference:b.reference,bookingType:b.booking_type,depositAmount:depositDue(b),status:b.status,paid:!!b.deposit_paid});});
app.post('/api/deposit',throttle,async(req,res)=>{try{const token=clean(req.body.token,64);const b=bookings().find(b=>b.payment_token===token);if(!b||depositDue(b)<=0)return res.status(404).json({error:'Booking not found.'});if(b.status==='cancelled'||b.date<londonNow().slice(0,10))return res.status(400).json({error:'This booking is no longer eligible for a deposit payment. Please call the pub.'});if(b.deposit_paid)return res.status(409).json({error:'Your deposit has already been recorded. Thank you.'});if(process.env.ONLINE_DEPOSITS_ENABLED!=='true'||!dnaConfigured())return res.status(503).json({error:'Please call the venue to pay your deposit over the phone.'});const existing=query('SELECT * FROM payments WHERE booking_id=?',[b.id])[0];if(existing&&existing.expires>new Date().toISOString())return res.json({url:existing.url});if(!paymentRequests.has(b.id))paymentRequests.set(b.id,createPaymentLink(b).then(data=>{transaction(()=>run('INSERT INTO payments(booking_id,link_id,url,expires) VALUES(?,?,?,?) ON CONFLICT(booking_id) DO UPDATE SET link_id=excluded.link_id,url=excluded.url,expires=excluded.expires',[b.id,data.id,data.url,data.expirationDate]));return data;}).finally(()=>paymentRequests.delete(b.id)));const data=await paymentRequests.get(b.id);res.json({url:data.url});}catch{res.status(502).json({error:'We could not open online payment. Please try again or call the venue.'});}});
app.post('/api/payments/dna-callback',(req,res)=>{const data=req.body;if(!validSignature(data,process.env.DNA_CLIENT_SECRET))return res.status(403).json({error:'Invalid payment signature.'});if(data.success!==true||Number(data.errorCode)!==0)return res.json({received:true});const b=bookings().find(b=>b.reference===data.invoiceId);if(!b||depositDue(b)<=0)return res.status(404).json({error:'Payment reference not found.'});if(data.currency!=='GBP'||Math.round(Number(data.amount)*100)!==depositDue(b)||data.settled!==true)return res.status(400).json({error:'Unexpected payment details.'});if(!query('SELECT booking_id FROM payments WHERE booking_id=?',[b.id]).length)return res.status(404).json({error:'Payment reference not found.'});transaction(()=>{run("UPDATE bookings SET deposit_paid=1,status=CASE WHEN status='pending_deposit' THEN 'confirmed' ELSE status END WHERE id=?",[b.id]);if(b.booking_type==='christmas'&&!b.deposit_paid&&b.status==='pending_deposit')queue({...b,deposit_paid:1,status:'confirmed'},'confirmed');run('UPDATE payments SET transaction_id=? WHERE booking_id=?',[clean(data.id,200),b.id]);});res.json({received:true});});

app.get('/api/admin/bookings',auth,(req,res)=>res.json({bookings:bookings(),closures:closures(),mailConfigured:!!process.env.SMTP_HOST&&process.env.EMAIL_DNS_READY==='true',smtpConfigured:!!process.env.SMTP_HOST,paymentsConfigured:process.env.ONLINE_DEPOSITS_ENABLED==='true'&&dnaConfigured(),pendingEmails:query('SELECT count(*) AS n FROM outbox WHERE sent IS NULL')[0].n}));
app.patch('/api/admin/bookings/:id',auth,(req,res)=>{const b=bookings().find(b=>b.id===req.params.id);if(!b)return res.status(404).json({error:'Booking not found.'});const x=req.body;
 const size=x.size===undefined?b.size:Number(x.size),changed=size!==b.size;
 const time=x.time===undefined?b.time:clean(x.time,5),timeChanged=time!==b.time,edited=changed||timeChanged;let service=b.service;
 if(timeChanged){const slot=bookingSlots(b.date,b.booking_type,londonNow(new Date(Date.now()+venue.leadMinutes*60000))).find(s=>s.time===time);if(!slot)return res.status(400).json({error:'Choose a future arrival time during an available dining service.'});service=slot.service;if(serviceClosed(b.date,service))return res.status(409).json({error:'This dining session is blocked. Choose another service time.'});}

 if(!Number.isSafeInteger(size)||size<1||!Number.isSafeInteger(size*500))return res.status(400).json({error:'Enter a valid whole number of guests.'});
 if(size>venue.onlineMax&&!b.walk_in&&b.seating_mode!=='rearranged'&&x.large_party_arranged!==true)return res.status(400).json({error:'Confirm the seating and kitchen arrangements for this large party.'});
 const mode=size>venue.onlineMax&&!b.walk_in?'rearranged':b.seating_mode,override=b.kitchen_override||(!b.walk_in&&size>venue.onlineMax&&x.large_party_arranged===true?1:0);
 const amount=changed?(b.walk_in?0:calculateDeposit({...b,size})):depositDue(b);
 let paid=x.deposit_paid===undefined?b.deposit_paid:Number(!!x.deposit_paid);
 if(changed&&amount>depositDue(b)&&x.deposit_reconfirmed!==true)paid=0;
 let status=x.status===undefined?b.status:x.status;
 if(b.booking_type==='christmas'){if(changed&&amount>depositDue(b)&&!paid&&status==='confirmed')status='pending_deposit';if(amount>0&&!paid&&['confirmed','arrived','completed'].includes(status))return res.status(400).json({error:'Record the £'+amount/100+' Christmas deposit before confirming this party.'});if(paid&&status==='pending_deposit')status='confirmed';}else if(status==='pending_deposit')return res.status(400).json({error:'This status is only for Christmas Parties.'});
 if(!['pending_deposit','confirmed','arrived','completed','no-show','cancelled'].includes(status))return res.status(400).json({error:'Invalid booking status.'});
 if(status==='completed'&&b.date+'T'+time>londonNow())return res.status(400).json({error:'Only completed past visits count towards loyalty rewards.'});
 if(b.status==='cancelled'&&status!=='cancelled'&&serviceClosed(b.date,service))return res.status(409).json({error:'This session is blocked. Reopen it before restoring this booking.'});
 const selected=x.tables===undefined?b.tables:x.tables,others=bookings().filter(v=>v.id!==b.id);
 if(!['cancelled','completed'].includes(status)&&!assignedTablesAvailable(b.date,time,size,selected,[],b.duration,mode==='separate',mode==='rearranged'))return res.status(400).json({error:'Choose a table or combination large enough for the updated guest count.'});
 if(changed||timeChanged||(b.status==='cancelled'&&status!=='cancelled')){if(!['cancelled','completed'].includes(status)&&!override&&!b.walk_in&&!kitchenAvailable(b.date,time,size,others))return res.status(409).json({error:'This booking would exceed the kitchen limit of the configured arrival capacity.'});}
 if(!['cancelled','completed'].includes(status)&&!assignedTablesAvailable(b.date,time,size,selected,others,b.duration,mode==='separate',mode==='rearranged'))return res.status(409).json({error:'These tables overlap another booking.'});
 const notes=x.notes===undefined?b.notes:clean(x.notes,4000),preorder=changed?0:x.preorder_received===undefined?b.preorder_received:Number(!!x.preorder_received);
 const updated={...b,time,service,size,tables:selected,deposit_amount:amount,deposit_paid:paid,status,seating_mode:mode,kitchen_override:override,notes};
 transaction(()=>{run('UPDATE bookings SET status=?,tables_json=?,deposit_paid=?,preorder_received=?,notes=?,size=?,deposit_amount=?,seating_mode=?,kitchen_override=?,time=?,service=? WHERE id=?',[status,JSON.stringify(selected),paid,preorder,notes,size,amount,mode,override,time,service,b.id]);
 if(edited){run('DELETE FROM outbox WHERE booking_id=? AND sent IS NULL',[b.id]);queue(updated,status==='cancelled'?'cancelled':status==='pending_deposit'?'pending_deposit':'updated');}
 else if(b.booking_type==='christmas'&&b.status==='pending_deposit'&&status==='confirmed'&&paid)queue(updated,'confirmed');
 if(!edited&&status==='cancelled'&&b.status!=='cancelled'){run('DELETE FROM outbox WHERE booking_id=? AND sent IS NULL',[b.id]);queue(updated,'cancelled');}});res.json({ok:true});void sendMail();});
app.post('/api/admin/retry-email',auth,(req,res)=>{transaction(()=>run('UPDATE outbox SET attempts=0 WHERE sent IS NULL'));res.json({ok:true});void sendMail();});
app.get('/api/admin/service-sheet',auth,(req,res)=>{const date=clean(req.query.date,10),service=req.query.service;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||isNaN(new Date(date+'T12:00Z'))||new Date(date+'T12:00Z').toISOString().slice(0,10)!==date||!['Lunch','Dinner','Both'].includes(service))return res.status(400).send('Choose a valid date and service.');res.set('Cache-Control','no-store');res.type('html').send(serviceSheet(date,service,bookings(),closures()));});
registerWalkins(app,auth);
registerClosures(app,auth);
registerCrm(app,auth,()=>void sendMail());
let sending=false;async function sendMail(){if(demo||sending||!process.env.SMTP_HOST||process.env.EMAIL_DNS_READY!=='true')return;sending=true;try{const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||587),secure:process.env.SMTP_PORT==='465',requireTLS:process.env.SMTP_PORT!=='465',auth:process.env.SMTP_USER?{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD_B64?Buffer.from(process.env.SMTP_PASSWORD_B64,'base64').toString():process.env.SMTP_PASSWORD}:undefined,connectionTimeout:15000,socketTimeout:20000});for(const m of query('SELECT * FROM outbox WHERE sent IS NULL AND attempts<20 ORDER BY rowid LIMIT 20')){if(m.category==='loyalty'&&!query('SELECT id FROM customers WHERE id=? AND marketing_email=1',[m.customer_id]).length){transaction(()=>run('DELETE FROM outbox WHERE id=?',[m.id]));continue;}try{await transport.sendMail({from:process.env.SMTP_FROM||`${venue.name} <${venue.email}>`,to:m.recipient,replyTo:venue.email,subject:m.subject,text:m.body,attachments:(m.attachments_json?JSON.parse(m.attachments_json):[]).filter(file=>/^[a-f0-9-]+\.(pdf|png|jpg|webp)$/.test(file)).map(file=>({filename:file,path:path.join(assets,file)})),messageId:`<${m.id}@${new URL(process.env.PUBLIC_URL).hostname}>`});transaction(()=>run('UPDATE outbox SET sent=?,error=NULL WHERE id=?',[new Date().toISOString(),m.id]));}catch{transaction(()=>run('UPDATE outbox SET attempts=attempts+1,error=? WHERE id=?',['Delivery failed; check SMTP configuration',m.id]));}}}finally{sending=false;}}
setInterval(()=>{const now=Date.now();for(const[k,v]of limits)if(v.end<now)limits.delete(k);void sendMail();},60000).unref();
app.get('/admin/help',auth,(req,res)=>{res.set('Cache-Control','no-store');res.sendFile(path.join(dirname,'public/manual.html'));});
app.use('/assets',express.static(assets,{dotfiles:'deny',setHeaders:res=>res.set('Content-Disposition','inline')}));
app.get('/manual',(req,res)=>res.sendFile(path.join(dirname,'public/manual.html')));
registerMarketing(app,dirname,publicOrigin);
app.get('/demo',(req,res)=>res.sendFile(path.join(dirname,'public/demo.html')));
app.get('/install',(req,res)=>res.sendFile(path.join(dirname,'public/install.html')));
app.get('/billing',(req,res)=>res.sendFile(path.join(dirname,'public/billing.html')));
app.get('/get-started',(req,res)=>res.sendFile(path.join(dirname,'public/get-started.html')));
app.get('/book',(req,res)=>res.sendFile(path.join(dirname,'public/book.html')));
app.get('/onboarding',(req,res)=>res.sendFile(path.join(dirname,'public/onboarding.html')));
app.get('/enterprise',(req,res)=>res.sendFile(path.join(dirname,'public/enterprise.html')));
app.use(express.static(path.join(dirname,'public'),{index:'index.html',setHeaders:(res,file)=>{if(/\.(html|js|css)$/.test(file))res.set('Cache-Control','no-cache, max-age=0, must-revalidate');}}));app.get('/admin',(req,res)=>res.sendFile(path.join(dirname,'public/admin.html')));
app.use((err,req,res,next)=>{console.error(err.status?err.message:'Request failed');res.status(err.status||500).json({error:err.status?err.message:'Unable to complete the request. Please try again or contact the venue.'});});
export {app};
if(process.env.NO_LISTEN!=='true')app.listen(Number(process.env.PORT||3100),process.env.HOST||'127.0.0.1',()=>{console.log('Coverstead: '+process.env.PUBLIC_URL);void sendMail();});
