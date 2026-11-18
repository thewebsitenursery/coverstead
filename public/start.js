import {setupRequest} from './setup-request.js';
const form=document.querySelector('#signup-form'),availability=document.querySelector('#signup-availability'),error=document.querySelector('#signup-error'),button=document.querySelector('#signup-submit'),fallback=document.querySelector('#signup-fallback');
const submission=crypto.randomUUID();
async function setup(){
 try{
  const response=await fetch('/api/enquiries/config');if(!response.ok)throw Error();
  const config=await response.json();if(!config.enabled)throw Error();
  availability.hidden=true;form.hidden=false;
 }catch{availability.textContent='The signup form is temporarily unavailable.';fallback.hidden=false;}
}
form.addEventListener('submit',async event=>{
 event.preventDefault();if(button.disabled)return;error.textContent='';button.disabled=true;button.textContent='Saving your request…';
 const payload=setupRequest(new FormData(form),submission);
 try{
  const response=await fetch('/api/enquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await response.json().catch(()=>({}));if(!response.ok||result.ok!==true)throw Error(result.error||'Your request could not be saved. Please try again.');
  document.querySelector('#signup-email').textContent=payload.email.trim();document.querySelector('#signup-reference').textContent=submission;
  form.hidden=true;document.querySelector('#signup-heading').hidden=true;document.querySelector('#signup-intro').hidden=true;fallback.hidden=true;
  const success=document.querySelector('#signup-success');success.hidden=false;success.focus();
 }catch(problem){error.textContent=problem.message==='Failed to fetch'?'We could not confirm that your request was saved. Please retry; the same reference prevents duplicates.':problem.message;fallback.hidden=false;}
 finally{button.disabled=false;button.textContent='Get my venue set up →';}
});
setup();
