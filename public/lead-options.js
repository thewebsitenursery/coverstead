export const leadOptions={
 venue_type:{pub:'Pub serving food',restaurant:'Restaurant or bistro',cafe:'Café',other:'Other hospitality venue'},
 booking_method:{paper:'Paper diary',spreadsheet:'Spreadsheet',software:'Another booking system',starting:'Starting from scratch'},
 timing:{soon:'Within a month',quarter:'Within three months',exploring:'Just exploring'},
 locations:{one:'One venue',several:'Several venues with a shared dashboard'},
 need:{bookings:'Bookings, table rules and a staff diary',cards:'Online guest card payments or guarantees',sms:'SMS reminders',pos:'A connection to our till or POS'},
 source:{demo:'Customer/staff demo',fit:'Venue-fit check',homepage:'Coverstead website',github:'GitHub',developer:'My developer',recommendation:'A recommendation',search:'Search engine',other:'Somewhere else'}
};
export function venueFit({locations,need,hosting}){
 if(!['one','several'].includes(locations)||!['bookings','cards','sms','pos'].includes(need)||!['managed','community','unsure'].includes(hosting))throw Error('Choose an answer to each question.');
 const gaps=[];
 if(locations==='several')gaps.push('Each venue needs a separate installation. A shared multi-site dashboard is not available.');
 const missing={cards:'Online guest card payments and card guarantees are not available.',sms:'SMS confirmations and reminders are not available.',pos:'A connection to your till or POS is not available.'};
 if(missing[need])gaps.push(missing[need]);
 return {title:gaps.length?'Check these gaps before switching.':'The core workflow is worth trying.',gaps,
  next:hosting==='community'?'Community is available to self-host. Arrange a separate installation, email and backups, then rehearse a service before using guest data.':'Get started with hosted Enterprise. We help prepare your venue; your first month begins when it is ready and you complete checkout.',
  kind:hosting==='community'?'community':'managed'};
}
