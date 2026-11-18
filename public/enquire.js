import {leadOptions} from './lead-options.js';
const form=document.querySelector('#enquiry-form'),availability=document.querySelector('#enquiry-availability'),error=document.querySelector('#enquiry-error'),button=document.querySelector('#enquiry-submit');
let submission=crypto.randomUUID();
const parameters=new URLSearchParams(location.search);
for(const [key,options] of Object.entries(leadOptions)){
 const select=form.elements[key];for(const [value,label] of Object.entries(options))select.add(new Option(label,value));
 if(Object.hasOwn(options,parameters.get(key)))select.value=parameters.get(key);
}
if(['managed','community','privacy'].includes(parameters.get('kind')))form.elements.kind.value=parameters.get('kind');
if(parameters.get('demo')==='completed')form.elements.demo_completed.checked=true;
if(parameters.has('source')){document.querySelector('#enquiry-context-note').textContent='We have filled in the answers carried from the previous page. Review or change them before sending; no demo booking details are included.';form.querySelector('details').open=true;}

async function setup(){try{const response=await fetch('/api/enquiries/config');if(!response.ok)throw Error();const config=await response.json();if(!config.enabled){availability.textContent='Private enquiries are not open yet. You can still explore the demo and installation guide.';return;}const contact=document.querySelector('#enquiry-contact');contact.textContent=config.contact;contact.href='mailto:'+config.contact;availability.textContent='Your details go to a private enquiry inbox. We’ll agree your venue setup before any subscription begins.';form.hidden=false;}catch{availability.textContent='The enquiry service could not be checked. Please try again later.';}}
form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';button.disabled=true;const data=new FormData(form);try{const payload={id:submission,email:String(data.get('email')),venue:String(data.get('venue')),kind:String(data.get('kind')),message:String(data.get('message')),website:String(data.get('website')),contact_permission:data.has('contact_permission'),context:{...Object.fromEntries(Object.keys(leadOptions).map(key=>[key,String(data.get(key)||'')])),demo_completed:data.has('demo_completed')}};const response=await fetch('/api/enquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw Error(result.error||'Your enquiry could not be saved.');form.hidden=true;document.querySelector('#enquiry-reference').textContent=submission;const success=document.querySelector('#enquiry-success');success.hidden=false;success.focus();form.reset();}catch(problem){error.textContent=problem.message;}finally{button.disabled=false;}});
setup();
