fetch('https://dynamo-pay-d545.onrender.com/checkout/pay_d4f6dd78-5028-4644-8874-f8bf104a6a4c', {
  method: 'GET',
  headers: { 'Accept': 'text/html' }
}).then(async r => {
  const body = await r.text();
  console.log('Status:', r.status);
  console.log('Body length:', body.length);
  console.log('Contains Amount to Pay:', body.includes('Amount to Pay'));
  console.log('Contains Pay ₹:', body.includes('Pay ₹'));
  console.log('Contains UPI QR:', body.includes('UPI QR'));
  console.log('Contains Sanbook:', body.includes('Sanbook'));
  console.log('Contains 24/7:', body.includes('24/7'));
  console.log('Script tags:', (body.match(/<script/g) || []).length);
  console.log('Has root div:', body.includes('root'));
}).catch(e => console.error('Fetch error:', e.message));
