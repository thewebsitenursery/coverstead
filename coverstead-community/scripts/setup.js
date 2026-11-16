import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createInterface} from 'node:readline/promises';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const i=a.indexOf('=');return [a.slice(2,i),a.slice(i+1)];}));
const output=path.resolve(args.output||process.env.ENV_FILE||'data/config.env');
if(fs.existsSync(output)){console.log('Configuration already exists. Your existing settings have been kept.');process.exit(0);}
const input=createInterface({input:process.stdin,output:process.stdout});
try {
 const raw=args.url||(await input.question('Website address [http://localhost:3100]: '))||'http://localhost:3100';
 const url=new URL(raw);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Use an http:// or https:// website address without a path.');
 const port=Number(args.port||3100);if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Port must be 1024–65535.');
 const edition=args.edition||'community';if(!['community','enterprise'].includes(edition))throw Error('Unknown edition.');
 const token=crypto.randomBytes(32).toString('hex');
 const text=`PUBLIC_URL=${url.origin}\nPORT=${port}\nHOST=127.0.0.1\nCOOKIE_SECURE=${url.protocol==='https:'}\nDB_PATH=data/coverstead.sqlite\nASSET_PATH=data/assets\nEDITION=${edition}\nDEMO_MODE=false\nSETUP_TOKEN=${token}\nSMTP_HOST=\nSMTP_PORT=587\nSMTP_USER=\nSMTP_PASSWORD=\nSMTP_FROM=\nEMAIL_DNS_READY=false\nONLINE_DEPOSITS_ENABLED=false\n`;
 fs.mkdirSync(path.dirname(output),{recursive:true,mode:0o700});fs.writeFileSync(output,text,{mode:0o600,flag:'wx'});
 console.log('\nConfiguration saved. Open '+url.origin+'/onboarding after starting the app.');
 console.log('\nYour private installation token (copy it into the owner account form):\n'+token+'\n');
 console.log('Keep this token private. It stops working once an owner exists.');
} finally {input.close();}
