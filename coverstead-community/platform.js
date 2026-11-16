import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {query,run,transaction,bookings} from './store.js';
import {venue,saveVenue,publicVenue,defaults} from './venue.js';

export const enterprise = process.env.EDITION === 'enterprise';
export const demo = process.env.DEMO_MODE === 'true';
const secure = process.env.COOKIE_SECURE !== 'false';
const sessions = new Map();
export const assets = path.resolve(process.env.ASSET_PATH || 'data/assets');
fs.mkdirSync(assets,{recursive:true,mode:0o700});
transaction(()=>run(`CREATE TABLE IF NOT EXISTS staff_users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL,active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS audit_events(id TEXT PRIMARY KEY,created TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,status INTEGER NOT NULL);`));
const hashPassword=password=>{const salt=crypto.randomBytes(16).toString('hex');return salt+':'+crypto.scryptSync(password,salt,64).toString('hex');};
function verify(password,hash){const [salt,value]=hash.split(':');return crypto.timingSafeEqual(crypto.scryptSync(password,salt,64),Buffer.from(value,'hex'));}
export function addUser({name,email,password,role='staff'}) {
  if(typeof name!=='string'||!name.trim()||name.length>100||typeof email!=='string'||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof password!=='string'||password.length<16||password.length>256||!['owner','manager','staff'].includes(role))throw Object.assign(new Error('Provide a name, valid email, role and a password of 16–256 characters.'),{status:400});
  if(query('SELECT id FROM staff_users WHERE email=?',[email.trim().toLowerCase()]).length)throw Object.assign(new Error('That staff email is already in use.'),{status:409});
  const user={id:crypto.randomUUID(),email:email.trim().toLowerCase(),name:name.trim(),role};
  transaction(()=>run('INSERT INTO staff_users(id,email,name,password_hash,role) VALUES(?,?,?,?,?)',[user.id,user.email,user.name,hashPassword(password),role]));
  return user;
}
export function audit(actor,action,target,status=200) {
  transaction(()=>run('INSERT INTO audit_events VALUES(?,?,?,?,?,?)',[crypto.randomUUID(),new Date().toISOString(),actor,action,String(target).slice(0,300),status]));
}
export function auth(req,res,next) {
  const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('cs_session='))?.slice(11);
  const session=sessions.get(token);
  const user=session&&session.expires>Date.now()?query('SELECT id,email,name,role,active FROM staff_users WHERE id=?',[session.user.id])[0]:null;
  if(!user?.active){if(req.path==='/admin/help')return res.redirect('/admin');return res.status(401).json({error:'Please sign in.'});}
  req.user=user;req.sessionToken=token;next();
}
function session(res,user) {
  const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{user,expires:Date.now()+8*3600e3});
  res.cookie('cs_session',token,{httpOnly:true,secure,sameSite:'strict',maxAge:8*3600e3,path:'/'});
}
const role=(...roles)=>(req,res,next)=>roles.includes(req.user.role)?next():res.status(403).json({error:'Your role cannot perform this action.'});
const paid=(req,res,next)=>enterprise?next():res.status(403).json({error:'This administration feature requires the Enterprise edition.'});
export function registerPlatform(app,throttle) {
  app.get('/api/platform',(_req,res)=>res.json({name:'Coverstead',edition:enterprise?'enterprise':'community',demo,needsOwner:!query('SELECT id FROM staff_users').length,setupComplete:venue.setupComplete}));
  app.post('/api/setup-owner',throttle,(req,res)=>{
    if(query('SELECT id FROM staff_users').length)return res.status(409).json({error:'An owner already exists. Sign in.'});
    const given=String(req.body.token||''),expected=process.env.SETUP_TOKEN||'';
    if(expected.length<24||Buffer.byteLength(given)!==Buffer.byteLength(expected)||!crypto.timingSafeEqual(Buffer.from(given),Buffer.from(expected)))return res.status(403).json({error:'Enter the installation token supplied by your server administrator.'});
    const user=addUser({...req.body,role:'owner'});session(res,user);res.status(201).json({user});
  });
  app.post('/api/login',throttle,(req,res)=>{
    const email=String(req.body.email||'').toLowerCase().trim(),password=String(req.body.password||'').slice(0,256);
    const user=query('SELECT * FROM staff_users WHERE email=? AND active=1',[email])[0];
    const valid=verify(password,user?.password_hash||'not-a-user:'+Buffer.alloc(64).toString('hex'));
    if(!user||!valid)return res.status(401).json({error:'Incorrect email or password.'});
    delete user.password_hash;session(res,user);res.json({user});
  });
  app.post('/api/demo-login',throttle,(_req,res)=>{
    if(!demo)return res.status(404).json({error:'Not found.'});
    const user=query("SELECT id,email,name,role FROM staff_users WHERE email='demo@example.invalid'")[0];
    if(!user)return res.status(503).json({error:'Demo has not been seeded.'});
    session(res,user);res.json({user});
  });
  app.post('/api/logout',auth,(req,res)=>{sessions.delete(req.sessionToken);res.clearCookie('cs_session',{path:'/'});res.json({ok:true});});
  // Central enforcement covers original routes too, including export and CSV import.
  app.use('/api/admin',auth,(req,res,next)=>{
    const ownerOnly=/^\/(settings|draft|assets|team)/.test(req.path);
    const managerOnly=/export|\/import|\/audit/.test(req.path);
    if(ownerOnly&&req.user.role!=='owner'||managerOnly&&!['owner','manager'].includes(req.user.role))return res.status(403).json({error:'Ask your venue owner to perform this action.'});
    if(req.method!=='GET')res.on('finish',()=>{if(res.statusCode<400)try{audit(req.user.id,req.method,req.originalUrl.split('?')[0],res.statusCode);}catch{console.error('Activity log write failed.');}});
    next();
  });
  app.get('/api/admin/me',auth,(req,res)=>res.json({user:req.user,enterprise,demo}));
  app.get('/api/admin/settings',auth,role('owner'),(_req,res)=>res.json({venue,defaults,draft:JSON.parse(query("SELECT value FROM settings WHERE key='draft'")[0]?.value||'null'),emailReady:!!process.env.SMTP_HOST&&process.env.EMAIL_DNS_READY==='true'&&!demo}));
  app.post('/api/admin/draft',auth,role('owner'),(req,res)=>{
    const draft=JSON.stringify(req.body);if(draft.length>100000)return res.status(400).json({error:'Draft is too large.'});
    transaction(()=>run("INSERT INTO settings(key,value) VALUES('draft',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[draft]));res.json({ok:true});
  });
  app.put('/api/admin/settings',auth,role('owner'),(req,res)=>{
    const value=saveVenue(req.body);transaction(()=>run("DELETE FROM settings WHERE key='draft'"));res.json({venue:value});
  });
  app.post('/api/admin/assets',auth,role('owner'),(req,res)=>{
    const {type,data}=req.body, extensions={'application/pdf':'pdf','image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
    if(!extensions[type]||typeof data!=='string'||data.length>7000000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data))return res.status(400).json({error:'Choose a PDF, PNG, JPEG or WebP under 5 MB.'});
    const bytes=Buffer.from(data,'base64');
    const valid=type==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
    if(!valid||bytes.length>5*1024*1024)return res.status(400).json({error:'File content does not match the chosen type, or is over 5 MB.'});
    const file=crypto.randomUUID()+'.'+extensions[type];fs.writeFileSync(path.join(assets,file),bytes,{mode:0o600});res.status(201).json({url:'/assets/'+file});
  });
  app.get('/api/admin/team',auth,paid,role('owner'),(_req,res)=>res.json({users:query('SELECT id,email,name,role,active FROM staff_users ORDER BY name')}));
  app.post('/api/admin/team',auth,paid,role('owner'),(req,res)=>res.status(201).json({user:addUser(req.body)}));
  app.patch('/api/admin/team/:id',auth,paid,role('owner'),(req,res)=>{
    if(req.params.id===req.user.id)return res.status(400).json({error:'You cannot disable your own account.'});
    if(typeof req.body.active!=='boolean')return res.status(400).json({error:'Choose active or disabled.'});
    if(!query('SELECT id FROM staff_users WHERE id=?',[req.params.id]).length)return res.status(404).json({error:'User not found.'});
    transaction(()=>run('UPDATE staff_users SET active=? WHERE id=?',[Number(req.body.active),req.params.id]));res.json({ok:true});
  });
  app.post('/api/admin/password',auth,(req,res)=>{
    const u=query('SELECT * FROM staff_users WHERE id=?',[req.user.id])[0];
    if(!verify(String(req.body.current||'').slice(0,256),u.password_hash))return res.status(403).json({error:'Current password is incorrect.'});
    const password=req.body.password;if(typeof password!=='string'||password.length<16||password.length>256)return res.status(400).json({error:'Use 16–256 characters.'});
    transaction(()=>run('UPDATE staff_users SET password_hash=? WHERE id=?',[hashPassword(password),u.id]));
    for(const[t,s]of sessions)if(s.user.id===u.id)sessions.delete(t);session(res,req.user);res.json({ok:true});
  });
  app.get('/api/admin/audit',auth,paid,role('owner','manager'),(_req,res)=>res.json({events:query('SELECT a.*,u.name AS actor_name FROM audit_events a LEFT JOIN staff_users u ON a.actor=u.id ORDER BY a.created DESC LIMIT 200')}));
  app.get('/api/admin/bookings-export',auth,role('owner','manager'),(_req,res)=>{
    const columns=['reference','date','time','service','name','phone','email','size','status','requirements','notes'];
    const cell=x=>'"'+String(x??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
    res.type('text/csv').attachment('coverstead-bookings.csv').send([columns,...bookings().map(b=>columns.map(k=>b[k]))].map(row=>row.map(cell).join(',')).join('\r\n'));
  });
  app.get('/api/admin/reports',auth,paid,role('owner','manager'),(_req,res)=>{
    const rows=bookings(),count=status=>rows.filter(b=>b.status===status).length;
    res.json({bookings:rows.length,covers:rows.filter(b=>b.status!=='cancelled').reduce((n,b)=>n+b.size,0),completed:count('completed'),noShows:count('no-show'),cancelled:count('cancelled'),walkins:rows.filter(b=>b.walk_in).length});
  });
}
setInterval(()=>{for(const[k,v]of sessions)if(v.expires<Date.now())sessions.delete(k);},60000).unref();
