// Opens a disposable copy through the actual app. Never reads saved credentials,
// never listens on a network port and never enables email or payment transports.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import initSqlJs from 'sql.js';

const backup = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.statSync(backup).isDirectory()) throw Error('Usage: node scripts/rehearse-backup.js /path/to/backup-folder');
const source = path.join(backup, 'coverstead.sqlite');
if (!fs.lstatSync(source).isFile() || fs.existsSync(source + '.lock')) throw Error('Use a stopped, consistent backup, not a live database.');
const original = fs.readFileSync(source), digest = data => crypto.createHash('sha256').update(data).digest('hex');
const SQL = await initSqlJs(), db = new SQL.Database(original);
if (db.exec('PRAGMA integrity_check')[0]?.values[0]?.[0] !== 'ok') throw Error('Backup database integrity check failed.');
// Save exact rows in memory for comparisons; never print any guest/account data.
const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]?.values.flat() || [];
const before = Object.fromEntries(tables.map(name => [name, db.exec('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid')]));
db.close();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'coverstead-recovery-'));
fs.chmodSync(temporary, 0o700);
function copyAssets(from, to) {
  fs.mkdirSync(to, {recursive: true, mode: 0o700});
  for (const item of fs.readdirSync(from, {withFileTypes: true})) {
    const input = path.join(from, item.name), output = path.join(to, item.name);
    if (item.isSymbolicLink()) throw Error('Rehearsal refuses asset symlinks.');
    if (item.isDirectory()) copyAssets(input, output);
    else if (item.isFile()) { fs.copyFileSync(input, output); fs.chmodSync(output, 0o600); if (digest(fs.readFileSync(input)) !== digest(fs.readFileSync(output))) throw Error('Asset copy verification failed.'); }
  }
}
try {
  const restored = path.join(temporary, 'coverstead.sqlite');
  fs.writeFileSync(restored, original, {mode: 0o600});
  if (fs.existsSync(path.join(backup, 'assets'))) copyAssets(path.join(backup, 'assets'), path.join(temporary, 'assets'));
  const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  const code = `
    import {app} from './server.js';
    import {request} from './test/request.js';
    const health=await request(app,'/api/platform');
    if(health.status!==200)throw Error('Restored application health failed');
    if((await request(app,'/api/admin/settings')).status!==401)throw Error('Restored authentication protection failed');
    if((await request(app,'/manual')).status!==200)throw Error('Restored manual failed');
    process.exit(0);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd: root, timeout: 30000, encoding: 'utf8',
    env: {PATH: process.env.PATH || '', ENV_FILE: path.join(temporary, 'no-credentials.env'), NO_LISTEN: 'true', PUBLIC_URL: 'http://localhost:3100', HOST: '127.0.0.1', DB_PATH: restored, ASSET_PATH: path.join(temporary, 'assets'), COOKIE_SECURE: 'false', EDITION: 'enterprise', DEMO_MODE: 'false', SMTP_HOST: '', EMAIL_DNS_READY: 'false', STRIPE_BILLING_ENABLED: 'false', ONLINE_DEPOSITS_ENABLED: 'false', WEBSITE_METRICS_ENABLED: 'false'}
  });
  if (result.status !== 0 || result.error) throw Error('Restored application rehearsal failed. Inspect the backup and compatible release privately.');
  const after = new SQL.Database(fs.readFileSync(restored));
  for (const name of tables) {
    const rows = after.exec('SELECT * FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid');
    if (JSON.stringify(rows) !== JSON.stringify(before[name])) throw Error('Restored data differs after application startup.');
  }
  if (after.exec('PRAGMA integrity_check')[0]?.values[0]?.[0] !== 'ok') throw Error('Restored database integrity failed.');
  after.close();
  if (digest(fs.readFileSync(source)) !== digest(original)) throw Error('Original backup changed during rehearsal.');
  console.log(JSON.stringify({result: 'passed', tablesVerified: tables.length, checks: ['backup integrity', 'isolated application startup', 'health response', 'authentication protection', 'manual response', 'all original table rows unchanged', 'asset copy hashes', 'original backup unchanged'], limits: 'No owner login, outgoing email, live payment, DNS, off-server disaster recovery or real-service booking was exercised. Saved credentials were not loaded.'}, null, 2));
} finally { fs.rmSync(temporary, {recursive: true, force: true}); }
