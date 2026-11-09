import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {Database,runMigrations} from '@youpi/db';
import {createPaymentApp} from '../apps/payment-api/src/index.js';
import {provisionPlatformOwner,verifyPlatformPassword} from '../apps/payment-api/src/platform/identity.js';

function scryptPassword(password){
  const salt=crypto.randomBytes(16).toString('hex');
  return 'scrypt:'+salt+':'+crypto.scryptSync(password,salt,64).toString('hex');
}
test('private owner configuration creates a real SUPER_ADMIN and never re-applies same version',async()=>{
  const db=new Database({inMemory:true});runMigrations(db);
  const app=createPaymentApp(db);
  const old={email:process.env.ADMIN_LOGIN_EMAIL,hash:process.env.ADMIN_LOGIN_PASSWORD_HASH,version:process.env.ADMIN_OWNER_BOOTSTRAP_VERSION};
  const account='owner-integration@example.test',password='temporary-ci-owner-password-2026';
  const hash=scryptPassword(password);
  await new Promise(resolve=>app.rawServer.listen(0,'127.0.0.1',resolve));
  try{
    const first=provisionPlatformOwner(db,{ownerEmail:account,ownerHash:hash,version:'ci-one-time-v1'});
    assert.equal(first.status,'created');
    const row=db.queryOne('SELECT * FROM pp_users WHERE email=?',[account]);
    assert.equal(row.role,'SUPER_ADMIN');
    assert.equal(row.merchant_id,null);
    assert.equal(row.email_verified,0,'Provisioning cannot claim an external email is verified');
    assert.equal(verifyPlatformPassword(password,row.password_hash),true);
    const base='http://127.0.0.1:'+app.rawServer.address().port;
    const response=await fetch(base+'/api/platform/v1/login',{
      method:'POST',credentials:'omit',
      headers:{'content-type':'application/json','x-247-auth-mode':'bearer'},
      body:JSON.stringify({email:account,password})
    });
    assert.equal(response.status,200,await response.clone().text());
    assert.equal(response.headers.get('set-cookie'),null);
    const body=await response.json();
    assert.equal(body.user.role,'SUPER_ADMIN');
    assert.equal(body.user.platform,true);
    assert.equal(body.user.permissions.includes('*'),true);
    const me=await fetch(base+'/api/platform/v1/me',{headers:{Authorization:'Bearer '+body.sessionToken}});
    assert.equal(me.status,200);
    const firstHash=row.password_hash;
    const second=provisionPlatformOwner(db,{ownerEmail:account,ownerHash:scryptPassword('other-new-password-2026'),version:'ci-one-time-v1'});
    assert.equal(second.status,'already-applied');
    assert.equal(db.queryOne('SELECT password_hash FROM pp_users WHERE email=?',[account]).password_hash,firstHash);
    const rotated=provisionPlatformOwner(db,{ownerEmail:account,ownerHash:scryptPassword('other-new-password-2026'),version:'ci-two-time-v2'});
    assert.equal(rotated.status,'updated');
    assert.equal(db.queryOne('SELECT id FROM pp_sessions WHERE user_id=?',[row.id]),undefined);
    assert.equal(verifyPlatformPassword(password,db.queryOne('SELECT password_hash FROM pp_users WHERE email=?',[account]).password_hash),false);
    assert.throws(()=>provisionPlatformOwner(db,{ownerEmail:'owner-invalid@example.test',ownerHash:'plaintext',version:'bad'}),/scrypt/);
  }finally{
    for(const [k,v] of Object.entries({ADMIN_LOGIN_EMAIL:old.email,ADMIN_LOGIN_PASSWORD_HASH:old.hash,ADMIN_OWNER_BOOTSTRAP_VERSION:old.version})){if(v===undefined)delete process.env[k];else process.env[k]=v;}
    app.destroy();app.rawServer.closeAllConnections();await new Promise(resolve=>app.rawServer.close(resolve));db.close();
  }
});
