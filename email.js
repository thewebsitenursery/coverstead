import {formatDate} from './dates.js';
import {depositDue,needsPreorder} from './rules.js';
import {venue} from './venue.js';
export function bookingMessage(b,kind,base,phone=venue.phone) {
  const seasonal=b.booking_type==='christmas',amount=depositDue(b)/100,label=seasonal?venue.seasonal.label:'Table booking';
  const menus=venue.menus.filter(m=>m.type===(seasonal?'christmas':'standard'));
  const state=kind.replaceAll('_',' ');
  const subject=`${venue.name} ${label} ${state} — ${b.reference}`;
  let body=`${venue.name}\n\n${label} ${state}: ${b.reference}\nName: ${b.name}\nDate: ${formatDate(b.date)}\nTime: ${b.time} (${b.service})\nGuests: ${b.size}\nTable duration: ${b.duration||venue.duration} minutes\nTelephone: ${b.phone}\nEmail: ${b.email}\n`;
  if(b.seating_mode==='rearranged')body+='Seating: tables rearranged by our team for your party.\n';
  if(kind==='cancelled')body+='\nThis booking has been cancelled. If you paid a deposit, please contact the venue to discuss it.\n';
  else {
    if(amount>0)body+=`\nDeposit: £${amount.toFixed(2)}. ${b.deposit_paid?'Received.':`Please call ${phone} to pay over the phone. ${seasonal?'Your booking is not yet confirmed. Tables are held pending payment.':''}`}\n`;
    if(needsPreorder(b))body+=`\nA meal pre-order is required at least ${venue.preorderHours} hours before your visit. Send it to ${venue.email}.\n`;
    if(menus.length)body+='\nMenus and forms:\n'+menus.map(m=>`${m.label}: ${new URL(m.url,base).href}`).join('\n')+'\n';
  }
  body+=`\nTo change or cancel, contact ${venue.email} or ${phone}.\n${venue.cancellationPolicy}\nPlease discuss allergies with our team before ordering.\n`;
  // Only locally uploaded, allowlisted files may become SMTP attachments.
  const attachments=kind==='cancelled'?[]:menus.filter(m=>/^\/assets\/[a-f0-9-]+\.(pdf|png|jpg|webp)$/.test(m.url)).map(m=>m.url.split('/').at(-1));
  return {subject,body,attachments,staffNote:`\nAssigned tables: ${b.tables.join(', ')}\nRead any guest requirements and staff notes in the private diary.\n${seasonal?venue.seasonal.staffReminder:''}\n`};
}
