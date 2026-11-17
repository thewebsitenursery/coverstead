import '../env.js';
import {mailTransportConfigured} from '../mail-delivery.js';
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';

const env=process.env,checks=[];
const add=(name,ok,detail)=>checks.push({name,status:ok?'pass':'blocked',detail});
add('Node runtime',Number(process.versions.node.split('.')[0])>=20,'The application requires Node 20 or later; use a maintained runtime for new deployments.');
let origin;try{origin=new URL(env.PUBLIC_URL);}catch{}
add('HTTPS public address',origin?.protocol==='https:','Real venues need their own HTTPS origin.');
add('Secure staff cookies',env.COOKIE_SECURE!=='false','COOKIE_SECURE must be true behind HTTPS.');
add('Demo bypass disabled',env.DEMO_MODE!=='true','DEMO_MODE must be false for any real venue.');
const database=path.resolve(env.DB_PATH||'data/coverstead.sqlite');
let db;
try{
 const mode=fs.statSync(database).mode;
 add('Private database file',(mode&0o077)===0,'Database permissions must exclude group and other access.');
 const SQL=await initSqlJs();db=new SQL.Database(fs.readFileSync(database));
 add('Database integrity',db.exec('PRAGMA integrity_check')[0]?.values[0]?.[0]==='ok','Checks a consistent in-memory copy of the saved snapshot.');
 const row=db.exec("SELECT value FROM settings WHERE key='venue'")[0]?.values[0]?.[0];
 const venue=row?JSON.parse(row):{};
 add('Venue onboarding complete',venue.setupComplete===true,'Complete and rehearse this venue’s settings before accepting real bookings.');
 const owners=db.exec("SELECT count(*) FROM staff_users WHERE role='owner' AND active=1")[0]?.values[0]?.[0]||0;
 add('Active owner exists',owners>0,'The private setup token must be used by the installation owner.');
 const pending=db.exec('SELECT count(*) FROM outbox WHERE sent IS NULL')[0]?.values[0]?.[0]||0;
 const failed=db.exec('SELECT count(*) FROM outbox WHERE sent IS NULL AND attempts>0')[0]?.values[0]?.[0]||0;
 checks.push({name:'Email queue',status:failed?'blocked':'info',pending,failed,detail:'SMTP acceptance does not prove inbox delivery.'});
}catch{add('Readable venue database',false,'Database is missing or could not be checked; no private records were printed.');}finally{db?.close();}
add('Email configuration declared ready',mailTransportConfigured(env)&&env.EMAIL_DNS_READY==='true','This checks configuration only; confirm receipt of a controlled real test separately.');
const backupRoot=path.resolve(env.BACKUP_DIR||'data/backups');
let recent=false;
if(fs.existsSync(backupRoot))for(const entry of fs.readdirSync(backupRoot,{withFileTypes:true})){
 if(!entry.isDirectory()||!/^\d{4}-\d{2}-\d{2}T/.test(entry.name))continue;
 const file=path.join(backupRoot,entry.name,'coverstead.sqlite');
 if(fs.existsSync(file)&&Date.now()-fs.statSync(file).mtimeMs<86400000)recent=true;
}
add('Recent local backup',recent,'At least one snapshot within 24 hours; this does not prove off-server storage or restoration.');
checks.push({name:'Manual release gates',status:'manual',detail:'Confirm real email receipt, owner login, sample service, isolated restore, off-server recovery, support contact, privacy/terms and monitoring. This diagnostic cannot certify those.'});
const blocked=checks.filter(c=>c.status==='blocked').length;
console.log(JSON.stringify({purpose:'Read-only real-venue readiness review; the product website may intentionally be unconfigured.',blocked,checks},null,2));
process.exitCode=blocked?1:0;
