import fs from 'fs';
const html = fs.readFileSync('D:\\24-7-pay-system\\apps\\checkout-portal\\src\\views\\checkout-premium.html', 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (scriptMatch) {
  // Replace {{INITIAL_STATE_JSON}} with valid JSON to simulate server rendering
  const scriptWithData = scriptMatch[1].replace(
    /\{\{INITIAL_STATE_JSON\}\}/g,
    JSON.stringify({ status: 'INITIATED', amount: '100.00', orderId: 'test', upiUri: 'upi://pay?pa=test@upi&pn=Test&am=1.00', customerName: 'Test Customer', branding: {}, returnUrl: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
  );
  try {
    new Function(scriptWithData);
    console.log('JavaScript syntax: VALID (after template replacement)');
  } catch(e) {
    console.log('JavaScript SYNTAX ERROR:', e.message);
    const lines = scriptWithData.split('\n');
    // Find lines with syntax errors
    for (let i = 0; i < lines.length; i++) {
      try {
        new Function(lines[i]);
      } catch(e) {
        if (e.message.includes('Unexpected') || e.message.includes('Missing') || e.message.includes('token')) {
          console.log('Line ' + (i+1) + ': ' + lines[i].trim());
          console.log('  Error: ' + e.message);
        }
      }
    }
  }
}