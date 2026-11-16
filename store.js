import initSqlJs from 'sql.js';
import fs from 'node:fs';
import path from 'node:path';
const SQL=await initSqlJs();
const file=process.env.DB_PATH||'data/coverstead.sqlite';fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
// A sql.js database is a single-process store. Refuse a second writer.
const lock=file+'.lock';
for(let attempt=0;attempt<2;attempt++) {
 try { const fd=fs.openSync(lock,'wx',0o600);fs.writeFileSync(fd,String(process.pid));fs.closeSync(fd);break; }
 catch(e) { if(e.code!=='EEXIST')throw e;const pid=Number(fs.readFileSync(lock,'utf8'));let alive=true;try{process.kill(pid,0);}catch(err){if(err.code==='ESRCH')alive=false;}if(alive||attempt)throw Error('Database is already in use by another process. Run one worker per venue.');fs.unlinkSync(lock); }
}
process.on('exit',()=>{try{if(fs.readFileSync(lock,'utf8')===String(process.pid))fs.unlinkSync(lock);}catch{}});
process.on('SIGTERM',()=>process.exit(0));
process.on('SIGINT',()=>process.exit(0));
let db=new SQL.Database(fs.existsSync(file)?fs.readFileSync(file):undefined);
db.run(`CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY, reference TEXT UNIQUE, created TEXT, date TEXT, time TEXT, service TEXT, name TEXT, phone TEXT, email TEXT, size INTEGER, requirements TEXT, tables_json TEXT, duration INTEGER, status TEXT, deposit_paid INTEGER DEFAULT 0, preorder_received INTEGER DEFAULT 0, notes TEXT DEFAULT ''); CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY, booking_id TEXT, recipient TEXT, subject TEXT, body TEXT, attempts INTEGER DEFAULT 0, sent TEXT, error TEXT);`);
export function query(sql,args=[]){const stmt=db.prepare(sql);try{stmt.bind(args);const rows=[];while(stmt.step())rows.push(stmt.getAsObject());return rows;}finally{stmt.free();}}
export function run(sql,args=[]){if(args.length)db.run(sql,args);else db.run(sql);}
export function save(){const tmp=file+'.tmp';let fd;try{fd=fs.openSync(tmp,'w',0o600);fs.writeFileSync(fd,db.export());fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.renameSync(tmp,file);}catch(e){if(fd!==undefined)fs.closeSync(fd);try{fs.unlinkSync(tmp);}catch{}throw e;}}
export function transaction(fn){const before=db.export();db.run('BEGIN IMMEDIATE');try{const result=fn();db.run('COMMIT');save();return result;}catch(e){try{db.run('ROLLBACK');}catch{}db.close();db=new SQL.Database(before);throw e;}}
if(!query('PRAGMA table_info(bookings)').some(c=>c.name==='payment_token'))run("ALTER TABLE bookings ADD COLUMN payment_token TEXT");
run('CREATE TABLE IF NOT EXISTS payments(booking_id TEXT PRIMARY KEY, link_id TEXT, url TEXT, expires TEXT, transaction_id TEXT)');
if(!query('PRAGMA table_info(bookings)').some(c=>c.name==='booking_type'))run("ALTER TABLE bookings ADD COLUMN booking_type TEXT NOT NULL DEFAULT 'standard'");
if(!query('PRAGMA table_info(bookings)').some(c=>c.name==='deposit_amount')){
 run('ALTER TABLE bookings ADD COLUMN deposit_amount INTEGER NOT NULL DEFAULT 0');
 run("UPDATE bookings SET deposit_amount=2500 WHERE size>=10");
}
if(!query('PRAGMA table_info(outbox)').some(c=>c.name==='attachments_json'))run("ALTER TABLE outbox ADD COLUMN attachments_json TEXT");
if(!query('PRAGMA table_info(bookings)').some(c=>c.name==='seating_mode'))run("ALTER TABLE bookings ADD COLUMN seating_mode TEXT NOT NULL DEFAULT 'joined'");
run(`CREATE TABLE IF NOT EXISTS customers(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,phone TEXT,notes TEXT DEFAULT '',marketing_email INTEGER DEFAULT 0,consent_updated TEXT,consent_source TEXT,unsubscribe_token TEXT UNIQUE,created TEXT,updated TEXT);
CREATE TABLE IF NOT EXISTS consent_events(id TEXT PRIMARY KEY,customer_id TEXT,allowed INTEGER,source TEXT,note TEXT,created TEXT);
CREATE TABLE IF NOT EXISTS vouchers(id TEXT PRIMARY KEY,customer_id TEXT,code TEXT UNIQUE,value INTEGER,issued TEXT,expires TEXT,reward_period TEXT,status TEXT DEFAULT 'issued',redeemed TEXT,notes TEXT DEFAULT '');
CREATE UNIQUE INDEX IF NOT EXISTS one_reward_per_period ON vouchers(customer_id,reward_period);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);`);
if(!query('PRAGMA table_info(vouchers)').some(c=>c.name==='kind'))run("ALTER TABLE vouchers ADD COLUMN kind TEXT NOT NULL DEFAULT 'cash'");
run(`CREATE TABLE IF NOT EXISTS customer_visits(id TEXT PRIMARY KEY,customer_id TEXT,visit_date TEXT,visit_time TEXT,booking_type TEXT DEFAULT 'standard',reference TEXT,notes TEXT DEFAULT '',source TEXT,import_key TEXT UNIQUE);
CREATE TABLE IF NOT EXISTS reward_claims(visit_key TEXT PRIMARY KEY,voucher_id TEXT);`);
for(const column of ['customer_id','category'])if(!query('PRAGMA table_info(outbox)').some(c=>c.name===column))run('ALTER TABLE outbox ADD COLUMN '+column+' TEXT');
if(!query('PRAGMA table_info(customers)').some(c=>c.name==='christmas_contact'))run('ALTER TABLE customers ADD COLUMN christmas_contact INTEGER NOT NULL DEFAULT 0');
export function bookings(){return query('SELECT * FROM bookings ORDER BY date,time,created').map(b=>({...b,tables:JSON.parse(b.tables_json),tables_json:undefined}));}
save();

if(!query('PRAGMA table_info(bookings)').some(c=>c.name==='staff_created')){run('ALTER TABLE bookings ADD COLUMN staff_created INTEGER NOT NULL DEFAULT 0');save();}

run('CREATE TABLE IF NOT EXISTS service_closures(id TEXT PRIMARY KEY,date TEXT NOT NULL,service TEXT NOT NULL,reason TEXT NOT NULL,created TEXT NOT NULL,UNIQUE(date,service))');save();

if(!query('PRAGMA table_info(bookings)').some(c=>c.name==='kitchen_override')){run('ALTER TABLE bookings ADD COLUMN kitchen_override INTEGER NOT NULL DEFAULT 0');save();}

if(!query('PRAGMA table_info(bookings)').some(c=>c.name==='walk_in')){run('ALTER TABLE bookings ADD COLUMN walk_in INTEGER NOT NULL DEFAULT 0');save();}

run('CREATE TABLE IF NOT EXISTS booking_requests(id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, response TEXT NOT NULL)');save();
