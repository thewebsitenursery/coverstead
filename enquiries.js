import fs from 'node:fs';
import path from 'node:path';
import {createEnquiryDelivery,createEnquiryNotifier} from './enquiry-mail.js';
import {leadOptions} from './public/lead-options.js';

const idPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const emailPattern = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i;
export const enquiryNoticeVersion = '2026-11-17.2';
const fail = (message, status = 400) => Object.assign(Error(message), {status});
const statuses=['new','contacted','qualified','rehearsal','waiting','closed'];
export function enquiryContext(input={}) {
  const result={};
  for(const [key,options] of Object.entries(leadOptions)){
    const value=input[key]??'';
    if(typeof value!=='string'||(value&&!Object.hasOwn(options,value)))throw fail('Choose a valid '+key.replaceAll('_',' ')+'.');
    result[key]=value;
  }
  if(input.demo_completed!==undefined&&typeof input.demo_completed!=='boolean')throw fail('Check the demo answer.');
  result.demo_completed=input.demo_completed===true;
  return result;
}
export function enquiryReplyDue(date){
  const due=new Date(date);let remaining=2;
  while(remaining){due.setUTCDate(due.getUTCDate()+1);if(![0,6].includes(due.getUTCDay()))remaining--;}
  return due.toISOString().slice(0,10);
}
export function enquirySettings(env = process.env) {
  const contact = env.ENQUIRY_CONTACT_EMAIL || '';
  return {enabled:env.ENQUIRIES_ENABLED === 'true' && env.ENQUIRY_NOTICE_CONFIRMED === 'true' && emailPattern.test(contact),contact,notify:env.ENQUIRY_EMAIL_ENABLED === 'true',
    directory:path.join(path.dirname(path.resolve(env.DB_PATH || 'data/coverstead.sqlite')), 'enquiries')};
}
export function createEnquiryInbox(directory, now = () => new Date()) {
  const file = id => { if (!idPattern.test(id)) throw fail('Invalid enquiry reference.'); return path.join(directory, id.toLowerCase()+'.json'); };
  function read(id) {
    const target = file(id);
    if (!fs.existsSync(target)) throw fail('Enquiry not found.',404);
    if (!fs.lstatSync(target).isFile()) throw fail('Expected a regular enquiry file.',500);
    return JSON.parse(fs.readFileSync(target,'utf8'));
  }
  function list() {
    if (!fs.existsSync(directory)) return [];
    if (!fs.lstatSync(directory).isDirectory()) throw fail('Expected a private enquiry directory.',500);
    return fs.readdirSync(directory).filter(name=>idPattern.test(name.replace(/\.json$/,'')) && name.endsWith('.json')).map(name=>read(name.slice(0,-5)));
  }
  function prune() {
    const cutoff = now().getTime()-90*86400000;
    for (const record of list()) if (Date.parse(record.created)<cutoff) fs.unlinkSync(file(record.id));
  }
  function accept(input) {
    if (!input || typeof input!=='object' || Array.isArray(input)) throw fail('Check the enquiry details.');
    for(const key of Object.keys(input)) if(!['id','email','venue','kind','message','contact_permission','website','context'].includes(key)) throw fail('Unexpected enquiry field.');
    if(typeof input.website==='string' && input.website) return;
    const text=(key,max,required=false)=>{const value=input[key];if(typeof value!=='string'||value.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))throw fail('Check '+key+'.');const clean=value.trim();if(required&&!clean)throw fail('Enter '+key+'.');return clean;};
    const id=text('id',36,true).toLowerCase();file(id);
    const email=text('email',254,true).toLowerCase(),venue=text('venue',120),kind=text('kind',20,true),message=text('message',1500,true);
    if(!emailPattern.test(email)||/[\r\n]/.test(email))throw fail('Enter a valid email address.');
    if(!['managed','community','privacy'].includes(kind))throw fail('Choose an enquiry type.');
    if(kind!=='privacy'&&!venue)throw fail('Enter your venue name.');
    if(input.contact_permission!==true)throw fail('Confirm that we may reply about this enquiry.');
    if(input.context!==undefined&&(!input.context||typeof input.context!=='object'||Array.isArray(input.context)||Object.keys(input.context).some(key=>!Object.hasOwn(leadOptions,key)&&key!=='demo_completed')))throw fail('Check the optional venue context.');
    const context=enquiryContext(input.context);
    prune();
    const records=list();
    const previous=records.find(record=>record.id===id);
    if(previous){if(['email','venue','kind','message'].some(key=>previous[key]!==({email,venue,kind,message})[key])||JSON.stringify(previous.context||enquiryContext())!==JSON.stringify(context))throw fail('This submission reference has already been used.',409);return;}
    if(records.length>=2000)throw fail('The enquiry inbox is temporarily full. Please try again later.',503);
    fs.mkdirSync(directory,{recursive:true,mode:0o700});
    if(!fs.lstatSync(directory).isDirectory())throw fail('Expected a private enquiry directory.',500);
    const created=now().toISOString(),record={id,email,venue,kind,message,context,created,updated:created,status:'new',follow_up:enquiryReplyDue(now()),contact_permission:true,notice_version:enquiryNoticeVersion};
    const target=file(id),temporary=target+'.tmp';
    try { fs.writeFileSync(temporary,JSON.stringify(record)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temporary,target); }
    catch(error){try{fs.unlinkSync(temporary);}catch{}throw error;}
  }
  function update(id,change) {
    const record=read(id);change(record);
    const target=file(id),temporary=target+'.tmp';
    try {fs.writeFileSync(temporary,JSON.stringify(record)+'\n',{mode:0o600,flag:'wx'});fs.renameSync(temporary,target);}
    catch(error){try{fs.unlinkSync(temporary);}catch{}throw error;}
  }
  function setStatus(id,status) {
    if(!statuses.includes(status))throw fail('Use new, contacted, qualified, rehearsal, waiting or closed.');
    prune();update(id,record=>{record.status=status;record.updated=now().toISOString();});
  }
  function setNotification(id,notification){update(id,record=>{record.notification=notification;});}
  function setFollowUp(id,date){
    if(date!=='clear'&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date))throw fail('Use a valid YYYY-MM-DD date or clear.');
    update(id,record=>{record.follow_up=date==='clear'?null:date;record.updated=now().toISOString();});
  }
  function remove(id){read(id);fs.unlinkSync(file(id));}
  function summary(){prune();const records=list(),pending=records.filter(r=>r.status!=='closed'&&!r.notification?.acceptedAt),open=records.filter(r=>r.status!=='closed');return {total:records.length,...Object.fromEntries(statuses.map(status=>[status,records.filter(r=>r.status===status).length])),followUpsDue:open.filter(r=>r.follow_up&&r.follow_up<=now().toISOString().slice(0,10)).length,nextFollowUp:open.map(r=>r.follow_up).filter(Boolean).sort()[0]||null,oldestNew:records.filter(r=>r.status==='new').map(r=>r.created).sort()[0]||null,alertsPending:pending.length,alertsFailed:pending.filter(r=>r.notification?.attempts>=20).length};}
  return {accept,prune,list,read,setStatus,setNotification,setFollowUp,remove,summary};
}
export function registerEnquiries(app,{settings=enquirySettings(),now=()=>new Date()}={}) {
  const inbox=createEnquiryInbox(settings.directory,now),attempts=new Map();
  const flush=settings.enabled&&settings.notify?createEnquiryNotifier({inbox,deliver:createEnquiryDelivery(settings.contact),now}):async()=>{};
  const notify=()=>void flush().catch(()=>console.warn('Enquiry alert queue needs operator review.'));
  app.get('/api/enquiries/config',(_req,res)=>res.json({enabled:settings.enabled,contact:settings.enabled?settings.contact:null,noticeVersion:enquiryNoticeVersion}));
  app.post('/api/enquiries',(req,res,next)=>{
    if(!settings.enabled)return res.status(503).json({error:'Private enquiries are not open yet. Please check back later.'});
    const timestamp=now().getTime();
    for(const [key,item] of attempts)if(item.until<timestamp)attempts.delete(key);
    if(attempts.size>=10000&&!attempts.has(req.ip))return res.status(429).json({error:'Please try again later.'});
    const item=attempts.get(req.ip)||{count:0,until:timestamp+15*60000};item.count++;attempts.set(req.ip,item);
    if(item.count>5)return res.status(429).json({error:'Please wait 15 minutes before sending another enquiry.'});
    try {inbox.accept(req.body);res.status(202).json({ok:true,message:'Your enquiry has been saved privately. No subscription or newsletter signup has been created.'});notify();}catch(error){next(error);}
  });
  if(settings.enabled){inbox.prune();const timer=setInterval(()=>{try{inbox.prune();}catch{console.warn('Enquiry retention check failed; operator review needed.');}},3600000);timer.unref();}
  if(settings.enabled&&settings.notify){notify();const timer=setInterval(notify,60000);timer.unref();}
}
