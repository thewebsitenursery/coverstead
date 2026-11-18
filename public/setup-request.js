// Assisted signup uses the existing private inbox; billing begins after setup.
export function setupRequest(data, id) {
  const note=String(data.get('message')||'').trim();
  return {id,kind:'managed',venue:String(data.get('venue')||''),email:String(data.get('email')||''),
    message:'Please help me set up hosted Coverstead for my venue.'+(note?'\n\n'+note:''),
    website:String(data.get('website')||''),contact_permission:data.has('contact_permission')};
}
