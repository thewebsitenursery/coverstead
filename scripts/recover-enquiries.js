// Restore reviewed enquiry files into a NEW private directory. Never load saved
// service credentials, send mail, or overwrite a live inbox.
import fs from 'node:fs';
import path from 'node:path';
const [input,destination,deletions]=process.argv.slice(2);
if(process.argv.length!==5)throw Error('Usage: node scripts/recover-enquiries.js RESTORED_SNAPSHOT NEW_DIRECTORY DELETED_IDS_JSON');
const excluded=JSON.parse(fs.readFileSync(deletions,'utf8'));
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
if(!Array.isArray(excluded)||excluded.some(id=>typeof id!=='string'||!uuid.test(id)))throw Error('Provide the reviewed deletion-reference list, using [] only when none apply.');
if(!fs.lstatSync(input).isDirectory())throw Error('Use a regular restored snapshot directory.');
fs.mkdirSync(destination,{mode:0o700});let restored=0,omitted=0;
for(const name of fs.readdirSync(input)){
 const id=name.replace(/\.json$/,'');if(!name.endsWith('.json')||!uuid.test(id))continue;
 const file=path.join(input,name);if(!fs.lstatSync(file).isFile())throw Error('Recovery refuses non-regular records.');
 const record=JSON.parse(fs.readFileSync(file,'utf8')),created=Date.parse(record.created);
 if(record.id!==id||!Number.isFinite(created))throw Error('Invalid enquiry recovery record.');
 if(created<Date.now()-90*86400e3||excluded.includes(id)){omitted++;continue;}
 record.notification={...record.notification,attempts:20,recoveredAt:new Date().toISOString(),lastError:'Recovered enquiry: automatic alerts suppressed. Review in the private inbox.'};
 fs.writeFileSync(path.join(destination,name),JSON.stringify(record)+'\n',{mode:0o600,flag:'wx'});restored++;
}
console.log(JSON.stringify({restored,omitted,notifications:'suppressed',next:'Review corrections and operator access before switching to this inbox.'}));
