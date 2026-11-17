import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import {spawn} from 'node:child_process';
import {query,run,transaction} from './store.js';
import {createMailTransport,mailTransportConfigured,httpsMailTransport} from './mail-transport.js';

const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const validEmail=value=>typeof value==='string'&&value.length<=254&&/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i.test(value)&&!/[\r\n]/.test(value);
const fail=message=>Object.assign(Error(message),{status:400});
export function billingIdentityMail(env=process.env,{launch=spawn,recipientAllowed,apiTransport}={}){
 const live=env.STRIPE_MODE==='live';
 const sender=env.BILLING_EMAIL_FROM||'';
 const recipients=(env.BILLING_EMAIL_TEST_RECIPIENTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(validEmail);
 if(env.BILLING_EMAIL_ENABLED!=='true'||!validEmail(sender)||(httpsMailTransport(env)&&!mailTransportConfigured({...env,SMTP_FROM:sender}))||(live?typeof recipientAllowed!=='function':!recipients.length))return null;
 const permitted=email=>validEmail(email)&&(live?recipientAllowed(email):recipients.includes(email));
 const composer=nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});
 const deliver=async ({email,purpose,url})=>{
  // Live mail is limited to operator-invited venues; test mail uses a fixed allowlist.
  if(!permitted(email))return;
  const labels={verify:'Finish your Coverstead test account',reset:'Reset your Coverstead test password',changed:'Your Coverstead test password changed'};
  const text=purpose==='changed'?'Your Coverstead test-account password has changed. Existing sessions were signed out. If you did not do this, request another password reset and contact hello@coverstead.net.':`${purpose==='verify'?'Confirm your email and choose a password to finish your test account.':'Use this link to choose a new test-account password.'}\n\n${url}\n\nThis single-use link expires in ${purpose==='verify'?'60':'15'} minutes. If you did not request it, ignore this message. No money is taken and no hosted venue is created.`;
  const subject=live?labels[purpose].replace(' test',''):labels[purpose];
  const body=live?text.replaceAll('test-account','account').replaceAll('test account','account').replaceAll('test-account','account').replaceAll('test password','password').replace('No money is taken and no hosted venue is created.','Opening this link does not start a subscription or take payment.'):text;
  const details={from:{name:'Coverstead',address:sender},to:email,replyTo:'hello@coverstead.net',subject,text:body,messageId:'<identity-'+digest(email+'|'+purpose+'|'+(url||crypto.randomUUID()))+'@coverstead.net>'};
  if(httpsMailTransport(env)){await (apiTransport||createMailTransport(env)).sendMail(details);return;}
  const mail=await composer.sendMail(details);
  await new Promise((resolve,reject)=>{
   const child=launch('/usr/sbin/sendmail',['-i','-f',sender,'--',email],{stdio:['pipe','ignore','ignore'],timeout:30000});
   child.on('error',reject);child.stdin.on('error',()=>{});child.on('close',code=>code===0?resolve():reject(Error('Identity email was not accepted.')));child.stdin.end(mail.message);
  });
 };
 deliver.canDeliver=permitted;
 return deliver;
}

export function createBillingIdentity({origin,send=billingIdentityMail(),passwordHash,now=Date.now}){
 transaction(()=>run(`CREATE TABLE IF NOT EXISTS billing_identity_tokens(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL,purpose TEXT NOT NULL,expires INTEGER NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS billing_identity_requests(id TEXT PRIMARY KEY,email_hash TEXT NOT NULL,created INTEGER NOT NULL);`));
 if(!query('PRAGMA table_info(billing_accounts)').some(c=>c.name==='email_verified_at'))transaction(()=>run('ALTER TABLE billing_accounts ADD COLUMN email_verified_at TEXT'));
 function cleanup(){transaction(()=>{run('DELETE FROM billing_identity_tokens WHERE expires<=?',[now()]);run('DELETE FROM billing_identity_requests WHERE created<=?',[now()-86400000]);});}
 function issue(email,purpose){
  if(!send||(send.canDeliver&&!send.canDeliver(email.toLowerCase())))return;
  cleanup();const address=email.toLowerCase(),emailHash=digest(address),time=now();
  const recent=query('SELECT created FROM billing_identity_requests WHERE email_hash=? AND created>? ORDER BY created DESC',[emailHash,time-3600000]);
  if(recent.length>=5||(recent[0]&&recent[0].created>time-60000)||query('SELECT COUNT(*) AS count FROM billing_identity_requests WHERE created>?',[time-86400000])[0].count>=100)return;
  const token=crypto.randomBytes(32).toString('hex');
  const a=query('SELECT * FROM billing_accounts WHERE email=?',[address])[0];
  transaction(()=>{
   run('INSERT INTO billing_identity_requests VALUES(?,?,?)',[crypto.randomUUID(),emailHash,time]);
   if(a&&!(purpose==='verify'&&a.email_verified_at)){
    run('DELETE FROM billing_identity_tokens WHERE account_id=? AND purpose=?',[a.id,purpose]);
    run('INSERT INTO billing_identity_tokens VALUES(?,?,?,?,?)',[digest(token),a.id,purpose,time+(purpose==='verify'?60:15)*60000,time]);
   }
  });
  if(a&&!(purpose==='verify'&&a.email_verified_at)){
   const url=origin+'/billing#'+new URLSearchParams({action:purpose,token});
   setImmediate(()=>Promise.resolve().then(()=>send({email:address,purpose,url})).catch(()=>console.warn('Billing identity email failed; the account holder can request another link.')));
  }
 }
 function complete({token,purpose,password,confirmPassword}){
  if(!['verify','reset'].includes(purpose)||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw fail('This link is invalid or has expired. Request a new one.');
  if(typeof password!=='string'||password.length<16||password.length>256||password!==confirmPassword)throw fail('Use matching passwords of 16–256 characters.');
  const saved=query('SELECT * FROM billing_identity_tokens WHERE token_hash=? AND purpose=? AND expires>?',[digest(token),purpose,now()])[0];
  if(!saved)throw fail('This link is invalid or has expired. Request a new one.');
  const a=query('SELECT * FROM billing_accounts WHERE id=?',[saved.account_id])[0];
  if(!a)throw fail('This link is invalid or has expired. Request a new one.');
  const encoded=passwordHash(password);
  transaction(()=>{
   run('UPDATE billing_accounts SET password_hash=?,email_verified_at=COALESCE(email_verified_at,?) WHERE id=?',[encoded,new Date(now()).toISOString(),a.id]);
   run('DELETE FROM billing_identity_tokens WHERE account_id=?',[a.id]);
   run('DELETE FROM billing_sessions WHERE account_id=?',[a.id]);
  });
  if(send)setImmediate(()=>Promise.resolve().then(()=>send({email:a.email,purpose:'changed'})).catch(()=>console.warn('Billing password-change notice failed.')));
 }
 cleanup();
 return {ready:!!send,canRegister:email=>!!send&&(!send.canDeliver||send.canDeliver(email)),issue,complete};
}
