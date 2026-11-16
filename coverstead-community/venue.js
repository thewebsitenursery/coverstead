import { query, run, transaction } from './store.js';
import { EventEmitter } from 'node:events';

const changes = new EventEmitter();
const pubTables = [[1,6],[3,6],[4,2],[5,4],[7,2],[8,2],[9,4],[10,4],[11,6],[12,2],[13,4],[14,2],[15,4],[16,2],[17,4]];
export const defaults = {
  name: 'Your venue', tagline: 'Good food. Good company.', phone: '', email: '', address: '', website: '',
  timezone: 'Europe/London', currency: 'GBP', logo: '', accent: '#28594c',
  tables: pubTables.map(([id,seats]) => ({ id, seats, area: 'Dining room', accessible: false })),
  combinations: [{ids:[1,3],seats:12},{ids:[9,10],seats:8},{ids:[11,12,13],seats:12}],
  capacity: 54, kitchenLimit: 16, kitchenWindow: 30, duration: 90, buffer: 0, interval: 10,
  onlineMax: 12, advanceDays: 365, leadMinutes: 0, walkinKitchenOverride: true,
  groupThreshold: 10, groupDeposit: 2500, preorderHours: 48,
  openingHours: '',
  services: Array.from({length:7}, (_,day) => ({ day, periods: day === 1 ? [] : [
    {name:'Lunch',start:'12:00',last:day===0?'15:30':day===6?'15:00':'14:30',end:day===0?'16:00':day===6?'15:10':'14:40'},
    ...(day===0?[]:[{name:'Dinner',start:'18:00',last:'20:30',end:'21:00'}])
  ]})),
  seasonal: {enabled:false,label:'Christmas Party',start:'2026-11-25',end:'2026-12-23',days:[3,4,5,6],depositPerPerson:500,staffReminder:'Please decorate the table.'},
  menus: [], cancellationPolicy: 'Please contact us as soon as possible to change or cancel your booking. Deposits and refunds are handled by the venue.',
  accessNotes: '', privacyUrl: '', retentionMonths: 24, setupComplete: false, revision: 0
};
const stored = query("SELECT value FROM settings WHERE key='venue'")[0];
export const venue = stored ? JSON.parse(stored.value) : structuredClone(defaults);
if (!stored && process.env.VENUE_PRESET === 'redlion') {
  Object.assign(venue, {name:'The Red Lion', phone:'01788 822265',email:'info@redlionkilsby.co.uk',address:'Kilsby',setupComplete:true});
  venue.seasonal.enabled = true;
  venue.menus = ['pre-order-form.pdf','main-menu.pdf','tuesday-menu.pdf','sunday-menu.pdf','sunday-set-menu.pdf','christmas-menu-2026.pdf','christmas-pre-order-form.pdf'].map(file => ({label:file,type:file.startsWith('christmas')?'christmas':'standard',url:'/documents/'+file}));
}
export function onVenueChange(fn) { changes.on('change', fn); }
const realDate = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s+'T12:00Z')) && new Date(s+'T12:00Z').toISOString().slice(0,10)===s;
const time = s => typeof s==='string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const http = s => { try { return ['http:','https:'].includes(new URL(s).protocol); } catch { return false; } };
export const assetUrl = s => !s || http(s) || /^\/assets\/[a-f0-9-]+\.(pdf|png|jpg|webp)$/.test(s);
export function validateVenue(input) {
  const errors = [], x = structuredClone(input || {});
  for (const [key,max] of Object.entries({name:100,tagline:180,phone:40,email:254,address:500,website:500,logo:500,accent:7,openingHours:2000,cancellationPolicy:3000,accessNotes:2000,privacyUrl:500})) if(typeof x[key]!=='string'||x[key].length>max)errors.push(`Check ${key}.`);
  if ((typeof x.name!=='string'||!x.name.trim()) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email || '') || !/^[-+()\d .]{7,40}$/.test(x.phone || '')) errors.push('Venue name, contact email and telephone are required.');
  if (x.website && !http(x.website) || x.privacyUrl && !http(x.privacyUrl) || !assetUrl(x.logo)) errors.push('Use valid HTTP(S) links or an uploaded logo.');
  if (!/^#[a-fA-F0-9]{6}$/.test(x.accent || '')) errors.push('Choose a valid brand colour.');
  try { new Intl.DateTimeFormat('en',{timeZone:x.timezone}).format(); if(typeof x.timezone!=='string')throw Error(); } catch { errors.push('Choose a valid time zone.'); }
  if (x.currency!=='GBP') errors.push('This release supports GBP.');
  const ints = {capacity:[1,2000],kitchenLimit:[1,2000],kitchenWindow:[5,120],duration:[15,360],buffer:[0,120],interval:[5,60],onlineMax:[1,100],advanceDays:[1,730],leadMinutes:[0,10080],groupThreshold:[1,101],groupDeposit:[0,1000000],preorderHours:[0,168],retentionMonths:[1,120]};
  for (const [k,[min,max]] of Object.entries(ints)) if(!Number.isInteger(x[k])||x[k]<min||x[k]>max)errors.push(`Check ${k}: ${min}–${max}.`);
  if(typeof x.walkinKitchenOverride!=='boolean')errors.push('Choose the walk-in kitchen policy.');
  if(!Array.isArray(x.tables)||!x.tables.length||x.tables.length>200)errors.push('Add between 1 and 200 tables.');
  else {
    const ids=new Set();
    for(const t of x.tables) { if(!t||!Number.isInteger(t.id)||t.id<1||t.id>9999||ids.has(t.id)||!Number.isInteger(t.seats)||t.seats<1||t.seats>100||typeof t.area!=='string'||t.area.length>80||typeof t.accessible!=='boolean')errors.push('Each table needs a unique number, valid seats and an area.'); ids.add(t?.id); }
    if(errors.length)throw Object.assign(new Error([...new Set(errors)].join(' ')),{status:400});
    if(x.capacity>x.tables.reduce((n,t)=>n+(Number(t?.seats)||0),0))errors.push('The seating limit cannot exceed total table seats.');
    if(!Array.isArray(x.combinations)||x.combinations.length>200)errors.push('Check table combinations.');
    else for(const c of x.combinations) if(!c||!Array.isArray(c.ids)||c.ids.length<2||new Set(c.ids).size!==c.ids.length||!c.ids.every(id=>ids.has(id))||!Number.isInteger(c.seats)||c.seats<1||c.seats>x.tables.filter(t=>c.ids.includes(t.id)).reduce((n,t)=>n+t.seats,0))errors.push('Combinations must use known tables and cannot exceed their combined seats.');
  }
  if(!Array.isArray(x.services)||x.services.length!==7||new Set(x.services.map(d=>d?.day)).size!==7)errors.push('Configure all seven days.');
  else for(const d of x.services) {
    if(!Number.isInteger(d?.day)||d.day<0||d.day>6||!Array.isArray(d.periods)||d.periods.length>2){errors.push('Check service days.');continue;}
    const names=new Set(), sorted=[...d.periods].sort((a,b)=>(a?.start||'').localeCompare(b?.start||''));
    for(let i=0;i<sorted.length;i++) { const p=sorted[i]; if(!p||!['Lunch','Dinner'].includes(p.name)||names.has(p.name)||![p.start,p.last,p.end].every(time)||p.start>p.last||p.last>=p.end||(i&&sorted[i-1].end>p.start))errors.push('Services need a unique name and opening ≤ last booking < closing, without overlaps.'); names.add(p?.name); }
  }
  const s=x.seasonal;
  if(!s||typeof s.enabled!=='boolean'||typeof s.label!=='string'||!s.label.trim()||s.label.length>80||!realDate(s.start)||!realDate(s.end)||s.start>s.end||!Array.isArray(s.days)||!s.days.length||!s.days.every(d=>Number.isInteger(d)&&d>=0&&d<=6)||!Number.isInteger(s.depositPerPerson)||s.depositPerPerson<0||s.depositPerPerson>100000||typeof s.staffReminder!=='string'||s.staffReminder.length>300)errors.push('Check seasonal event dates, weekdays, label and deposit.');
  if(!Array.isArray(x.menus)||x.menus.length>20||x.menus.some(m=>!m||typeof m.label!=='string'||!m.label.trim()||m.label.length>100||!['standard','christmas'].includes(m.type)||!m.url||!assetUrl(m.url)))errors.push('Each menu needs a name, booking type and valid link.');
  if(errors.length)throw Object.assign(new Error([...new Set(errors)].join(' ')),{status:400});
  return Object.fromEntries(Object.keys(defaults).map(k=>[k,x[k]]));
}
export function saveVenue(input) {
  const next=validateVenue(input);
  if(input.revision!==venue.revision)throw Object.assign(new Error('Another person changed these settings. Reload before saving.'),{status:409});
  const today=new Intl.DateTimeFormat('sv-SE',{timeZone:venue.timezone}).format(new Date());
  const future=query("SELECT tables_json FROM bookings WHERE date>=? AND status NOT IN ('cancelled','completed')",[today]);
  const used=new Set(future.flatMap(b=>JSON.parse(b.tables_json)));
  if(venue.tables.some(t=>used.has(t.id)&&(!next.tables.some(n=>n.id===t.id)||next.tables.find(n=>n.id===t.id).seats<t.seats)))throw Object.assign(new Error('A future booking uses a table being removed or reduced. Reassign the booking first.'),{status:409});
  next.setupComplete=true;next.revision=venue.revision+1;
  transaction(()=>run("INSERT INTO settings(key,value) VALUES('venue',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[JSON.stringify(next)]));
  Object.assign(venue,next);changes.emit('change');return venue;
}
export function publicVenue() { const {revision,retentionMonths,...rest}=venue;return rest; }
