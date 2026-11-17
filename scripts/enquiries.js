import '../env.js';
import {createEnquiryInbox,enquirySettings} from '../enquiries.js';
const {directory}=enquirySettings();
const inbox=createEnquiryInbox(directory),[command='summary',id,value]=process.argv.slice(2);
let result;
if(command==='summary')result=inbox.summary();
else if(command==='list'){inbox.prune();result=inbox.list().map(({id,created,kind,status})=>({id,created,kind,status}));}
else if(command==='show'){inbox.prune();result=inbox.read(id);}
else if(command==='status'){inbox.setStatus(id,value);result={id,status:value};}
else if(command==='delete'){inbox.remove(id);result={id,deleted:true};}
else throw Error('Usage: node scripts/enquiries.js summary | list | show ID | status ID new/contacted/closed | delete ID');
console.log(JSON.stringify(result,null,2));
