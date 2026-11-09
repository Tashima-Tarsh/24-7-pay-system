import WebSocket from 'ws';

const WS_URL = process.env.WS_URL || 'ws://localhost:6101';
const ORDER_ID = process.argv[2] || 'TEST_ORDER_123';
const UTR = process.argv[3] || '123456789012';
const AMOUNT = Number(process.argv[4] || 10000); // ₹100.00 in paise
const PAYER_VPA = process.argv[5] || 'customer@gpay';

console.log(`Sending test payment signal for order: ${ORDER_ID}`);
console.log(`WebSocket URL: ${WS_URL}`);

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  const signal = {
    orderId: ORDER_ID,
    utr: UTR,
    amount: AMOUNT,
    payerVpa: PAYER_VPA,
    status: 'SUCCESS',
    timestamp: new Date().toISOString()
  };

  ws.send(JSON.stringify(signal));
  console.log('✅ Signal sent:', JSON.stringify(signal));

  setTimeout(() => {
    console.log('Closing WebSocket connection...');
    ws.close();
    process.exit(0);
  }, 1000);
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  console.error('\nMake sure the payment API is running with the WebSocket listener on port 6101.');
  console.error('Start it with: node server.mjs');
  process.exit(1);
});

ws.on('close', () => {
  console.log('WebSocket connection closed.');
});

// Timeout safety net
setTimeout(() => {
  console.error('Timeout waiting for WebSocket connection.');
  if (ws.readyState === WebSocket.CONNECTING) {
    ws.terminate();
  }
  process.exit(1);
}, 5000);
