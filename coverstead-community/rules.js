import { venue, onVenueChange } from './venue.js';
export let tables, combinations, configurations, kitchenLimit, christmasSeason;
function refresh() {
  tables=venue.tables;combinations=venue.combinations;kitchenLimit=venue.kitchenLimit;
  configurations=[...tables.map(t=>({ids:[t.id],seats:t.seats})),...combinations].sort((a,b)=>a.seats-b.seats||a.ids.length-b.ids.length);
  christmasSeason={...venue.seasonal,depositPerPerson:venue.seasonal.depositPerPerson/100};
}
refresh();onVenueChange(refresh);
// Compatibility name for the original CRM; uses the configured venue time zone.
export function londonNow(at=new Date()) { return new Intl.DateTimeFormat('sv-SE',{timeZone:venue.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at).replace(' ','T'); }
export const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
export function slots(date,now=londonNow()) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];
  const d=new Date(date+'T12:00Z');
  if(isNaN(d)||d.toISOString().slice(0,10)!==date||date<now.slice(0,10))return [];
  const result=[];
  for(const p of venue.services.find(s=>s.day===d.getUTCDay())?.periods||[]) {
    for(let m=minutes(p.start);m<=minutes(p.last);m+=venue.interval) {
      const time=String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
      if(date+'T'+time>now)result.push({time,service:p.name});
    }
  }
  return result;
}
export function kitchenAvailable(date,time,size,bookings) {
  const arrival=minutes(time),window=venue.kitchenWindow;
  const arrivals=bookings.filter(b=>b.date===date&&b.status!=='cancelled').map(b=>({at:minutes(b.time),size:b.size}));
  arrivals.push({at:arrival,size});
  return arrivals.filter(b=>b.at<=arrival&&b.at>arrival-window).every(start=>arrivals.filter(b=>b.at>=start.at&&b.at<start.at+window).reduce((sum,b)=>sum+b.size,0)<=venue.kitchenLimit);
}
const overlaps=(b,date,start,duration)=>b.date===date&&!['cancelled','completed'].includes(b.status)&&minutes(b.time)<start+duration+venue.buffer&&minutes(b.time)+b.duration+venue.buffer>start;
export function seatingAvailable(date,time,size,bookings,duration) {
  const start=minutes(time),end=start+duration+venue.buffer;
  const active=bookings.filter(b=>b.date===date&&!['cancelled','completed'].includes(b.status));
  const points=[start,...active.map(b=>minutes(b.time)).filter(at=>at>=start&&at<end)];
  return points.every(at=>size+active.filter(b=>minutes(b.time)<=at&&minutes(b.time)+b.duration+venue.buffer>at).reduce((n,b)=>n+b.size,0)<=venue.capacity);
}
export function available(date,time,size,bookings,duration) {
  if(!Number.isInteger(size)||size<1||size>venue.onlineMax||!kitchenAvailable(date,time,size,bookings)||!seatingAvailable(date,time,size,bookings,duration))return [];
  const busy=new Set(bookings.filter(b=>overlaps(b,date,minutes(time),duration)).flatMap(b=>b.tables));
  return configurations.filter(c=>c.seats>=size&&c.ids.every(id=>!busy.has(id)));
}
export function bookingSlots(date,type='standard',now) {
  if(!['standard','christmas'].includes(type))return [];
  const s=venue.seasonal;
  if(type==='christmas'&&(!s.enabled||date<s.start||date>s.end||!s.days.includes(new Date(date+'T12:00Z').getUTCDay())))return [];
  return slots(date,now);
}
export const calculateDeposit=b=>b.booking_type==='christmas'?b.size*venue.seasonal.depositPerPerson:b.size>=venue.groupThreshold?venue.groupDeposit:0;
export const depositDue=b=>Number.isInteger(b.deposit_amount)?b.deposit_amount:calculateDeposit(b);
export const needsPreorder=b=>b.booking_type==='christmas'||b.size>=venue.groupThreshold;
export function assignedTablesAvailable(date,time,size,selected,bookings,duration,separate=false,rearranged=false) {
  if(!Array.isArray(selected)||!selected.length||new Set(selected).size!==selected.length||!selected.every(id=>tables.some(t=>t.id===id)))return false;
  if(!rearranged&&separate&&tables.filter(t=>selected.includes(t.id)).reduce((sum,t)=>sum+t.seats,0)<size)return false;
  if(!rearranged&&!separate&&!configurations.some(c=>c.seats>=size&&c.ids.length===selected.length&&c.ids.every(id=>selected.includes(id))))return false;
  if(!seatingAvailable(date,time,size,bookings,duration))return false;
  return !bookings.some(b=>overlaps(b,date,minutes(time),duration)&&b.tables.some(id=>selected.includes(id)));
}
export function walkinSession(now=new Date()) {
  const local=londonNow(now),date=local.slice(0,10),time=local.slice(11,16);
  const service=venue.services.find(s=>s.day===new Date(date+'T12:00Z').getUTCDay())?.periods.find(p=>time>=p.start&&time<p.end);
  return service?{date,time,service:service.name}:null;
}
