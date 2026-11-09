import test from 'node:test';
import assert from 'node:assert/strict';
import { Database, runMigrations } from '@youpi/db';
import { createPaymentApp } from '../apps/payment-api/src/index.js';

test('new platform workspace uses bearer sessions without legacy cookies', async()=>{
  const db=new Database({inMemory:true});
  runMigrations(db);
  const app=createPaymentApp(db);
  const http=app.rawServer;
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  const url='http://127.0.0.1:'+http.address().port+'/api/platform/v1';
  async function call(path,body,headers={}){
    const response=await fetch(url+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers}, ...(body?{body:JSON.stringify(body)}:{}),credentials:'omit'});
    let data={};try{data=await response.json();}catch{}
    return{status:response.status,headers:response.headers,data};
  }
  try{
    const registered=await call('/register',{email:'new-portal-merchant@example.test',password:'new-portal-safe-password',businessName:'Example merchant',contactName:'Test Person',mobile:'9000000000'});
    assert.equal(registered.status,201,JSON.stringify(registered.data));
    const signedIn=await call('/login',{email:'new-portal-merchant@example.test',password:'new-portal-safe-password'},{'x-247-auth-mode':'bearer'});
    assert.equal(signedIn.status,200,JSON.stringify(signedIn.data));
    assert.equal(signedIn.headers.get('set-cookie'),null,'new portal must not set a session cookie');
    const token=signedIn.data.sessionToken;
    assert.match(token,/^[A-Za-z0-9_-]{32,256}$/);
    assert.equal((await call('/me')).status,401,'no ambient cookie grants access');
    assert.equal((await call('/me',null,{authorization:'Bearer invalid-token-should-not-work'})).status,401);
    const authenticated=await call('/me',null,{authorization:'Bearer '+token});
    assert.equal(authenticated.status,200,JSON.stringify(authenticated.data));
    assert.equal(authenticated.data.user.email,'new-portal-merchant@example.test');
    const loggedOut=await call('/logout',{}, {authorization:'Bearer '+token});
    assert.equal(loggedOut.status,200,JSON.stringify(loggedOut.data));
    assert.equal(loggedOut.headers.get('set-cookie'),null);
    assert.equal((await call('/me',null,{authorization:'Bearer '+token})).status,401);
  }finally{app.destroy();http.closeAllConnections();await new Promise(resolve=>http.close(resolve));db.close();}
});