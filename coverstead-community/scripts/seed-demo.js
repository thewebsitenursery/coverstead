import crypto from 'node:crypto';
import {venue,defaults,saveVenue} from '../venue.js';
import {addUser,demo} from '../platform.js';
import {query,run,transaction} from '../store.js';
import {upsertCustomer} from '../crm.js';
import {londonNow} from '../rules.js';
if(!demo)throw Error('Demo seeding requires DEMO_MODE=true.');
if(!query('SELECT id FROM staff_users').length)addUser({name:'Alex Morgan',email:'demo@example.invalid',password:crypto.randomBytes(32).toString('hex'),role:'owner'});
if(!venue.setupComplete){const v=structuredClone(defaults);Object.assign(v,{name:'The Copper Fox',tagline:'A table for good food and even better company.',email:'hello@example.invalid',phone:'01632 960123',address:'Sample village · demonstration venue',openingHours:'Monday–Saturday: 12:00–23:00\nSunday: 12:00–20:00',accessNotes:'Sample venue. Step-free dining room; please tell the team about any accessibility requirements.',revision:venue.revision});v.services[1].periods=structuredClone(v.services[2].periods);saveVenue(v);}
if(!query('SELECT id FROM bookings').length){const date=londonNow().slice(0,10);transaction(()=>{for(const [i,name,time,size,tables,requirements] of [[1,'Emily Harper','18:00',2,[4],'A window table if possible'],[2,'James Wilson','18:10',4,[5],''],[3,'Sam Taylor','18:40',6,[1],'Celebrating a birthday'],[4,'Morgan Reed','19:00',2,[7],'Step-free access requested'],[5,'Charlie Ellis','19:20',4,[9],'']]){const b={id:crypto.randomUUID(),reference:'CS-DEMO-'+i,date,time,size,tables,name,phone:'01632 960123',email:'guest'+i+'@example.invalid',booking_type:'standard'};run('INSERT INTO bookings(id,reference,created,date,time,service,name,phone,email,size,requirements,tables_json,duration,status,booking_type,deposit_amount,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',[b.id,b.reference,new Date().toISOString(),date,time,'Dinner',name,b.phone,b.email,size,requirements,JSON.stringify(tables),90,'confirmed','standard',0,i===3?'Birthday cake with the team.':'']);upsertCustomer(b,'Synthetic demo',false);}});}
console.log('Sample venue ready. No live guest data or outgoing messages.');
