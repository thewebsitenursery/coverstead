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
