import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {request} from './request.js';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-inbox-'));
Object.assign(process.env,{ENV_FILE:path.join(root,'none.env'),DB_PATH:path.join(root,'product.sqlite'),ASSET_PATH:path.join(root,'assets'),NO_LISTEN:'true',PUBLIC_URL:'http://localhost:3100',EDITION:'enterprise',COOKIE_SECURE:'false',SETUP_TOKEN:'synthetic-enquiry-owner-token-long',ENQUIRIES_ENABLED:'true',ENQUIRY_NOTICE_CONFIRMED:'true',ENQUIRY_CONTACT_EMAIL:'hello@example.invalid',ENQUIRY_EMAIL_ENABLED:'false'});
const {app}=await import('../server.js');const {addUser}=await import('../platform.js');
const cookie=response=>{const value=response.headers['set-cookie'];return (Array.isArray(value)?value[0]:value).split(';')[0];};
test('only the product owner can read and update the private enquiry inbox',async()=>{
 const id=crypto.randomUUID();assert.equal((await request(app,'/api/enquiries',{method:'POST',body:{id,email:'guest@example.invalid',venue:'Synthetic Inn',kind:'managed',message:'Private message <script>untrusted</script>',contact_permission:true,website:''}})).status,202);
 assert.equal((await request(app,'/api/admin/enquiries')).status,401);
 const owner=await request(app,'/api/setup-owner',{method:'POST',body:{token:process.env.SETUP_TOKEN,name:'Owner',email:'owner@example.invalid',password:'synthetic-owner-password'}});assert.equal(owner.status,201);const session=cookie(owner);
 const inbox=await request(app,'/api/admin/enquiries',{cookie:session});assert.equal(inbox.status,200);assert.equal(inbox.json.records[0].id,id);
 addUser({name:'Manager',email:'manager@example.invalid',password:'synthetic-manager-password',role:'manager'});const manager=cookie(await request(app,'/api/login',{method:'POST',body:{email:'manager@example.invalid',password:'synthetic-manager-password'}}));
 assert.equal((await request(app,'/api/admin/enquiries',{cookie:manager})).status,403);assert.equal((await request(app,'/api/admin/enquiries/'+id,{method:'PATCH',cookie:manager,body:{status:'closed'}})).status,403);
 assert.equal((await request(app,'/api/admin/enquiries/'+id,{method:'PATCH',cookie:session,origin:'https://elsewhere.invalid',body:{status:'closed'}})).status,403);
 assert.equal((await request(app,'/api/admin/enquiries/'+id,{method:'PATCH',cookie:session,body:{status:'contacted'}})).status,200);
 assert.equal((await request(app,'/api/admin/enquiries',{cookie:session})).json.records[0].status,'contacted');
 assert.equal((await request(app,'/api/admin/enquiries/'+id,{method:'PATCH',cookie:session,body:{status:'invented'}})).status,400);
 fs.rmSync(root,{recursive:true,force:true});
});
