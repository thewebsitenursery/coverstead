import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('restarting legacy contactless reservations preserves bookings without growing customer duplicates',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-crm-restart-'));
 const env={PATH:process.env.PATH,ENV_FILE:'/dev/null',DB_PATH:path.join(directory,'db.sqlite'),ASSET_PATH:path.join(directory,'assets'),PUBLIC_URL:'http://localhost:3100',NO_LISTEN:'true',SMTP_HOST:'',DEMO_MODE:'false',STRIPE_BILLING_ENABLED:'false'};
 const run=code=>{const result=spawnSync(process.execPath,['--input-type=module','-e',code],{env,encoding:'utf8',timeout:15000});assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout.trim());};
 try{
  run(`import './server.js';import {run,transaction} from './store.js';transaction(()=>{run("INSERT INTO bookings(id,name,status,booking_type,tables_json) VALUES('legacy-a','Same name','completed','standard','[]'),('legacy-b','Same name','completed','christmas','[]')");});console.log('{}');process.exit(0);`);
  const inspect=`import './server.js';import {query} from './store.js';console.log(JSON.stringify({bookings:query('SELECT count(*) n FROM bookings')[0].n,customers:query('SELECT count(*) n FROM customers')[0].n}));process.exit(0);`;
  assert.deepEqual(run(inspect),{bookings:2,customers:0});assert.deepEqual(run(inspect),{bookings:2,customers:0});
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
});
