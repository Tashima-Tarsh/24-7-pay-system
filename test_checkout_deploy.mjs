fetch('https://dynamo-pay-d545.onrender.com/checkout/pay_test123', {
  method: 'GET',
  headers: { 'Accept': 'text/html' }
}).then(async r => {
  const body = await r.text();
  console.log('Checkout Status:', r.status);
  console.log('Body length:', body.length);
  console.log('Contains payView hidden:', body.includes('id="payView" hidden'));
  console.log('Contains payView:', body.includes('id="payView"'));
  console.log('Contains 24/7:', body.includes('24/7'));
  console.log('Contains Sanbook:', body.includes('Sanbook'));
  console.log('Contains fade-enter opacity:0:', body.includes('opacity: 0;'));
}).catch(e => console.error('Fetch error:', e.message));
