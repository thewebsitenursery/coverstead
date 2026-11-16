import {venue} from './venue.js';
import {slots} from './rules.js';
import {formatDate} from './dates.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function serviceSheet(date,service,bookings,closures=[]){
 const services=service==='Both'?['Lunch','Dinner']:[service];
 const sections=services.map(name=>{
 const times=slots(date,'0000-01-01T00:00').filter(s=>s.service===name).map(s=>s.time);
 const guests=bookings.filter(b=>b.date===date&&b.service===name&&b.status!=='cancelled');
 const allTimes=[...new Set([...times,...guests.map(b=>b.time)])].sort();
 const rows=allTimes.flatMap(time=>{const matches=guests.filter(b=>b.time===time);return (matches.length?matches:[null]).map(b=>`<tr><td class="time">${esc(time)}</td><td class="covers">${b?esc(b.size):''}</td><td class="status"></td><td>${b?`<strong>${esc(b.name)}</strong>${b.booking_type==='christmas'?`<span class="note">${esc(venue.seasonal.label)} · ${esc(venue.seasonal.staffReminder)}</span>`:''}${b.requirements?`<span class="note">${esc(b.requirements)}</span>`:''}${b.notes?`<span class="note">Staff: ${esc(b.notes)}</span>`:''}`:''}</td><td>${b?esc(b.phone||b.email||''):''}</td><td class="tables">${b?esc(b.tables.join(' + ')):''}</td></tr>`);}).join('');
 const block=closures.find(c=>c.date===date&&c.service===name);
 const weekday=new Date(date+'T12:00Z').toLocaleDateString('en-GB',{weekday:'long',timeZone:'UTC'});
 return `<section class="sheet"><header><div class="brand">${venue.logo?`<img src="${esc(venue.logo)}" alt="">`:""}<div><strong>${esc(venue.name)}</strong><span>${esc(venue.address)}</span></div></div><div class="heading"><h1>${esc(name)}</h1><p>${esc(weekday)} ${formatDate(date)}</p></div></header><div class="totals">${guests.length} bookings · ${guests.reduce((n,b)=>n+b.size,0)} covers <span>Status: leave blank for staff notes</span></div>${block?`<p class="closure">SESSION BLOCKED: ${esc(block.reason)}</p>`:''}${allTimes.length?`<table><colgroup><col class="col-time"><col class="col-covers"><col class="col-status"><col class="col-name"><col class="col-contact"><col class="col-table"></colgroup><thead><tr><th>Time</th><th>Covers</th><th>Status</th><th>Customer name</th><th>Contact</th><th>Table</th></tr></thead><tbody>${rows}</tbody></table>`:'<p>No dining service scheduled for this date.</p>'}<div class="notes"><strong>Service notes / walk-ins</strong><div></div><div></div><div></div></div><footer>${esc(venue.name)} · ${esc(venue.phone)} <span>${esc(name)} · ${formatDate(date)}</span></footer></section>`;
 }).join('');
 return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(service)} service sheet · ${formatDate(date)} · ${esc(venue.name)}</title><link rel="stylesheet" href="/service-sheet.css?v=20261101"><script src="/service-sheet-print.js" defer></script></head><body><nav class="print-controls"><button id="print-sheet">Print service sheet</button><a href="/admin">Back to reservations</a><span>A4 portrait · use 100% scale and turn browser headers/footers off.</span></nav>${sections}</body></html>`;
}
