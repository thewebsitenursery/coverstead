import test from 'node:test';import assert from 'node:assert/strict';import {serviceSheet} from '../service-sheet.js';
test('service sheets retain every slot, blank status and same-time bookings',()=>{
 const b={date:'2026-11-01',service:'Lunch',time:'12:30',name:'Guest <one>',phone:'01788 123456',size:2,tables:[4],status:'completed'};
 const html=serviceSheet(b.date,'Lunch',[b,{...b,name:'Guest two',status:'confirmed'},{...b,name:'Cancelled Guest',status:'cancelled'},{...b,name:'Walk-in',time:'13:05',walk_in:1}]);
 assert.match(html,/<h1>Lunch<\/h1>/);assert.match(html,/Sunday 01\/11\/2026/);assert.match(html,/Guest &lt;one&gt;/);assert.match(html,/Guest two/);assert.doesNotMatch(html,/Cancelled Guest/);assert.match(html,/15:30/);assert.match(html,/13:05/);assert.equal((html.match(/<td class="status"><\/td>/g)||[]).length,24);assert.doesNotMatch(html,/>completed<|>confirmed</);
 const both=serviceSheet('2026-11-03','Both',[]);assert.equal((both.match(/class="sheet"/g)||[]).length,2);assert.match(both,/<h1>Dinner<\/h1>/);assert.match(both,/20:30/);
 assert.match(serviceSheet('2026-11-01','Lunch',[],[{date:'2026-11-01',service:'Lunch',reason:'Private event'}]),/SESSION BLOCKED: Private event/);
});
