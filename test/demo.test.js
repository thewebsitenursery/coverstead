import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleBookings,availableTable,addDemoBooking,updateDemoBooking} from '../public/demo-model.js';
const date='2026-12-04';
test('sample bookings share a diary while respecting table overlaps and kitchen arrivals',()=>{
 const original=sampleBookings(date);
 const changed=addDemoBooking(original,{date,time:'19:40',size:2,name:'Sample Guest'},'sample-new');
 assert.equal(original.length,3);assert.equal(changed.length,4);assert.equal(changed.at(-1).table,1);
 const occupied=Array.from({length:4},(_,i)=>({date,time:'19:40',size:2,table:i+1,status:'confirmed'}));
 assert.equal(availableTable(occupied,date,'19:50',2),null);
 const kitchen=[{date,time:'18:00',size:8,table:4,status:'confirmed'},{date,time:'18:20',size:4,table:2,status:'confirmed'}];
 assert.equal(availableTable(kitchen,date,'18:10',1),null);
 assert.ok(availableTable(kitchen,date,'18:30',1));
});
test('sample status updates release capacity and cannot silently revive a cancelled booking',()=>{
 let bookings=sampleBookings(date);bookings=updateDemoBooking(bookings,'sample-1','cancelled','Sample note');
 assert.equal(bookings[0].notes,'Sample note');assert.equal(availableTable(bookings,date,'18:00',2)?.id,1);
 assert.throws(()=>updateDemoBooking(bookings,'sample-1','confirmed',''),/Reset the demo/);
});
test('demo rejects invalid party sizes and times',()=>{
 for(const size of [0,-1,1.5,7,NaN])assert.equal(availableTable([],date,'18:00',size),null);
 assert.equal(availableTable([],date,'25:00',2),null);
 assert.throws(()=>addDemoBooking([],{date,time:'18:00',size:2,name:''},'x'),/sample guest name/);
});

test('guided demo completion requires the visitor booking and its staff action',async()=>{
 const {demoProgress}=await import('../public/demo-model.js');
 const seeded=sampleBookings(date);assert.equal(demoProgress(seeded,'',true).complete,false);
 const made=addDemoBooking(seeded,{date,time:'19:40',size:2,name:'Sample Guest'},'visitor');
 assert.deepEqual(demoProgress(made,'visitor',false).steps,[true,false,false]);
 assert.equal(demoProgress(made,'visitor',true).complete,false);
 const seated=updateDemoBooking(made,'visitor','seated','');assert.equal(demoProgress(seated,'visitor',true).complete,true);
 assert.equal(demoProgress(sampleBookings(date),'visitor',true).complete,false);
});

test('venue-fit advice exposes material gaps and never offers immediate managed enrolment',async()=>{
 const {venueFit}=await import('../public/lead-options.js');
 for(const need of ['cards','sms','pos'])assert.equal(venueFit({locations:'one',need,hosting:'managed'}).gaps.length,1);
 const multiple=venueFit({locations:'several',need:'cards',hosting:'community'});assert.equal(multiple.gaps.length,2);assert.equal(multiple.kind,'community');
 const core=venueFit({locations:'one',need:'bookings',hosting:'managed'});assert.equal(core.gaps.length,0);assert.match(core.next,/does not open a trial/);
 assert.throws(()=>venueFit({locations:'unknown',need:'bookings',hosting:'managed'}),/Choose/);
});
