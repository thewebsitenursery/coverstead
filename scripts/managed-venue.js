import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {managedRegistry,readinessChecks} from '../managed.js';

const [command, directory, slug, email, mode='test'] = process.argv.slice(2);
if (!directory) throw Error('Usage: node scripts/managed-venue.js create|list ROOT [slug email test|live]');
const root = path.resolve(directory);
fs.mkdirSync(root, {recursive:true,mode:0o700});
const registry = path.join(root,'registry.json');
if (!fs.existsSync(registry)) fs.writeFileSync(registry,JSON.stringify({version:1,venues:[]})+'\n',{mode:0o600,flag:'wx'});
const api = managedRegistry(root);
if (command==='list') {
  console.log(JSON.stringify(api.read().venues.map(v=>({slug:v.slug,url:v.url,mode:v.mode,ready:api.status(v.email,v.mode).ready,missing:readinessChecks.filter(k=>!v.checks?.[k])})),null,2));
} else if (command==='create') {
  if (!/^[a-z][a-z0-9-]{2,39}$/.test(slug||'') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email||'') || !['test','live'].includes(mode)) throw Error('Provide a slug, valid billing email and mode.');
  const lock=registry+'.lock';const fd=fs.openSync(lock,'wx',0o600);fs.closeSync(fd);
  try {
    const state=api.read();
    if(state.venues.length>=3 || state.venues.some(v=>v.slug===slug || v.mode===mode&&v.email.toLowerCase()===email.toLowerCase())) throw Error('Venue already exists or this host is at its three-venue launch limit.');
    const venueDir=path.join(root,slug);fs.mkdirSync(venueDir,{mode:0o700});
    const url='https://'+slug+'.coverstead.net';
    const config={PUBLIC_URL:url,HOST:'127.0.0.1',COOKIE_SECURE:'true',DB_PATH:path.join(venueDir,'coverstead.sqlite'),ASSET_PATH:path.join(venueDir,'assets'),BACKUP_DIR:path.join(venueDir,'backups'),EDITION:'enterprise',DEMO_MODE:'false',SETUP_TOKEN:crypto.randomBytes(32).toString('hex'),MANAGED_ENTITLEMENT:path.join(venueDir,'entitlement.json'),SMTP_HOST:'',EMAIL_DNS_READY:'false',ONLINE_DEPOSITS_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',ENQUIRIES_ENABLED:'false',WEBSITE_METRICS_ENABLED:'false',NODE_ENV:'production'};
    fs.writeFileSync(path.join(venueDir,'config.env'),Object.entries(config).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n',{mode:0o600,flag:'wx'});
    state.venues.push({slug,email:email.toLowerCase(),mode,url,checks:{}});
    fs.writeFileSync(registry+'.tmp',JSON.stringify(state,null,2)+'\n',{mode:0o600});fs.renameSync(registry+'.tmp',registry);api.read();
    console.log(JSON.stringify({slug,url,mode,ready:false,privateConfiguration:path.join(venueDir,'config.env'),next:'Configure HTTPS and mail, complete owner setup and rehearsal, then record readiness evidence in the private registry. No subscription has started.'},null,2));
  } finally {fs.unlinkSync(lock);}
} else throw Error('Unknown managed-venue command.');
