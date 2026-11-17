// A browser-only walkthrough. No live records, network requests or credentials.
export const demoTables=[{id:1,seats:2},{id:2,seats:4},{id:3,seats:6},{id:4,seats:8}];
export const demoSlots=['18:00','18:10','18:20','18:30','18:40','18:50','19:00','19:10','19:20','19:30','19:40','19:50','20:00'];
const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
export const occupies=b=>!['cancelled','completed','no-show'].includes(b.status);
export function sampleBookings(date){return[
 {id:'sample-1',reference:'DEMO-1001',date,time:'18:00',name:'Emily Harper',size:2,table:1,status:'confirmed',requirements:'A window table, if possible.',notes:''},
 {id:'sample-2',reference:'DEMO-1002',date,time:'18:10',name:'James Wilson',size:4,table:2,status:'seated',requirements:'',notes:'A familiar face. Welcome them back.'},
 {id:'sample-3',reference:'DEMO-1003',date,time:'18:30',name:'Sam Taylor',size:6,table:3,status:'confirmed',requirements:'Celebrating a birthday.',notes:'Check the cake with the team.'}
];}
export function availableTable(bookings,date,time,size){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!demoSlots.includes(time)||!Number.isInteger(size)||size<1||size>6)return null;
 const same=bookings.filter(b=>b.date===date&&occupies(b)),arrival=minutes(time);
 const arrivals=[...same.map(b=>({start:minutes(b.time),size:b.size})),{start:arrival,size}];
 if(arrivals.some(a=>arrivals.filter(b=>b.start>=a.start&&b.start<a.start+30).reduce((sum,b)=>sum+b.size,0)>12))return null;
 return demoTables.find(t=>t.seats>=size&&!same.some(b=>b.table===t.id&&minutes(b.time)<arrival+90&&minutes(b.time)+90>arrival))||null;
}
export function addDemoBooking(bookings,input,id){
 const {date,time,size}=input,table=availableTable(bookings,date,time,size);
 if(!table)throw Error('That sample slot is full. Choose another time.');
 const name=String(input.name||'').trim().slice(0,80);if(name.length<2)throw Error('Add a sample guest name.');
 return [...bookings,{id,reference:'DEMO-'+id.slice(-6).toUpperCase(),date,time,size,name,table:table.id,status:'confirmed',requirements:String(input.requirements||'').trim().slice(0,300),notes:''}];
}
export function updateDemoBooking(bookings,id,status,notes){
 const booking=bookings.find(b=>b.id===id);if(!booking)throw Error('Sample booking not found.');
 const allowed=booking.status==='confirmed'?['confirmed','seated','cancelled','no-show']:booking.status==='seated'?['seated','completed','cancelled']:[booking.status];
 if(!allowed.includes(status))throw Error('Reset the demo to try a finished booking again.');
 return bookings.map(b=>b.id===id?{...b,status,notes:String(notes||'').slice(0,500)}:b);
}

export function demoProgress(bookings,lastBooking,staffViewed){
 const booking=bookings.find(b=>b.id===lastBooking);
 const steps=[!!booking,!!booking&&staffViewed,!!booking&&['seated','completed'].includes(booking.status)];
 return {steps,complete:steps.every(Boolean)};
}
