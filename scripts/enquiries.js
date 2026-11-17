import '../env.js';
import {createEnquiryInbox,enquirySettings} from '../enquiries.js';
const {directory}=enquirySettings();
const inbox=createEnquiryInbox(directory),[command='summary',id,value]=process.argv.slice(2);
let result;
if(command==='summary')result=inbox.summary();
else if(command==='list'||command==='due'){inbox.prune();result=inbox.list().filter(r=>command!=='due'||(r.status!=='closed'&&r.follow_up&&r.follow_up<=new Date().toISOString().slice(0,10))).map(({id,created,kind,status,follow_up})=>({id,created,kind,status,follow_up}));}
else if(command==='show'){inbox.prune();result=inbox.read(id);}
else if(command==='status'){inbox.setStatus(id,value);result={id,status:value};}
else if(command==='delete'){inbox.remove(id);result={id,deleted:true};}
else if(command==='retry-email'){inbox.setNotification(id,{attempts:0});result={id,retryQueued:true};}
else if(command==='follow-up'){inbox.setFollowUp(id,value);result={id,followUp:value};}
else throw Error('Usage: node scripts/enquiries.js summary | list | due | show ID | status ID new/contacted/qualified/rehearsal/waiting/closed | follow-up ID YYYY-MM-DD/clear | delete ID | retry-email ID');
console.log(JSON.stringify(result,null,2));
