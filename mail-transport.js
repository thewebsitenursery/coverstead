import nodemailer from 'nodemailer';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

const emailPattern=/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+$/i;
const projectPattern=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export const httpsMailTransport=(env=process.env)=>['brevo','scaleway'].includes(env.MAIL_TRANSPORT);
function address(value){
 const match=typeof value==='string'?value.match(/^\s*(.*?)\s*<([^<>]+)>\s*$/):null;
 const email=typeof value==='object'?value?.address:match?match[2]:value;
 const name=typeof value==='object'?value?.name:match?match[1].replace(/^"|"$/g,''):undefined;
 if(typeof email!=='string'||email.length>254||!emailPattern.test(email)||/[\r\n]/.test(email+String(name||'')))throw Error('Invalid mail address.');
 return {email,...(name?{name}: {})};
}
export function mailTransportConfigured(env=process.env){
 if(env.MAIL_TRANSPORT==='brevo')return !!env.BREVO_API_KEY&&!!env.SMTP_FROM;
 if(env.MAIL_TRANSPORT==='scaleway')return !!env.SCALEWAY_SECRET_KEY&&projectPattern.test(env.SCALEWAY_PROJECT_ID||'')&&!!env.SMTP_FROM;
 return env.MAIL_TRANSPORT==='sendmail'?!!env.SMTP_FROM:!!env.SMTP_HOST;
}
export function createMailTransport(env=process.env,{transportFactory=options=>nodemailer.createTransport(options),fetchImpl=fetch}={}){
 if(!httpsMailTransport(env))return transportFactory(env.MAIL_TRANSPORT==='sendmail'?{sendmail:true,path:'/usr/sbin/sendmail',newline:'unix'}:{host:env.SMTP_HOST,port:Number(env.SMTP_PORT||587),secure:env.SMTP_PORT==='465',requireTLS:env.SMTP_PORT!=='465',auth:env.SMTP_USER?{user:env.SMTP_USER,pass:env.SMTP_PASSWORD_B64?Buffer.from(env.SMTP_PASSWORD_B64,'base64').toString():env.SMTP_PASSWORD}:undefined,connectionTimeout:15000,socketTimeout:20000});
 const scaleway=env.MAIL_TRANSPORT==='scaleway';
 if(scaleway?(!env.SCALEWAY_SECRET_KEY||!projectPattern.test(env.SCALEWAY_PROJECT_ID||'')):!env.BREVO_API_KEY)throw Error('Email API is not configured.');
 return {async sendMail(message){
  const to=(Array.isArray(message.to)?message.to:[message.to]).map(address);
  if(to.length!==1)throw Error('Send each private message to one recipient.');
  if(env.COVERSTEAD_STAGING==='true'&&!(env.MAIL_TEST_RECIPIENTS||'').split(',').map(x=>x.trim().toLowerCase()).includes(to[0].email.toLowerCase()))throw Error('Staging email recipient is not allowed.');
  if(typeof message.subject!=='string'||/[\r\n]/.test(message.subject)||typeof message.text!=='string')throw Error('Invalid mail content.');
  const attachment=[];
  for(const item of message.attachments||[]){
   if(!/^[a-f0-9-]+\.(pdf|png|jpg|webp)$/.test(item.filename)||!(await fs.lstat(item.path)).isFile())throw Error('Invalid mail attachment.');
   attachment.push({name:item.filename,content:(await fs.readFile(item.path)).toString('base64')});
  }
  const messageId=message.messageId||'<'+crypto.randomUUID()+'@coverstead.net>';
  if(typeof messageId!=='string'||!/^<[^<>\s@]+@[^<>\s@]+>$/.test(messageId))throw Error('Invalid mail message ID.');
  const reply=message.replyTo?address(message.replyTo):null;
  const payload=scaleway?{from:address(message.from),to,subject:message.subject,text:message.text,project_id:env.SCALEWAY_PROJECT_ID,additional_headers:[{key:'Message-ID',value:messageId},...(reply?[{key:'Reply-To',value:reply.email}]:[])],...(attachment.length?{attachments:attachment.map(a=>({...a,type:({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',webp:'image/webp'})[a.name.split('.').at(-1)]}))}: {})}:{sender:address(message.from),to:to.map(a=>({...a,contactPixelTrackingConsent:false})),subject:message.subject,textContent:message.text,...(reply?{replyTo:reply}:{}),...(attachment.length?{attachment}:{}),headers:{idempotencyKey:crypto.createHash('sha256').update(messageId).digest('hex').slice(0,32)}};
  const body=JSON.stringify(payload);if(Buffer.byteLength(body)>(scaleway?2:10)*1024*1024)throw Error('Email exceeds the delivery size limit.');
  let response,data;
  try{response=await fetchImpl(scaleway?'https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/emails':'https://api.brevo.com/v3/smtp/email',{method:'POST',redirect:'error',headers:{...(scaleway?{'X-Auth-Token':env.SCALEWAY_SECRET_KEY}:{'api-key':env.BREVO_API_KEY}),'Content-Type':'application/json',Accept:'application/json'},body,signal:AbortSignal.timeout(20000)});data=await response.json();}catch{throw Error('Email API request failed.');}
  // Acceptance by the provider is not proof of inbox delivery. Never log its
  // response body: it can echo message content, recipients or credentials.
  if(scaleway){
   const email=data?.emails?.[0];
   if(response.status!==200||data?.emails?.length!==1||typeof email?.id!=='string'||!email.id||!['new','sending','sent'].includes(email.status)||String(email.mail_rcpt||email.rcpt_to||'').toLowerCase()!==to[0].email.toLowerCase())throw Error('Email API did not accept the message.');
   // Stable Message-ID aids diagnosis; Scaleway does not document request
   // idempotency. A lost response can still cause a duplicate on queue retry.
   return {accepted:to.map(x=>x.email),messageId:email.message_id||messageId};
  }
  if(response.status!==201||typeof data?.messageId!=='string'||!data.messageId)throw Error('Email API did not accept the message.');
  return {accepted:to.map(x=>x.email),messageId:data.messageId};
 },close(){}};
}
