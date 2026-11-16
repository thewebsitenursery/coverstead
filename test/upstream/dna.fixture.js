// Test-only preload: requests never reach DNA Payments.
import fs from 'node:fs';
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(String(url)==='https://test-oauth.dnapayments.com/oauth2/token')return new Response(JSON.stringify({access_token:'fake-token'}));
 if(String(url)==='https://test-api.dnapayments.com/v1/payment-links'){
  const body=JSON.parse(options.body);fs.writeFileSync(process.env.TEST_DNA_REQUEST_FILE,options.body);
  return new Response(JSON.stringify({id:'mock-'+body.invoiceId,url:'https://test-pay.dnapayments.com/checkout/?r=mock',expirationDate:new Date(Date.now()+3600000).toISOString()}));
 }
 return originalFetch(url,options);
};
