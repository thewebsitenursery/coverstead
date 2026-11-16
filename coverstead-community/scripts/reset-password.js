import '../env.js';
import crypto from 'node:crypto';
import {Writable} from 'node:stream';
import {createInterface} from 'node:readline/promises';
import {query,run,transaction} from '../store.js';
let muted=false;const output=new Writable({write(chunk,_enc,done){if(!muted)process.stdout.write(chunk);done();}});
const rl=createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
try{const email=(await rl.question('Staff account email: ')).trim().toLowerCase();const user=query('SELECT id FROM staff_users WHERE email=?',[email])[0];if(!user)throw Error('Account not found.');process.stdout.write('New password, at least 16 characters (hidden): ');muted=true;const password=await rl.question('');muted=false;process.stdout.write('\n');if(password.length<16||password.length>256)throw Error('Use 16–256 characters.');const salt=crypto.randomBytes(16).toString('hex');const hash=salt+':'+crypto.scryptSync(password,salt,64).toString('hex');transaction(()=>run('UPDATE staff_users SET password_hash=? WHERE id=?',[hash,user.id]));console.log('Password changed. Start Coverstead and sign in.');}finally{rl.close();}
