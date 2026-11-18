import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createMailTransport,mailTransportConfigured} from '../mail-transport.js';
import {createEnquiryDelivery} from '../enquiry-mail.js';
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-https-mail-'));
process.env.DB_PATH=path.join(temporary,'test.sqlite');
const {billingIdentityMail}=await import('../billing-identity.js');
test.after(()=>fs.rmSync(temporary,{recursive:true,force:true}));
const env={MAIL_TRANSPORT:'brevo',BREVO_API_KEY:'synthetic-key',SMTP_FROM:'hello@example.invalid',PUBLIC_URL:'https://product.example.invalid'};
const scalewayEnv={...env,MAIL_TRANSPORT:'scaleway',SCALEWAY_SECRET_KEY:'synthetic-scaleway-key',SCALEWAY_PROJECT_ID:'11111111-1111-4111-8111-111111111111'};
test('HTTPS mail uses a fixed authenticated endpoint, keeps idempotency stable and never exposes provider failures',async()=>{
 const requests=[];const transport=createMailTransport(env,{fetchImpl:async(url,options)=>{requests.push({url,options});return {status:201,json:async()=>({messageId:'accepted-id'})};}});
 const message={from:'Synthetic Inn <hello@example.invalid>',to:'guest@example.invalid',replyTo:'venue@example.invalid',subject:'Booking saved',text:'Synthetic content',messageId:'<one@venue.example.invalid>'};
 assert.equal(mailTransportConfigured(env),true);assert.equal(mailTransportConfigured({...env,BREVO_API_KEY:''}),false);
 const first=await transport.sendMail(message);await transport.sendMail(message);assert.deepEqual(first.accepted,['guest@example.invalid']);
 assert.equal(requests[0].url,'https://api.brevo.com/v3/smtp/email');assert.equal(requests[0].options.headers['api-key'],'synthetic-key');assert.equal(requests[0].options.redirect,'error');
 const payload=JSON.parse(requests[0].options.body);assert.equal(payload.to[0].contactPixelTrackingConsent,false);assert.equal(payload.replyTo.email,'venue@example.invalid');assert.equal(payload.sender.name,'Synthetic Inn');assert.equal(payload.headers.idempotencyKey,JSON.parse(requests[1].options.body).headers.idempotencyKey);
 assert.match(payload.headers.idempotencyKey,/^[a-f0-9]{32}$/);
 await assert.rejects(transport.sendMail({...message,to:'guest@example.invalid\nBcc:other@example.invalid'}),/Invalid mail address/);
 await assert.rejects(transport.sendMail({...message,to:['a@example.invalid','b@example.invalid']}),/one recipient/);
 const staging=createMailTransport({...env,COVERSTEAD_STAGING:'true',MAIL_TEST_RECIPIENTS:'owner@example.invalid'},{fetchImpl:async()=>{throw Error('Must not contact provider');}});
 await assert.rejects(staging.sendMail(message),/Staging email recipient is not allowed/);
 const rejected=createMailTransport(env,{fetchImpl:async()=>({status:429,json:async()=>({message:'private provider content'})})});await assert.rejects(rejected.sendMail(message),error=>error.message==='Email API did not accept the message.');
 const malformed=createMailTransport(env,{fetchImpl:async()=>({status:201,json:async()=>({})})});await assert.rejects(malformed.sendMail(message),/did not accept/);
});
test('HTTPS enquiry alerts omit all visitor free text and retain a private inbox link',async()=>{
 let sent;await createEnquiryDelivery('hello@example.invalid',{env,apiTransport:{sendMail:async message=>{sent=message;}}})({id:'synthetic-id',email:'guest@example.invalid',message:'PRIVATE MEDICAL DETAIL',venue:'PRIVATE VENUE TEXT'});
 assert.equal(sent.to,'hello@example.invalid');assert.equal(sent.replyTo,'guest@example.invalid');assert.match(sent.text,/https:\/\/product.example.invalid\/admin\/enquiries#synthetic-id/);assert.doesNotMatch(JSON.stringify(sent),/PRIVATE/);
});
test('billing HTTPS transport retains test recipient restrictions and sends verification links privately',async()=>{
 assert.equal(billingIdentityMail({...env,BREVO_API_KEY:'',BILLING_EMAIL_ENABLED:'true',BILLING_EMAIL_FROM:'hello@example.invalid',BILLING_EMAIL_TEST_RECIPIENTS:'owner@example.invalid'}),null);
 const sent=[];const send=billingIdentityMail({...env,BILLING_EMAIL_ENABLED:'true',BILLING_EMAIL_FROM:'hello@example.invalid',BILLING_EMAIL_TEST_RECIPIENTS:'owner@example.invalid'},{apiTransport:{sendMail:async message=>sent.push(message)}});
 await send({email:'stranger@example.invalid',purpose:'verify',url:'https://example.invalid/billing#private'});assert.equal(sent.length,0);
 await send({email:'owner@example.invalid',purpose:'verify',url:'https://example.invalid/billing#private'});assert.equal(sent.length,1);assert.match(sent[0].text,/#private/);assert.doesNotMatch(sent[0].messageId,/#private/);
});
test('Scaleway mail keeps content and links unchanged, validates acceptance and protects API credentials',async()=>{
 const requests=[],message={from:'Synthetic Inn <hello@example.invalid>',to:'guest@example.invalid',replyTo:'venue@example.invalid',subject:'Your booking',text:'Your details: https://example.invalid/private#sample',messageId:'<booking-one@example.invalid>'};
 const accepted={emails:[{id:'provider-id',message_id:message.messageId,mail_rcpt:'guest@example.invalid',status:'new'}]};
 const transport=createMailTransport(scalewayEnv,{fetchImpl:async(url,options)=>{requests.push({url,options});return {status:200,json:async()=>accepted};}});
 assert.equal(mailTransportConfigured(scalewayEnv),true);assert.equal(mailTransportConfigured({...scalewayEnv,SCALEWAY_SECRET_KEY:''}),false);assert.equal(mailTransportConfigured({...scalewayEnv,SCALEWAY_PROJECT_ID:'bad'}),false);
 assert.deepEqual((await transport.sendMail(message)).accepted,['guest@example.invalid']);
 assert.equal(requests[0].url,'https://api.scaleway.com/transactional-email/v1alpha1/regions/fr-par/emails');assert.equal(requests[0].options.headers['X-Auth-Token'],'synthetic-scaleway-key');assert.equal(requests[0].options.redirect,'error');
 const payload=JSON.parse(requests[0].options.body);assert.equal(payload.text,message.text);assert.equal(payload.project_id,scalewayEnv.SCALEWAY_PROJECT_ID);assert.equal(payload.from.name,'Synthetic Inn');assert.deepEqual(payload.additional_headers,[{key:'Message-ID',value:message.messageId},{key:'Reply-To',value:'venue@example.invalid'}]);assert.equal(payload.html,undefined);
 await assert.rejects(transport.sendMail({...message,messageId:'<bad@example.invalid>\nBcc: someone@example.invalid'}),/message ID/);
 await assert.rejects(transport.sendMail({...message,text:'x'.repeat(2*1024*1024)}),/size limit/);
 const staging=createMailTransport({...scalewayEnv,COVERSTEAD_STAGING:'true',MAIL_TEST_RECIPIENTS:'owner@example.invalid'},{fetchImpl:async()=>assert.fail('Disallowed recipient must never reach provider')});await assert.rejects(staging.sendMail(message),/recipient is not allowed/);
 for(const [status,body] of [[429,{error:'private provider content'}],[200,{emails:[]}],[200,{emails:[{...accepted.emails[0],status:'failed'}]}],[200,{emails:[{...accepted.emails[0],mail_rcpt:'different@example.invalid'}]}]]){
  const failed=createMailTransport(scalewayEnv,{fetchImpl:async()=>({status,json:async()=>body})});await assert.rejects(failed.sendMail(message),error=>error.message==='Email API did not accept the message.');
 }
});
test('Scaleway identity and enquiry paths keep invitation and private-text controls',async()=>{
 let enquiry;await createEnquiryDelivery('hello@example.invalid',{env:scalewayEnv,apiTransport:{sendMail:async message=>{enquiry=message;}}})({id:'synthetic-id',email:'guest@example.invalid',message:'PRIVATE MEDICAL DETAIL',venue:'PRIVATE VENUE TEXT'});assert.doesNotMatch(JSON.stringify(enquiry),/PRIVATE/);assert.match(enquiry.text,/admin\/enquiries#synthetic-id/);
 const config={...scalewayEnv,BILLING_EMAIL_ENABLED:'true',BILLING_EMAIL_FROM:'hello@example.invalid',BILLING_EMAIL_TEST_RECIPIENTS:'owner@example.invalid'};
 assert.equal(billingIdentityMail({...config,SCALEWAY_SECRET_KEY:''}),null);
 const sent=[];const send=billingIdentityMail(config,{apiTransport:{sendMail:async message=>sent.push(message)}});
 await send({email:'other@example.invalid',purpose:'verify',url:'https://example.invalid/billing#private'});assert.equal(sent.length,0);
 await send({email:'owner@example.invalid',purpose:'reset',url:'https://example.invalid/billing#private'});assert.equal(sent.length,1);assert.match(sent[0].text,/single-use/);
});
