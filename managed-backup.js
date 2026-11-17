import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {query,save} from './store.js';

// Called within the worker event loop: database/config/assets cannot mutate
// while this synchronous snapshot is copied. Enquiries are deliberately excluded.
export function snapshotManaged(env=process.env) {
  if(!env.BACKUP_DIR||!env.DB_PATH||!env.ENV_FILE)throw Error('Managed snapshot paths must be configured.');
  if(query('PRAGMA integrity_check')[0].integrity_check!=='ok')throw Error('Database integrity failed.');
  save();
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const destination=path.join(path.resolve(env.BACKUP_DIR),stamp);
  fs.mkdirSync(destination,{recursive:true,mode:0o700});
  for(const [source,name] of [[env.DB_PATH,'coverstead.sqlite'],[env.ENV_FILE,'config.env']]){
    fs.copyFileSync(source,path.join(destination,name));fs.chmodSync(path.join(destination,name),0o600);
  }
  if(env.ASSET_PATH&&fs.existsSync(env.ASSET_PATH))fs.cpSync(env.ASSET_PATH,path.join(destination,'assets'),{recursive:true,filter:source=>{if(fs.lstatSync(source).isSymbolicLink())throw Error('Backup refuses asset symlinks.');return true;}});
  const digest=crypto.createHash('sha256').update(fs.readFileSync(path.join(destination,'coverstead.sqlite'))).digest('hex');
  fs.writeFileSync(path.join(destination,'snapshot.json'),JSON.stringify({version:1,created:new Date().toISOString(),databaseSha256:digest,source:process.cwd()})+'\n',{mode:0o600});
  // Prune only complete snapshots created by this helper, after a new one exists.
  for(const entry of fs.readdirSync(path.resolve(env.BACKUP_DIR),{withFileTypes:true})){
    if(!entry.isDirectory()||!/^\d{4}-\d{2}-\d{2}T/.test(entry.name))continue;
    const folder=path.join(path.resolve(env.BACKUP_DIR),entry.name);
    try{const manifest=JSON.parse(fs.readFileSync(path.join(folder,'snapshot.json'),'utf8'));
      if(manifest.version===1&&Date.parse(manifest.created)<Date.now()-48*3600e3)fs.rmSync(folder,{recursive:true});
    }catch{ /* An unrecognised or incomplete folder needs operator inspection. */ }
  }
  return {created:Date.now(),directory:destination};
}
