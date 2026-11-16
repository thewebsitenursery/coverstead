import test from 'node:test';
import assert from 'node:assert/strict';
import {formatDate,parseDate} from '../dates.js';
import {bookingMessage} from '../email.js';
test('UK dates render consistently without changing day across time zones',()=>{
 assert.equal(formatDate('2026-10-31'),'31/10/2026');
 assert.equal(formatDate('2026-10-31T23:30:00.000Z'),'31/10/2026');
 assert.equal(formatDate(null),'');assert.equal(parseDate('31/10/2026'),'2026-10-31');assert.equal(parseDate('2026-10-31'),'2026-10-31');
 const message=bookingMessage({booking_type:'standard',date:'2026-10-31',size:2,tables:[4]},'confirmed','https://example.invalid');assert.match(message.body,/Date: 31\/10\/2026/);
});
