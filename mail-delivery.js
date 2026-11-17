import nodemailer from 'nodemailer';
import path from 'node:path';
import {createMailTransport,mailTransportConfigured,httpsMailTransport} from './mail-transport.js';
export {mailTransportConfigured} from './mail-transport.js';

export function createMailSender({query,run,transaction,venue,assets,demo=false,env=process.env,transportFactory=options=>nodemailer.createTransport(options)}) {
  let sending=false;
  return async function sendMail() {
    const result={accepted:0,failed:0,skipped:0};
    if(demo||sending||!mailTransportConfigured(env)||env.EMAIL_DNS_READY!=='true')return result;
    sending=true;let transport;
    try {
      const local=env.MAIL_TRANSPORT==='sendmail';
      transport=createMailTransport(env,{transportFactory});
      for(const m of query('SELECT * FROM outbox WHERE sent IS NULL AND attempts<20 ORDER BY rowid LIMIT 20')) {
        if(m.category==='loyalty'&&!query('SELECT id FROM customers WHERE id=? AND marketing_email=1',[m.customer_id]).length){transaction(()=>run('DELETE FROM outbox WHERE id=?',[m.id]));result.skipped++;continue;}
        try {
          const response=await transport.sendMail({from:env.SMTP_FROM||`${venue.name} <${venue.email}>`,to:m.recipient,replyTo:venue.email,subject:m.subject,text:m.body,
            // HTTPS delivery uses the menu links already present in the body.
            // This also avoids provider-specific attachment type/size limits.
            attachments:httpsMailTransport(env)?[]:(m.attachments_json?JSON.parse(m.attachments_json):[]).filter(file=>/^[a-f0-9-]+\.(pdf|png|jpg|webp)$/.test(file)).map(file=>({filename:file,path:path.join(assets,file)})),
            messageId:`<${m.id}@${new URL(env.PUBLIC_URL).hostname}>`});
          // Nodemailer resolves sendmail only after a successful child exit.
          if(!local&&!response.accepted?.length)throw Error('SMTP did not accept a recipient.');
          transaction(()=>run('UPDATE outbox SET sent=?,error=NULL WHERE id=?',[new Date().toISOString(),m.id]));result.accepted++;
        }catch{transaction(()=>run('UPDATE outbox SET attempts=attempts+1,error=? WHERE id=?',['Delivery failed; check mail configuration',m.id]));result.failed++;}
      }
    } finally {transport?.close?.();sending=false;}
    return result;
  };
}
