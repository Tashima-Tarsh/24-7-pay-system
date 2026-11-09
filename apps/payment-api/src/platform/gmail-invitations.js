/**
 * 24/7 Pay: opt-in Gmail sending for platform-owner invitations.
 *
 * Uses a Google OAuth consent flow with the *gmail.send* scope only. No inbox
 * access or payment-email observation. Refresh tokens are AES-GCM encrypted
 * using a deployment-owned secret. No OAuth secret ever enters the browser.
 */
import crypto from 'node:crypto';
const now=()=>new Date().toISOString();
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
const validAddress=value=>typeof value==='string'&&/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value)&&value.length<=254;
const serverError=(status,message)=>Object.assign(new Error(message),{statusCode:status});
const getOrigin=(env)=>{
  const raw=env.DYNAMO_PUBLIC_URL||env.RENDER_EXTERNAL_URL;
  if(!raw)return null;
  try{
    const url=new URL(raw);
    if(url.username||url.password||url.search||url.hash)return null;
    if(url.protocol!=='https:'&&!(env.NODE_ENV==='test'&&url.protocol==='http:'))return null;
    return url.origin;
  }catch{return null;}
};
const keyFromEnv=env=>{
  const key=env.ENCRYPTION_MASTER_KEY;
  if(typeof key!=='string'||key.length<32)throw serverError(503,'Encryption master key is not configured');
  return crypto.createHash('sha256').update(key).digest();
};
const encrypt=(value,env)=>{
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',keyFromEnv(env),iv);
  const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]),tag=cipher.getAuthTag();
  return 'v1.'+Buffer.concat([iv,tag,ciphertext]).toString('base64url');
};
const decrypt=(stored,env)=>{
  if(!stored?.startsWith('v1.'))throw serverError(503,'Stored Gmail credentials are unreadable');
  const blob=Buffer.from(stored.slice(3),'base64url');
  if(blob.length<29)throw serverError(503,'Stored Gmail credentials are incomplete');
  const decipher=crypto.createDecipheriv('aes-256-gcm',keyFromEnv(env),blob.subarray(0,12));
  decipher.setAuthTag(blob.subarray(12,28));
  return Buffer.concat([decipher.update(blob.subarray(28)),decipher.final()]).toString('utf8');
};
const encodeHeader=x=>'=?UTF-8?B?'+Buffer.from(String(x),'utf8').toString('base64')+'?=';
function messageText(message,origin) {
  if(message.kind!=='merchant_owner_invitation')throw serverError(400,'Gmail sender supports merchant-owner invitations only');
  const url=message.invitationUrl||origin+'/platform#owner-invitation/'+encodeURIComponent(message.token||'');
  if(!url.startsWith(origin+'/platform#owner-invitation/')||!message.token)throw serverError(400,'Invalid invitation URL');
  return {
    subject:'Your 24/7 Pay merchant invitation',
    body:'You have been invited to manage your business on 24/7 Pay.\n\nOpen your private activation link:\n'+url+
      '\n\nChoose your own password to activate the merchant workspace. This invitation expires in 24 hours.'+
      '\nIf you were not expecting this invitation, ignore this email. Do not forward this link.'
  };
}
export function createPlatformGmailInvitationService(db,{env=process.env,googleProvider}={}) {
  db.execute('CREATE TABLE IF NOT EXISTS pp_gmail_sender (id TEXT PRIMARY KEY,email TEXT NOT NULL,refresh_token_cipher TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)');
  db.execute('CREATE TABLE IF NOT EXISTS pp_gmail_oauth_states (state_hash TEXT PRIMARY KEY,owner_user_id TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL)');
  const config=()=>({
    origin:getOrigin(env),
    clientId:env.GMAIL_SEND_CLIENT_ID||'',
    clientSecret:env.GMAIL_SEND_CLIENT_SECRET||'',
    keyReady:typeof env.ENCRYPTION_MASTER_KEY==='string'&&env.ENCRYPTION_MASTER_KEY.length>=32
  });
  const ready=()=>{const c=config();return !!(c.origin&&c.clientId&&c.clientSecret&&c.keyReady);};
  const redirectUri=()=>config().origin?config().origin+'/api/platform/v1/gmail/callback':null;
  const library=async()=>googleProvider||((await import('googleapis')).google);
  const oauth=async()=>{
    const c=config();
    if(!ready())throw serverError(503,'Configure GMAIL_SEND_CLIENT_ID, GMAIL_SEND_CLIENT_SECRET, ENCRYPTION_MASTER_KEY and the public HTTPS origin in Render.');
    const google=await library();
    return new google.auth.OAuth2(c.clientId,c.clientSecret,redirectUri());
  };
  const getRecord=()=>db.queryOne("SELECT * FROM pp_gmail_sender WHERE id='platform'");
  const status=()=>({connected:Boolean(getRecord()),email:getRecord()?.email||null,oauthReady:ready(),redirectUri:redirectUri(),scope:'https://www.googleapis.com/auth/gmail.send'});
  async function connect(userId) {
    const auth=await oauth();
    const state=crypto.randomBytes(32).toString('base64url');
    db.execute('DELETE FROM pp_gmail_oauth_states WHERE expires_at<?',[now()]);
    db.execute('INSERT INTO pp_gmail_oauth_states(state_hash,owner_user_id,expires_at,created_at) VALUES(?,?,?,?)',
      [digest(state),userId,new Date(Date.now()+10*60*1000).toISOString(),now()]);
    return {authorizationUrl:auth.generateAuthUrl({
      access_type:'offline',prompt:'consent',scope:['openid','email','https://www.googleapis.com/auth/gmail.send'],state,
      include_granted_scopes:false
    })};
  }
  async function callback(req,res) {
    const returnTo=(state)=>{res.statusCode=303;res.setHeader('Cache-Control','no-store');res.setHeader('Location','/platform#gmail-'+state);res.end();};
    let url;try{url=new URL(req.url,'http://localhost');}catch{return returnTo('error');}
    const state=url.searchParams.get('state')||'',code=url.searchParams.get('code')||'';
    if(!/^[A-Za-z0-9_-]{32,100}$/.test(state)||!code||code.length>4096)return returnTo('error');
    const old=db.queryOne('SELECT * FROM pp_gmail_oauth_states WHERE state_hash=? AND expires_at>?',[digest(state),now()]);
    if(!old)return returnTo('expired');
    db.execute('DELETE FROM pp_gmail_oauth_states WHERE state_hash=?',[digest(state)]);
    const owner=db.queryOne("SELECT id FROM pp_users WHERE id=? AND role='SUPER_ADMIN' AND active=1",[old.owner_user_id]);
    if(!owner)return returnTo('error');
    try{
      const auth=await oauth();
      const response=await auth.getToken(code);
      const refreshToken=response.tokens?.refresh_token;
      if(!refreshToken)throw Error('Google did not return an offline refresh token');
      const scopes=String(response.tokens?.scope||'');
      if(scopes&&!scopes.split(' ').includes('https://www.googleapis.com/auth/gmail.send'))throw Error('Required Gmail send scope not granted');
      const credentials=response.tokens?.id_token;
      if(!credentials)throw Error('Google identity token is missing');
      const verified=await auth.verifyIdToken({idToken:credentials,audience:config().clientId});
      const claims=verified.getPayload();
      const address=String(claims?.email||'').trim().toLowerCase();
      if(!claims?.email_verified||!validAddress(address))throw Error('Google account email not verified');
      db.execute('INSERT INTO pp_gmail_sender(id,email,refresh_token_cipher,created_at,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,refresh_token_cipher=excluded.refresh_token_cipher,updated_at=excluded.updated_at',
        ['platform',address,encrypt(refreshToken,env),now(),now()]);
      return returnTo('connected');
    }catch{return returnTo('error');}
  }
  async function send(message) {
    const row=getRecord();
    if(!row||!ready())throw serverError(503,'Connect the platform Gmail sender before sending invitations');
    if(!validAddress(message.to))throw serverError(400,'Invalid invitation recipient');
    const c=config(),google=await library(),auth=await oauth();
    auth.setCredentials({refresh_token:decrypt(row.refresh_token_cipher,env)});
    const {subject,body}=messageText(message,c.origin);
    const mime='From: '+row.email+'\r\nTo: '+String(message.to).trim().toLowerCase()+
      '\r\nSubject: '+encodeHeader(subject)+'\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'+
      Buffer.from(body,'utf8').toString('base64');
    await google.gmail({version:'v1',auth}).users.messages.send({
      userId:'me',requestBody:{raw:Buffer.from(mime).toString('base64url')}
    },{timeout:15000,retry:false});
    return {sent:true};
  }
  function disconnect(){
    db.execute("DELETE FROM pp_gmail_sender WHERE id='platform'");
    return {connected:false,revocationNote:'Local authorization removed. Revoke access from Google Account security settings if required.'};
  }
  return {status,connect,callback,send,disconnect};
}
