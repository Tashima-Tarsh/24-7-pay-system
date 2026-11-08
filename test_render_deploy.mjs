const res = await fetch('https://dynamo-pay-d545.onrender.com/api/v1/payments/intents', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-merchant-id': '00000000-0000-0000-000000000001',
    'x-merchant-key': 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'
  },
  body: JSON.stringify({amount: 100, currency: 'INR', orderId: 'TEST_VERIFY_DEPLOY', merchantVpa: 'test@upi'})
});
console.log('Status:', res.status);
const body = await res.json();
console.log('Body:', JSON.stringify(body));
if (body.paymentId) {
  const res2 = await fetch('https://dynamo-pay-d545.onrender.com/api/v1/payments/' + body.paymentId + '/manual-verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-merchant-id': '00000000-0000-0000-000000000001',
      'x-merchant-key': 'whsec_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6'
    },
    body: JSON.stringify({utr: '888888888888', merchantId: '00000000-00000000000000000001'})
  });
  console.log('Verify Status:', res2.status);
  console.log('Verify Body:', await res2.text());
}
