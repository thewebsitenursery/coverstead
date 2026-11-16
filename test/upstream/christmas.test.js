import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';import {mkdtempSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import initSqlJs from 'sql.js';
test('Christmas pending reservations, shared capacity, manual deposits and signed DNA callbacks',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'redlion-christmas-')),dbFile=path.join(dir,'test.sqlite'),capture=path.join(dir,'payment.json');
 const child=spawn(process.execPath,['--import','./test/dna.fixture.js','server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'22004',PUBLIC_URL:'http://127.0.0.1:22004',ADMIN_PASSWORD:'christmas-test-password-only',COOKIE_SECURE:'false',DB_PATH:dbFile,SMTP_HOST:'',DNA_CLIENT_ID:'test-client',DNA_CLIENT_SECRET:'test-secret',DNA_TERMINAL_ID:'test-terminal',DNA_MODE:'test',ONLINE_DEPOSITS_ENABLED:'true',TEST_DNA_REQUEST_FILE:capture},stdio:['ignore','pipe','pipe']});let errors='';child.stderr.on('data',x=>errors+=x);
 const base='http://127.0.0.1:22004';let cookie='';const request=async(url,method='GET',body)=>{const r=await fetch(base+url,{method,headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});return{status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};};
 const sign=data=>({...data,signature:crypto.createHmac('sha256','test-secret').update(`${data.id}${data.amount}${data.currency}${data.invoiceId}${data.errorCode}${data.success}`).digest('base64')});
 try{
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error(errors);try{await fetch(base+'/api/config');ready=true;break;}catch{await new Promise(r=>setTimeout(r,50));}}assert.ok(ready,errors);
  const login=await request('/api/login','POST',{password:'christmas-test-password-only'});cookie=login.cookie.split(';')[0];
  const d={name:'Christmas Test',email:'christmas@example.invalid',phone:'01788 822265',date:'2026-11-25',time:'12:00',size:8,booking_type:'christmas',acknowledge:true};
  for(const change of [{date:'2026-12-01'},{date:'2026-11-24'},{date:'2026-12-24'},{date:'2027-11-25'},{date:'2026-11-29',time:'18:00'},{booking_type:'fake'}])assert.equal((await request('/api/bookings','POST',{...d,...change})).status,400);
  const result=await request('/api/bookings','POST',d);assert.equal(result.status,201);assert.equal(result.data.status,'pending_deposit');assert.equal(result.data.depositAmount,4000);const token=result.data.paymentToken;
  const detail=await request('/api/deposit/'+token);assert.equal(detail.data.depositAmount,4000);assert.equal(detail.data.paid,false);
  assert.equal((await request('/api/bookings','POST',{...d,booking_type:'standard',size:10,time:'12:10'})).status,409);
  assert.equal((await request('/api/bookings','POST',{...d,booking_type:'standard',size:8,time:'12:10'})).status,201);
  const state=await request('/api/admin/bookings'),b=state.data.bookings.find(x=>x.booking_type==='christmas');
  assert.equal((await request('/api/admin/bookings/'+b.id,'PATCH',{status:'confirmed'})).status,400);
  assert.equal((await request('/api/deposit','POST',{token})).status,200);const payment=JSON.parse(readFileSync(capture));assert.equal(payment.amount,40);assert.equal(payment.invoiceId,b.reference);
  const callback={id:'mock-transaction',amount:25,currency:'GBP',invoiceId:b.reference,errorCode:0,success:true,settled:true};
  assert.equal((await request('/api/payments/dna-callback','POST',sign(callback))).status,400);
  callback.amount=40;assert.equal((await request('/api/payments/dna-callback','POST',sign(callback))).status,200);
  const after=await request('/api/admin/bookings');assert.equal(after.data.bookings.find(x=>x.id===b.id).status,'confirmed');assert.equal(after.data.bookings.find(x=>x.id===b.id).deposit_paid,1);assert.equal(after.data.pendingEmails,6);
  assert.equal((await request('/api/payments/dna-callback','POST',sign(callback))).status,200);assert.equal((await request('/api/admin/bookings')).data.pendingEmails,6);
  assert.equal((await request('/api/deposit','POST',{token})).status,409);
  const manual=await request('/api/bookings','POST',{...d,date:'2026-11-26',size:2});assert.equal(manual.data.depositAmount,1000);const manualBooking=(await request('/api/admin/bookings')).data.bookings.find(x=>x.reference===manual.data.reference);
  assert.equal((await request('/api/admin/bookings/'+manualBooking.id,'PATCH',{deposit_paid:true})).status,200);
  assert.equal((await request('/api/admin/bookings')).data.bookings.find(x=>x.id===manualBooking.id).status,'confirmed');
  const SQL=await initSqlJs(),db=new SQL.Database(readFileSync(dbFile));const row=db.exec("SELECT attachments_json,body FROM outbox WHERE subject LIKE '%Christmas Party pending deposit%' LIMIT 1")[0].values[0];assert.deepEqual(JSON.parse(row[0]),['christmas-menu-2026.pdf','christmas-pre-order-form.pdf']);assert.match(row[1],/£40/);db.close();
 }finally{if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}rmSync(dir,{recursive:true,force:true});}
 assert.equal(errors,'');
});
