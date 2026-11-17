import {venueFit} from './lead-options.js';
const form=document.querySelector('#fit-form'),result=document.querySelector('#fit-result');
form.addEventListener('submit',event=>{
 event.preventDefault();const data=Object.fromEntries(new FormData(form));const answer=venueFit(data);
 document.querySelector('#fit-title').textContent=answer.title;
 const gaps=document.querySelector('#fit-gaps');gaps.replaceChildren(...answer.gaps.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));
 document.querySelector('#fit-next').textContent=answer.next;
 const params=new URLSearchParams({source:'fit',kind:answer.kind});
 for(const key of ['venue_type','booking_method','timing','locations','need'])if(data[key])params.set(key,data[key]);
 document.querySelector('#fit-enquire').href='/enquire?'+params;
 result.hidden=false;result.focus();
});
