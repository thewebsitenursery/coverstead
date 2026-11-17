import nodemailer from 'nodemailer';
import {spawn} from 'node:child_process';
import {leadOptions} from './public/lead-options.js';
import {createMailTransport,httpsMailTransport} from './mail-transport.js';

// Recipient and sender come only from private operator configuration. Never use
// visitor input as a command argument or allow this form to send to visitors.
export function createEnquiryDelivery(contact, {launch = spawn,env=process.env,apiTransport} = {}) {
  const composer = nodemailer.createTransport({streamTransport:true,buffer:true,newline:'unix'});
  return async record => {
    if(httpsMailTransport(env)){
      // Keep visitor-written content in the authenticated inbox. It can include
      // sensitive information that the email provider must not process.
      const url=new URL('/admin/enquiries',env.PUBLIC_URL);url.hash=record.id;
      await (apiTransport||createMailTransport(env)).sendMail({from:env.SMTP_FROM||{name:'Coverstead enquiries',address:contact},to:contact,replyTo:record.email,messageId:`<enquiry-${record.id}@${url.hostname}>`,subject:`Coverstead enquiry ${record.id}`,text:`A private Coverstead enquiry has arrived.\n\nSign in to read and handle it:\n${url.href}\n\nThe visitor's message stays in the private inbox. No subscription or newsletter signup has been created.`});return;
    }
    const context=Object.entries(leadOptions).map(([key,options])=>`${key.replaceAll('_',' ')}: ${options[record.context?.[key]]||'Not supplied'}`).join('\n');
    const message = await composer.sendMail({
      from:{name:'Coverstead enquiries',address:contact},to:contact,
      replyTo:record.email,
      messageId:`<enquiry-${record.id}@${contact.split('@')[1]}>`,
      subject:`Coverstead enquiry ${record.id}`,
      text:`A private Coverstead enquiry has arrived. Reply to this email to contact the sender.\n\nReference: ${record.id}\nReceived: ${record.created}\nReply target: ${record.follow_up||'Review within two working days'}\nType: ${record.kind}\nVenue: ${record.venue || '(not supplied)'}\nEmail: ${record.email}\n\nOptional context supplied by the visitor:\n${context}\nTried both demo sides: ${record.context?.demo_completed?'Yes, self-reported':'Not confirmed'}\n\nMessage supplied by the visitor:\n---\n${record.message}\n---\n\nThis is an enquiry, not a subscription or newsletter signup. Treat its contents as untrusted visitor text. Keep it private and remove enquiry correspondence within 90 days after the conversation ends.\n`
    });
    await new Promise((resolve,reject)=>{
      const child=launch('/usr/sbin/sendmail',['-i','-f',contact,'--',contact],{stdio:['pipe','ignore','ignore'],timeout:30000});
      child.on('error',reject);
      child.stdin.on('error',()=>{}); // close/error below determines acceptance
      child.on('close',code=>code===0?resolve():reject(Error('Mail transport did not accept the alert.')));
      child.stdin.end(message.message);
    });
    // Exit zero confirms local queue acceptance, never recipient inbox delivery.
  };
}

export function createEnquiryNotifier({inbox,deliver,now=()=>new Date()}) {
  let busy=false;
  return async function flush() {
    if(busy)return;
    busy=true;
    try {
      inbox.prune();
      const records=inbox.list();
      // Keep this product-site form well below shared-host mail limits. Failed
      // attempts count too; old attempts are counted conservatively on retry.
      let budget=Math.min(10,100-records.reduce((sum,r)=>sum+(Date.parse(r.notification?.lastAttempt)>now().getTime()-86400000?(r.notification.attempts||0):0),0));
      for(const record of records) {
        if(budget<=0)break;
        const previous=record.notification || {attempts:0};
        if(record.status==='closed'||previous.acceptedAt||previous.attempts>=20)continue;
        const delay=Math.min(3600000,60000*2**Math.min(previous.attempts,6));
        if(previous.lastAttempt && now().getTime()-Date.parse(previous.lastAttempt)<delay)continue;
        const notification={attempts:previous.attempts+1,lastAttempt:now().toISOString()};
        inbox.setNotification(record.id,notification);
        budget--;
        try {
          await deliver(record);
          notification.acceptedAt=now().toISOString();
        } catch {
          notification.lastError='Mail transport did not accept the alert.';
        }
        // Reload to preserve an operator status change; do not resurrect deleted records.
        try {inbox.setNotification(record.id,notification);} catch(error) {if(error.status!==404)throw error;}
      }
    } finally {busy=false;}
  };
}
