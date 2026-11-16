import test from 'node:test';import assert from 'node:assert/strict';import {tables,combinations,slots,available} from '../rules.js';import {validSignature} from '../payments.js';import crypto from 'node:crypto';
const now='2026-10-18T10:00';
test('all 15 tables and exactly the permitted combinations',()=>{assert.equal(tables.length,15);assert.equal(tables.reduce((n,t)=>n+t.seats,0),54);assert.deepEqual(combinations.map(c=>c.ids),[[1,3],[9,10],[11,12,13]]);});
test('Mondays and impossible dates are closed',()=>{assert.deepEqual(slots('2026-10-19',now),[]);assert.deepEqual(slots('2026-02-30',now),[]);assert.deepEqual(slots('nonsense',now),[]);});
test('service cutoffs, Sunday dinner closure and ten minute intervals',()=>{for(const [date,last]of [['2026-10-20','14:30'],['2026-10-24','15:00'],['2026-10-25','15:30']]){const lunch=slots(date,now).filter(s=>s.service==='Lunch');assert.equal(lunch[0].time,'12:00');assert.equal(lunch.at(-1).time,last);for(let i=1;i<lunch.length;i++)assert.equal(Date.parse('2000-01-01T'+lunch[i].time+'Z')-Date.parse('2000-01-01T'+lunch[i-1].time+'Z'),600000);}assert.equal(slots('2026-10-20',now).at(-1).time,'20:30');assert.ok(slots('2026-10-25',now).every(s=>s.service==='Lunch'));});
test('past times excluded',()=>assert.ok(slots('2026-10-18','2026-10-18T15:10').every(s=>s.time>'15:10')));
test('best-fit uses small tables and blocks each member of combined tables',()=>{assert.equal(available('2026-10-20','12:00',2,[],90)[0].seats,2);const b={date:'2026-10-20',time:'12:00',size:12,tables:[1,3],duration:90,status:'confirmed'};assert.ok(available(b.date,'13:20',6,[b],90).every(c=>!c.ids.includes(1)&&!c.ids.includes(3)));assert.ok(available(b.date,'13:30',6,[b],90).some(c=>c.ids.includes(1)));assert.ok(available(b.date,'12:00',12,[{...b,status:'cancelled'}],90).some(c=>c.ids.includes(1)));});
test('no unauthorized combinations or groups over twelve',()=>{assert.deepEqual(available('2026-10-20','12:00',13,[],90),[]);assert.ok(available('2026-10-20','12:00',10,[],90).every(c=>c.ids.join(',')==='1,3'||c.ids.join(',')==='11,12,13'));});
test('payment signature accepts genuine callback and rejects changed amount',()=>{const d={id:'test-transaction',amount:25,currency:'GBP',invoiceId:'RL-TEST',errorCode:0,success:true};d.signature=crypto.createHmac('sha256','test-secret').update('test-transaction25GBPRL-TEST0true').digest('base64');assert.equal(validSignature(d,'test-secret'),true);assert.equal(validSignature({...d,amount:26},'test-secret'),false);assert.equal(validSignature(d,'wrong'),false);assert.equal(validSignature(d,''),false);});

test('kitchen caps total arrivals at sixteen across rolling windows',()=>{
 const date='2027-01-05';const b=(time,size,status='confirmed')=>({date,time,size,status,tables:[1],duration:90});
 assert.equal(available(date,'12:10',4,[b('12:00',12)],90).length>0,true);
 assert.deepEqual(available(date,'12:10',6,[b('12:00',12)],90),[]);
 assert.deepEqual(available(date,'12:30',8,[b('12:20',10)],90),[]);
 assert.deepEqual(available(date,'12:20',8,[b('12:30',10)],90),[]);
 assert.equal(available(date,'12:30',12,[b('12:00',12)],90).length>0,true);
 assert.equal(available(date,'12:10',12,[b('12:00',12,'cancelled')],90).length>0,true);
 assert.equal(available(date,'12:10',12,[{...b('12:00',12),date:'2027-01-06'}],90).length>0,true);
 // A symmetric +/-30 minute total would wrongly reject these separate windows.
 assert.equal(available(date,'12:20',6,[b('12:00',10),b('12:40',10)],90).length>0,true);
 assert.deepEqual(available(date,'12:20',4,[b('12:00',6),b('12:10',6),b('12:20',2)],90),[]);
});

import {bookingSlots,depositDue,needsPreorder} from '../rules.js';
import {bookingMessage} from '../email.js';
test('Christmas season includes its boundaries and excludes Tuesday, Monday and all Sundays',()=>{
 assert.ok(bookingSlots('2026-11-25','christmas',now).length);
 assert.ok(bookingSlots('2026-12-23','christmas',now).length);
 for(const date of ['2026-11-24','2026-12-24','2026-12-01','2026-11-30','2027-11-25'])assert.deepEqual(bookingSlots(date,'christmas',now),[]);
 for(const date of ['2026-11-29','2026-12-06','2026-12-13','2026-12-20']){assert.deepEqual(bookingSlots(date,'christmas',now),[]);assert.ok(bookingSlots(date,'standard',now).length);}
 assert.ok(bookingSlots('2026-12-01','standard',now).length);
});
test('Christmas deposit replaces the ordinary group deposit at all party sizes',()=>{
 for(const size of [1,2,8,10,12]){assert.equal(depositDue({booking_type:'christmas',size}),size*500);assert.equal(needsPreorder({booking_type:'christmas',size}),true);}
 assert.equal(depositDue({booking_type:'standard',size:10}),2500);assert.equal(depositDue({booking_type:'standard',size:8}),0);
});
test('Christmas reservation email states pending payment and includes only Christmas documents',()=>{
 const b={booking_type:'christmas',size:8,name:'Test',reference:'RL-TEST',tables:[9,10],payment_token:'test-token'};
 const pending=bookingMessage(b,'pending_deposit','https://example.invalid');assert.match(pending.subject,/Christmas Party pending deposit/);assert.match(pending.body,/£5 per person × 8 = £40/);assert.match(pending.body,/not yet confirmed/);assert.match(pending.body,/call 01788 822265 to pay your £40 deposit over the phone/);assert.doesNotMatch(pending.body,/deposit online|\?payment=/);assert.doesNotMatch(pending.body,/£25/);assert.deepEqual(pending.attachments,['christmas-menu-2026.pdf','christmas-pre-order-form.pdf']);assert.match(pending.staffNote,/decorate the table/);
 const confirmed=bookingMessage({...b,deposit_paid:1},'confirmed','https://example.invalid');assert.match(confirmed.body,/Christmas Party is confirmed/);assert.doesNotMatch(confirmed.body,/Pay your/);
 const cancelled=bookingMessage(b,'cancelled','https://example.invalid');assert.deepEqual(cancelled.attachments,[]);assert.doesNotMatch(cancelled.body,/Pay your/);
});
