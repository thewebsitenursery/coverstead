import '../env.js';
import fs from 'node:fs';
import path from 'node:path';
const database=path.resolve(process.env.DB_PATH||'data/coverstead.sqlite');
if(!fs.existsSync(database))throw Error('There is no database to back up yet.');
// Requires a stopped application so configuration, uploads and database agree.
const lock=database+'.lock';
if(fs.existsSync(lock)){const pid=Number(fs.readFileSync(lock,'utf8'));let alive=true;try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}if(alive)throw Error('Stop Coverstead before running this backup.');}
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const destination=path.resolve(process.env.BACKUP_DIR||'data/backups',stamp);
fs.mkdirSync(destination,{recursive:true,mode:0o700});
fs.copyFileSync(database,path.join(destination,'coverstead.sqlite'));fs.chmodSync(path.join(destination,'coverstead.sqlite'),0o600);
const assets=path.resolve(process.env.ASSET_PATH||'data/assets');if(fs.existsSync(assets))fs.cpSync(assets,path.join(destination,'assets'),{recursive:true});
const config=process.env.ENV_FILE||(fs.existsSync('data/config.env')?'data/config.env':'.env');if(fs.existsSync(config)){fs.copyFileSync(config,path.join(destination,'config.env'));fs.chmodSync(path.join(destination,'config.env'),0o600);}
console.log('Backup saved to '+destination+'\nCopy this folder to a separate, protected device or backup service. It contains private data and credentials.');
