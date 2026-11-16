import {venue} from './venue.js';
import crypto from 'node:crypto';
import {query,run,transaction,bookings} from './store.js';
import {walkinSession,tables,assignedTablesAvailable,kitchenAvailable} from './rules.js';
import {serviceClosed} from './closures.js';
export function registerWalkins(app,auth){
 app.get('/api/admin/walk-ins',auth,(req,res)=>{
 const session=walkinSession();if(!session||serviceClosed(session.date,session.service))return res.json({session:null,tables:[],message:'There is no open dining service right now.'});
 const current=bookings();res.json({session,tables:tables.map(t=>({...t,available:assignedTablesAvailable(session.date,session.time,1,[t.id],current,venue.duration,true)}))});
 });
 app.post('/api/admin/walk-ins',auth,(req,res)=>{
 const session=walkinSession(),size=Number(req.body.size),selected=req.body.tables;
 if(!session||serviceClosed(session.date,session.service))return res.status(409).json({error:'There is no open dining service right now.'});
 if(!Number.isSafeInteger(size)||size<1)return res.status(400).json({error:'Enter the number of guests.'});
 if(!assignedTablesAvailable(session.date,session.time,size,selected,[],venue.duration,true))return res.status(400).json({error:'Select valid tables with enough seats for these guests.'});
 let kitchenWarning=null;
 const id=crypto.randomUUID(),reference='CS-'+crypto.randomBytes(5).toString('hex').toUpperCase();
 try{transaction(()=>{
 const current=bookings();if(!assignedTablesAvailable(session.date,session.time,size,selected,current,venue.duration,true))throw Error('TABLES');
 if(!kitchenAvailable(session.date,session.time,size,current)&&!venue.walkinKitchenOverride)throw Error('KITCHEN');
 if(!kitchenAvailable(session.date,session.time,size,current))kitchenWarning='The kitchen is busy: this walk-in takes arrivals over the configured arrival limit. Let the customer know they can be seated, but there may be a slight wait for food.';
 run(`INSERT INTO bookings(id,reference,created,date,time,service,name,phone,email,size,requirements,tables_json,duration,status,payment_token,booking_type,deposit_amount,seating_mode,deposit_paid,notes,staff_created,kitchen_override,walk_in) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[id,reference,new Date().toISOString(),session.date,session.time,session.service,'Walk-in','','',size,'',JSON.stringify(selected),venue.duration,'arrived',null,'standard',0,'separate',0,'Walk-in seated by staff.'+(kitchenWarning?' Kitchen busy — advise customer there may be a slight wait for food.':''),1,1,1]);
 });res.status(201).json({reference,...session,size,tables:selected,duration:venue.duration,kitchenWarning});
 }catch(e){if(e.message==='KITCHEN')return res.status(409).json({error:'This walk-in would exceed your kitchen limit.'});if(e.message==='TABLES')return res.status(409).json({error:'A selected table overlaps another booking during the reserved time. Choose a different table.'});throw e;}
 });
}
