import {venueFit} from './lead-options.js';
const form=document.querySelector('#fit-form'),result=document.querySelector('#fit-result');
form.addEventListener('submit',event=>{
 event.preventDefault();const data=Object.fromEntries(new FormData(form));const answer=venueFit(data);
 document.querySelector('#fit-title').textContent=answer.title;
 const gaps=document.querySelector('#fit-gaps');gaps.replaceChildren(...answer.gaps.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 document.querySelector('#fit-next').textContent=answer.next;
 const params=new URLSearchParams({source:'fit',kind:answer.kind});
 for(const key of ['venue_type','booking_method','timing','locations','need'])if(data[key])params.set(key,data[key]);
 const action=document.querySelector('#fit-enquire');
 action.href=answer.kind==='managed'&&!answer.gaps.length?'/get-started':'/enquire?'+params;
 action.textContent=answer.kind==='managed'&&!answer.gaps.length?'Get started here →':'Discuss these needs →';
 result.hidden=false;result.focus();
});
