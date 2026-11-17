import nodemailer from 'nodemailer';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const emailPattern=/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i;
function address(value){
 const match=typeof value==='string'?value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/):null;
 const email=typeof value==='object'?value?.address:match?match[2]:value;
 const name=typeof value==='object'?value?.name:match?match[1].replace(/^"|"$/g,''):undefined;
 if(typeof email!=='string'||email.length>254||!emailPattern.test(email)||/[\r\n]/.test(email+String(name||'')))throw Error('Invalid mail address.');
 return {email,...(name?{name}: {})};
}
export function mailTransportConfigured(env=process.env){
 if(env.MAIL_TRANSPORT==='brevo')return !!env.BREVO_API_KEY&&!!env.SMTP_FROM;
 return env.MAIL_TRANSPORT==='sendmail'?!!env.SMTP_FROM:!!env.SMTP_HOST;
}
export function createMailTransport(env=process.env,{transportFactory=options=>nodemailer.createTransport(options),fetchImpl=fetch}={}){
 if(env.MAIL_TRANSPORT!=='brevo')return transportFactory(env.MAIL_TRANSPORT==='sendmail'?{sendmail:true,path:'/usr/sbin/sendmail',newline:'unix'}:{host:env.SMTP_HOST,port:Number(env.SMTP_PORT||587),secure:env.SMTP_PORT==='465',requireTLS:env.SMTP_PORT!=='465',auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASSWORD_B64?Buffer.from(env.SMTP_PASSWORD_B64,'base64').toString():env.SMTP_PASSWORD}:undefined,connectionTimeout:15000,socketTimeout:20000});
 if(!env.BREVO_API_KEY)throw Error('Email API is not configured.');
 return {async sendMail(message){
  const to=(Array.isArray(message.to)?message.to:[message.to]).map(value=>({...address(value),contactPixelTrackingConsent:false}));
  if(to.length!==1)throw Error('Send each private message to one recipient.');
  if(env.COVERSTEAD_STAGING==='true'&&!(env.MAIL_TEST_RECIPIENTS||'').split(',').map(x=>x.trim().toLowerCase()).includes(to[0].email.toLowerCase()))throw Error('Staging email recipient is not allowed.');
  const attachment=[];
  for(const item of message.attachments||[]){
   if(!/^[a-f0-9-]+\.(pdf|png|jpg|webp)$/.test(item.filename)||!(await fs.lstat(item.path)).isFile())throw Error('Invalid mail attachment.');
   attachment.push({name:item.filename,content:(await fs.readFile(item.path)).toString('base64')});
  }
  const payload={sender:address(message.from),to,subject:message.subject,textContent:message.text,...(message.replyTo?{replyTo:address(message.replyTo)}:{}),...(attachment.length?{attachment}:{}),headers:{idempotencyKey:crypto.createHash('sha256').update(message.messageId||crypto.randomUUID()).digest('hex').slice(0,32)}};
  const body=JSON.stringify(payload);if(Buffer.byteLength(body)>10*1024*1024)throw Error('Email exceeds the delivery size limit.');
  let response,data;
  try{response=await fetchImpl('https://api.brevo.com/v3/smtp/email',{method:'POST',redirect:'error',headers:{'api-key':env.BREVO_API_KEY,'Content-Type':'application/json',Accept:'application/json'},body,signal:AbortSignal.timeout(20000)});data=await response.json();}catch{throw Error('Email API request failed.');}
  // Acceptance by the provider is not proof of inbox delivery. Never log its
  // response body: it can echo message content, recipients or credentials.
  if(response.status!==201||typeof data?.messageId!=='string'||!data.messageId)throw Error('Email API did not accept the message.');
  return {accepted:to.map(x=>x.email),messageId:data.messageId};
 },close(){}};
}
