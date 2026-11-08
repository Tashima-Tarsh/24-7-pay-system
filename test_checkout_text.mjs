(async () => {
  const res = await fetch('https://dynamo-pay-d545.onrender.com/checkout/pay_d4f6dd78-5028-4644-8874-f8bf104a6a4c');
  const body = await res.text();
  
  // Check for various text patterns
  const checks = [
    'Amount to Pay', 'amount to pay', 'AMOUNT TO PAY',
    'Pay ₹', 'Pay $', 'Pay ', '₹', 'Total', 'total',
    'UPI', 'upi', 'QR', 'qr', 'Checkout', 'checkout',
    'Sanbook', '24/7', 'Payment', 'payment'
  ];
  
  for (const check of checks) {
    if (body.includes(check)) {
      console.log('FOUND:', JSON.stringify(check));
    }
  }
  
  console.log('\nBody length:', body.length);
  
  // Find any text content
  const textMatches = body.match(/<[^>]*>([^<]+)<\/[^>]*>/g);
  if (textMatches) {
    const texts = textMatches
      .map(m => m.replace(/<[^>]*>/g, '').trim())
      .filter(t => t.length > 0);
    console.log('\nVisible text elements:', texts.length);
    texts.slice(0, 30).forEach((t, i) => console.log(`  ${i}: "${t}"`));
  }
})();
