import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

// Explicit source allowlist: runtime data and local configuration never enter a release.
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const files=['package.json','package-lock.json','LICENSE','CHANGELOG.md','README.md','CONTRIBUTING.md','SECURITY.md','coverstead-preview.jpg','.env.example','.gitignore','.dockerignore','Dockerfile','compose.yaml','compose.public.yaml','Caddyfile.example','server.js','marketing.js','website-metrics.js','enquiries.js','enquiry-mail.js','mail-delivery.js','env.js','platform.js','billing.js','billing-identity.js','billing-mode.js','managed.js','managed-gateway.js','managed-backup.js','store.js','venue.js','rules.js','dates.js','closures.js','walkins.js','crm.js','email.js','payments.js','service-sheet.js','staff-help.html'];
files.push('Dockerfile.managed','compose.managed.yaml','Caddyfile.managed.example');
const extensions={public:new Set(['.html','.css','.js','.svg','.woff','.woff2','.jpg']),scripts:new Set(['.js','.sh']),docs:new Set(['.md']),test:new Set(['.js'])};
function collect(directory,allowed){
  for(const entry of fs.readdirSync(path.join(root,directory),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    if(entry.name.startsWith('.')||entry.name==='downloads')continue;
    const relative=path.join(directory,entry.name);
    if(entry.isSymbolicLink())throw Error('Refusing to package a symlink: '+relative);
    if(entry.isDirectory())collect(relative,allowed);
    else if(entry.isFile()&&allowed.has(path.extname(entry.name)))files.push(relative);
  }
}
for(const [directory,allowed]of Object.entries(extensions))collect(directory,allowed);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'coverstead-release-'));
const folder=path.join(temporary,'coverstead-community');
const output=path.join(root,'public/downloads/coverstead-community.zip');
try{
  for(const relative of files){
    const source=path.join(root,relative);
    if(!fs.lstatSync(source).isFile())throw Error('Expected a regular source file: '+relative);
    const target=path.join(folder,relative);
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(source,target);
  }
  const archive=path.join(temporary,'coverstead-community.zip');
  execFileSync('zip',['-X','-q',archive,'-@'],{cwd:temporary,input:files.map(f=>'coverstead-community/'+f).join('\n')+'\n',stdio:['pipe','pipe','inherit']});
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.copyFileSync(archive,output+'.tmp');fs.renameSync(output+'.tmp',output);
  console.log(`Community release: ${files.length} source files, ${fs.statSync(output).size} bytes.\n${output}`);
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
