import test from 'node:test';
import assert from 'node:assert/strict';
import { durableFinancialStorageAvailable, rejectEphemeralFinancialWrite } from '../apps/payment-api/src/financial-storage-guard.js';

test('financial readiness requires PostgreSQL in production', () => {
  assert.equal(durableFinancialStorageAvailable({dialect:'postgres'},'production'),true);
  assert.equal(durableFinancialStorageAvailable({dialect:'sqlite'},'production'),false);
  assert.equal(durableFinancialStorageAvailable({dialect:'sqlite'},'test'),true);
});
test('new payments cannot be created on ephemeral production SQLite', () => {
  const responses=[];
  const makeRes=()=>({
    headersSent:false, writableEnded:false,
    writeHead(status,headers){this.status=status;this.headers=headers;},
    end(data){responses.push({status:this.status,data:JSON.parse(data)})}
  });
  const res=makeRes();
  assert.equal(rejectEphemeralFinancialWrite({method:'POST'},res,'/api/v1/payments',{dialect:'sqlite'},'production'),true);
  assert.equal(responses[0].status,503);
  assert.equal(responses[0].data.code,'DURABLE_STORAGE_REQUIRED');
  assert.equal(rejectEphemeralFinancialWrite({method:'POST'},makeRes(),'/v1/payments',{dialect:'sqlite'},'production'),true);
  assert.equal(rejectEphemeralFinancialWrite({method:'POST'},makeRes(),'/api/v1/payments',{dialect:'postgres'},'production'),false);
  assert.equal(rejectEphemeralFinancialWrite({method:'GET'},makeRes(),'/api/v1/payments',{dialect:'sqlite'},'production'),false);
});
