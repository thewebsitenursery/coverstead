import crypto from 'node:crypto';
import {query,run,transaction,bookings} from './store.js';
import {slots,londonNow} from './rules.js';
export const closures=()=>query('SELECT * FROM service_closures ORDER BY date,service');
export const serviceClosed=(date,service)=>query('SELECT id FROM service_closures WHERE date=? AND service=?',[date,service]).length>0;
export function registerClosures(app,auth){
 app.get('/api/admin/closures',auth,(req,res)=>res.json({closures:closures()}));
 app.post('/api/admin/closures',auth,(req,res)=>{
 const date=String(req.body.date||''),service=req.body.service,reason=String(req.body.reason||'').trim().slice(0,300);
 if(!['Lunch','Dinner','All day'].includes(service)||!reason||!slots(date).length)return res.status(400).json({error:'Choose a future service date and enter an event or reason.'});
 const services=[...new Set(slots(date).map(s=>s.service))].filter(s=>service==='All day'||s===service);
 if(!services.length)return res.status(400).json({error:'There is no such service on this date.'});
 const conflicts=bookings().filter(b=>b.date===date&&services.includes(b.service)&&b.status!=='cancelled');
 if(conflicts.length&&req.body.acknowledge!==true)return res.status(409).json({error:`There are ${conflicts.length} existing bookings in this session. They will stay in the diary and must be contacted separately.`,conflicts:conflicts.length});
 transaction(()=>{for(const s of services)run('INSERT INTO service_closures(id,date,service,reason,created) VALUES(?,?,?,?,?) ON CONFLICT(date,service) DO UPDATE SET reason=excluded.reason',[crypto.randomUUID(),date,s,reason,new Date().toISOString()]);});res.json({ok:true,existingBookings:conflicts.length});
 });
 app.delete('/api/admin/closures/:id',auth,(req,res)=>{transaction(()=>run('DELETE FROM service_closures WHERE id=?',[req.params.id]));res.json({ok:true});});
}
