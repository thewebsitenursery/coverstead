import '../env.js';
import fs from 'node:fs';
import {Writable} from 'node:stream';
import {createInterface} from 'node:readline/promises';
const file=process.env.ENV_FILE||(fs.existsSync('data/config.env')?'data/config.env':'.env');
if(!fs.existsSync(file))throw Error('Run setup first.');
let muted=false;
const output=new Writable({write(chunk,_enc,done){if(!muted)process.stdout.write(chunk);done();}});
const rl=createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
try {
 const host=(await rl.question('SMTP host from your email provider: ')).trim();
 const port=(await rl.question('SMTP port [587]: ')).trim()||'587';
 const user=(await rl.question('SMTP username: ')).trim();
 process.stdout.write('SMTP password (hidden): ');muted=true;const password=await rl.question('');muted=false;process.stdout.write('\n');
 const from=(await rl.question('Verified sender email address: ')).trim();
 if(!/^[a-z0-9.-]+$/i.test(host)||!['465','587'].includes(port)||!user||/[\r\n"'`]/.test(user)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from))throw Error('Check your SMTP host, username, port and sender email.');
 const ready=(await rl.question('Have you verified this sender and its DNS with your provider? Type yes to enable delivery: ')).trim()==='yes';
 const values={SMTP_HOST:host,SMTP_PORT:port,SMTP_USER:JSON.stringify(user),SMTP_PASSWORD:'',SMTP_PASSWORD_B64:Buffer.from(password).toString('base64'),SMTP_FROM:from,EMAIL_DNS_READY:String(ready)};
 let contents=fs.readFileSync(file,'utf8');
 for(const[key,value]of Object.entries(values)){const re=new RegExp('^'+key+'=.*$','m');contents=re.test(contents)?contents.replace(re,()=>key+'='+value):contents+'\n'+key+'='+value;}
 fs.writeFileSync(file,contents,{mode:0o600});
 console.log('Email settings saved. Restart Coverstead to apply them. '+(ready?'Queued emails will begin delivery: review your test records first.':'Delivery stays paused.'));
} finally {rl.close();}
