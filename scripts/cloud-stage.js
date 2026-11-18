// Creates fresh synthetic configuration only. Never loads/copies production data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';

const target=process.argv[2];
if(process.argv.length!==3||!target)throw Error('Usage: node scripts/cloud-stage.js NEW_PRIVATE_DIRECTORY');
const root=path.resolve(target);
// No recursive creation: existing directories, including symlinks, are refused.
fs.mkdirSync(root,{mode:0o700});
const managed=path.join(root,'managed'),runtime='/var/lib/coverstead';
const source=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
execFileSync(process.execPath,[path.join(source,'scripts/managed-venue.js'),'create',managed,'cloud-rehearsal','owner@example.invalid','test'],{stdio:'pipe'});
const venueFile=path.join(managed,'cloud-rehearsal/config.env');
const venue=dotenv.parse(fs.readFileSync(venueFile));
const serialize=values=>Object.entries(values).map(([k,v])=>k+'='+JSON.stringify(v)).join('\n')+'\n';
const disabled={STRIPE_BILLING_ENABLED:'false',STRIPE_MODE:'test',STRIPE_LIVE_READY:'false',ONLINE_DEPOSITS_ENABLED:'false',SMTP_HOST:'',EMAIL_DNS_READY:'false',BILLING_EMAIL_ENABLED:'false',ENQUIRIES_ENABLED:'false',ENQUIRY_EMAIL_ENABLED:'false',MANAGED_ALERTS_ENABLED:'false',WEBSITE_METRICS_ENABLED:'false',COVERSTEAD_STAGING:'true'};
for(const key of ['DB_PATH','ASSET_PATH','BACKUP_DIR'])venue[key]=runtime+venue[key].slice(root.length);
// A synthetic service must not pretend to have a paid subscription/readiness.
delete venue.MANAGED_ENTITLEMENT;
fs.writeFileSync(venueFile,serialize({...venue,...disabled}),{mode:0o600});
const config={PUBLIC_URL:'https://preview.coverstead.net',PORT:'3100',HOST:'0.0.0.0',COOKIE_SECURE:'true',DB_PATH:runtime+'/product.sqlite',ASSET_PATH:runtime+'/assets',BACKUP_DIR:runtime+'/backups',MANAGED_ROOT:runtime+'/managed',EDITION:'community',DEMO_MODE:'false',SETUP_TOKEN:crypto.randomBytes(32).toString('hex'),NODE_ENV:'production',...disabled};
fs.writeFileSync(path.join(root,'config.env'),serialize(config),{mode:0o600,flag:'wx'});
fs.writeFileSync(path.join(root,'staging-only.json'),JSON.stringify({version:1,purpose:'Synthetic DigitalOcean rehearsal; no production data or credentials',created:new Date().toISOString(),hosts:['preview.coverstead.net','cloud-rehearsal.coverstead.net']},null,2)+'\n',{mode:0o600,flag:'wx'});
console.log('Fresh staging configuration created. Payments, mail and enquiries are disabled.');
console.log('Private directory: '+root+' (container runtime path: '+runtime+').');
console.log('Keep setup tokens private. Set directory ownership to UID/GID 1000 on the new VM before starting the container.');
