import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

test('recovery rehearsal preserves saved rows and assets without loading backed-up credentials', () => {
  const backup = fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-recovery-test-'));
  try {
    const env = {PATH:process.env.PATH,ENV_FILE:'/dev/null',DB_PATH:path.join(backup,'coverstead.sqlite'),ASSET_PATH:path.join(backup,'assets'),NO_LISTEN:'true',PUBLIC_URL:'http://localhost:3100',STRIPE_BILLING_ENABLED:'false',DEMO_MODE:'false',SMTP_HOST:''};
    const seed = spawnSync(process.execPath,['--input-type=module','-e',`import './server.js';import {transaction,run} from './store.js';import {upsertCustomer} from './crm.js';transaction(()=>{run("INSERT INTO bookings(id,reference,name,email,status) VALUES('recovery-test','TEST-RECOVERY','Synthetic guest','recovery@example.invalid','confirmed')");upsertCustomer({name:'Synthetic guest',email:'recovery@example.invalid'},'Synthetic test',false,true);});process.exit(0);`],{env,encoding:'utf8',timeout:15000});
    assert.equal(seed.status,0,seed.stderr);
    fs.writeFileSync(path.join(backup,'assets','sample.txt'),'synthetic asset');
    fs.writeFileSync(path.join(backup,'config.env'),'STRIPE_BILLING_ENABLED=true\nSTRIPE_SECRET_KEY=sk_live_do_not_load\nDB_PATH=/must-not-touch.sqlite\nSMTP_HOST=must-not-contact.invalid\n');
    const before=fs.readFileSync(path.join(backup,'coverstead.sqlite'));
    const result=spawnSync(process.execPath,['scripts/rehearse-backup.js',backup],{env:{...process.env,STRIPE_BILLING_ENABLED:'true',SMTP_HOST:'must-not-contact.invalid'},encoding:'utf8',timeout:30000});
    assert.equal(result.status,0,result.stderr);
    assert.equal(JSON.parse(result.stdout).result,'passed');
    assert.doesNotMatch(result.stdout,/Synthetic guest|sk_live|must-not-touch/);
    assert.deepEqual(fs.readFileSync(path.join(backup,'coverstead.sqlite')),before);
    assert.equal(fs.readFileSync(path.join(backup,'assets','sample.txt'),'utf8'),'synthetic asset');
  } finally { fs.rmSync(backup,{recursive:true,force:true}); }
});
