import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { HttpServer, PaymentGateway } from '../apps/payment-api/src/server.js';

class CaptureResponse extends EventEmitter {
  chunks=[];
  writeHead(status,headers){this.status=status;this.headers=headers;}
  write(chunk){this.chunks.push(String(chunk));}
}

test('SSE checkout listener receives named state changes, and disconnect cleans up',()=>{
  const http=new HttpServer();
  const client=new CaptureResponse();
  http.initSse('session-test',client);
  assert.equal(client.status,200);
  assert.match(client.headers['Content-Type'],/text\/event-stream/);
  http.broadcastSse('session-test','status_change',{status:'VERIFICATION_PENDING',orderId:'test'});
  const output=client.chunks.join('');
  assert.match(output,/event: status_change/);
  assert.match(output,/"status":"VERIFICATION_PENDING"/);
  client.emit('close');
  assert.equal(http.sseClients.has('session-test'),false);
});
test('untrusted WebSocket signal cannot settle a production payment',async()=>{
  const old=process.env.NODE_ENV;
  const gateway=new PaymentGateway({
    db:{queryOne:()=>{throw Error('Untrusted signal reached bank database');}},
    sessionRepo:{findById:()=>{throw Error('Untrusted signal reached payment repository');}}
  });
  try{
    process.env.NODE_ENV='production';
    await gateway.handlePaymentSignal({
      orderId:'forged',utr:'123456789012',amount:100,status:'SUCCESS'
    });
  }finally{
    if(old===undefined)delete process.env.NODE_ENV;
    else process.env.NODE_ENV=old;
  }
});
