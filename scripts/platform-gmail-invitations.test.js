import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Database,runMigrations} from '@youpi/db';
import {initializePlatform} from '../apps/payment-api/src/platform/schema.js';
import {createPlatformGmailInvitationService} from '../apps/payment-api/src/platform/gmail-invitations.js';

function setup(){
 const db=new Database({inMemory:true});runMigrations(db);initializePlatform(db);
 const ownerId=crypto.randomUUID();
 db.execute('INSERT INTO pp_users(id,merchant_id,email,password_hash,role,active,created_at) VALUES(?,?,?,?,?,?,?)',
   [ownerId,null,'owner@example.test','test-hash','SUPER_ADMIN',1,new Date().toISOString()]);
 const env={NODE_ENV:'test',DYNAMO_PUBLIC_URL:'https://pay.example.test',GMAIL_SEND_CLIENT_ID:'test-oauth-client-id',
  GMAIL_SEND_CLIENT_SECRET:'test-oauth-client-secret',ENCRYPTION_MASTER_KEY:'a'.repeat(64)};
 const deliveries=[];
 class FakeOAuth {
  constructor(clientId,clientSecret,redirectUri){assert.equal(clientId,env.GMAIL_SEND_CLIENT_ID);assert.equal(redirectUri,'https://pay.example.test/api/platform/v1/gmail/callback');}
  generateAuthUrl(options){const uri=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    uri.searchParams.set('state',options.state);uri.searchParams.set('scope',options.scope.join(' '));return uri.href;}
  async getToken(code){assert.equal(code,'test-auth-code');return {tokens:{
   refresh_token:'refresh-token-must-not-be-plaintext',id_token:'fake-identity-token',
   scope:'openid email https://www.googleapis.com/auth/gmail.send'}};}
  async verifyIdToken({idToken,audience}){assert.equal(idToken,'fake-identity-token');assert.equal(audience,env.GMAIL_SEND_CLIENT_ID);
    return {getPayload:()=>({email:'owner@example.test',email_verified:true})};}
  setCredentials(value){assert.ok(value.refresh_token);this.value=value;}
 }
 const googleProvider={auth:{OAuth2:FakeOAuth},gmail:()=>({users:{messages:{send:async payload=>{
  deliveries.push(payload);return {data:{id:'fake-accepted-for-test-only'}};
 }}}})};
 return {db,ownerId,env,deliveries,googleProvider,service:createPlatformGmailInvitationService(db,{env,googleProvider})};
}
function mockResponse(){
 const headers={};return {headers,statusCode:0,finished:false,setHeader(name,value){headers[name]=value;},end(){this.finished=true;}};
}
test('only send-mail OAuth scope plus OpenID identity is requested, state is one use',async()=>{
 const x=setup();try{
  assert.equal(x.service.status().connected,false);
  assert.equal(x.service.status().oauthReady,true);
  const url=new URL((await x.service.connect(x.ownerId)).authorizationUrl);
  const scopes=url.searchParams.get('scope').split(' ');
  assert.deepEqual(scopes,['openid','email','https://www.googleapis.com/auth/gmail.send']);
  assert.equal(scopes.some(s=>s.includes('gmail.readonly')||s.includes('gmail.modify')),false);
  const state=url.searchParams.get('state');
  assert.ok(state?.length>=32);
  const req={url:'/api/platform/v1/gmail/callback?state='+encodeURIComponent(state)+'&code=test-auth-code'};
  const res=mockResponse();await x.service.callback(req,res);
  assert.equal(res.statusCode,303);assert.equal(res.headers.Location,'/platform#gmail-connected');
  assert.equal(x.service.status().connected,true);assert.equal(x.service.status().email,'owner@example.test');
  const encrypted=x.db.queryOne("SELECT refresh_token_cipher FROM pp_gmail_sender WHERE id='platform'");
  assert.match(encrypted.refresh_token_cipher,/^v1\./);
  assert.ok(!encrypted.refresh_token_cipher.includes('refresh-token'));
  const replay=mockResponse();await x.service.callback(req,replay);
  assert.equal(replay.headers.Location,'/platform#gmail-expired');
  await x.service.send({kind:'merchant_owner_invitation',channel:'email',to:'merchant@example.test',
   token:'secure-mock-activation-token',invitationUrl:'https://pay.example.test/platform#owner-invitation/secure-mock-activation-token'});
  assert.equal(x.deliveries.length,1);
  const mime=Buffer.from(x.deliveries[0].requestBody.raw,'base64url').toString('utf8');
  assert.match(mime,/To: merchant@example.test/);const body=Buffer.from(mime.split('\r\n\r\n')[1],'base64').toString('utf8');
  assert.match(body,/secure-mock-activation-token/);
  assert.doesNotMatch(mime,/refresh-token/);
  assert.rejects(()=>x.service.send({kind:'merchant_owner_invitation',channel:'email',to:'victim@example.test\r\nBcc: attacker@example.test',token:'abc'}));
  x.service.disconnect();assert.equal(x.service.status().connected,false);
  assert.equal(x.db.queryOne("SELECT COUNT(*) AS n FROM pp_gmail_sender").n,0);
 }finally{x.db.close();}
});
test('missing Google OAuth configuration is a safe explicit error',async()=>{
 const x=setup();try{
  const s=createPlatformGmailInvitationService(x.db,{env:{...x.env,GMAIL_SEND_CLIENT_ID:''},googleProvider:x.googleProvider});
  assert.equal(s.status().oauthReady,false);
  await assert.rejects(()=>s.connect(x.ownerId),/Configure GMAIL_SEND_CLIENT_ID/);
 }finally{x.db.close();}
});
