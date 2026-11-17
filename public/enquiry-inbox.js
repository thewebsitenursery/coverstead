const byId=id=>document.getElementById(id),error=byId('inbox-error');
async function api(url,method='GET',body){const response=await fetch(url,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'Please try again.'),{status:response.status});return result;}
function element(tag,text,className){const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;}
async function refresh(){error.textContent='';try{
 const {records}=await api('/api/admin/enquiries');byId('inbox-login').hidden=true;byId('inbox-content').hidden=false;const list=byId('inbox-records');list.replaceChildren();
 for(const record of records){const card=element('article','','enquiry');card.id=record.id;card.append(element('h2',record.venue||'Venue enquiry'),element('p',new Date(record.created).toLocaleString('en-GB')+' · '+record.kind+' · '+record.id,'metadata'),element('p',record.message,'message'));
  const reply=element('a','Reply to '+record.email);reply.href='mailto:'+encodeURIComponent(record.email);card.append(reply);
  const label=element('label','Status '),select=element('select','');select.setAttribute('aria-label','Status for enquiry '+record.id);for(const status of ['new','contacted','qualified','rehearsal','waiting','closed']){const option=element('option',status);option.value=status;select.append(option);}select.value=record.status;
  select.addEventListener('change',async()=>{select.disabled=true;try{await api('/api/admin/enquiries/'+record.id,'PATCH',{status:select.value});record.status=select.value;}catch(e){error.textContent=e.message;select.value=record.status;}finally{select.disabled=false;}});label.append(select);card.append(label);list.append(card);
 }
 if(!records.length)list.append(element('p','No enquiries to review.'));if(location.hash)document.getElementById(location.hash.slice(1))?.scrollIntoView({block:'start'});
 }catch(e){error.textContent=e.status===401?'':e.message;byId('inbox-login').hidden=![401,403].includes(e.status);byId('inbox-content').hidden=true;}}
byId('inbox-login').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;error.textContent='';try{await api('/api/login','POST',Object.fromEntries(new FormData(form)));form.reset();await refresh();}catch(e){error.textContent=e.message;}finally{button.disabled=false;}});
byId('inbox-refresh').addEventListener('click',refresh);byId('inbox-logout').addEventListener('click',async()=>{try{await api('/api/logout','POST',{});await refresh();}catch(e){error.textContent=e.message;}});refresh();
