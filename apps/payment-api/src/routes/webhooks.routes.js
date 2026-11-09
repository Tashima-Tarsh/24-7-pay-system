/**
 * Merchant webhook connectivity probe.
 *
 * This is NOT a financial event. It never writes a payment, UTR, ledger entry,
 * or normal webhook delivery. It uses the exact production HMAC body/signature
 * contract and the same public-destination HTTP transport as WebhookEngine.
 */
import crypto from 'node:crypto';
import {generateHmac,validateOutboundWebhookUrl,fetchPublic} from '@youpi/common';
import {HttpServer} from '../server.js';

const PREFIX='/api/platform/v1';
const ALIAS='/api/v1/merchant/webhooks/test';
const WINDOW_MS=30_000;
const now=()=>new Date().toISOString();
const fault=(status,code,message)=>Object.assign(new Error(message),{status,code});
const normalizeError=error=>{
  if(error?.name==='TimeoutError'||error?.name==='AbortError'||/timed out|timeout/i.test(error?.message||''))
    return 'WEBHOOK_TIMEOUT';
  return 'WEBHOOK_UNREACHABLE';
};
function diagnosticEvent(merchantId,deliveryId){
  return {
    event:'WEBHOOK_TEST',
    type:'webhook.test',
    test:true,
    merchantId,
    deliveryId,
    createdAt:now(),
    data:{status:'TEST_ONLY',paymentId:null,orderId:null,bankReferenceNumber:null,utr:null}
  };
}
export function registerWebhookTestRoutes(server,ctx,identity){
  const {db,merchantRepo}=ctx;
  const transport=ctx.webhookTestTransport||fetchPublic;
  db.execute('CREATE TABLE IF NOT EXISTS pp_webhook_probe (merchant_id TEXT PRIMARY KEY,last_requested_at TEXT NOT NULL)');
  db.execute('CREATE TABLE IF NOT EXISTS pp_webhook_probe_results (id TEXT PRIMARY KEY,merchant_id TEXT NOT NULL,user_id TEXT NOT NULL,status_code INTEGER,success INTEGER NOT NULL,duration_ms INTEGER NOT NULL,error_code TEXT,created_at TEXT NOT NULL)');
  const safeScope=req=>{
    if(!req.platform?.userId)throw fault(401,'AUTH_REQUIRED','Sign in to the workspace');
    if(!identity.authorize(req,'webhooks.manage'))throw fault(403,'PERMISSION_DENIED','Webhook management permission required');
    const requested=new URL(req.url,'http://localhost').searchParams.get('merchantId');
    if(req.platform.platform){
      if(!identity.authorize(req,'merchants.read')||!requested)throw fault(400,'MERCHANT_REQUIRED','Select a merchant first');
      const row=merchantRepo.findById(requested);
      if(!row)throw fault(404,'MERCHANT_NOT_FOUND','Merchant not found');
      return row;
    }
    if(requested&&requested!==req.platform.merchantId)
      throw fault(403,'MERCHANT_SCOPE_DENIED','You cannot test another merchant webhook');
    const row=merchantRepo.findById(req.platform.merchantId);
    if(!row)throw fault(404,'MERCHANT_NOT_FOUND','Merchant not found');
    return row;
  };
  const run=async(req,res)=>{
    res.setHeader('Cache-Control','no-store');
    try{
      const merchant=safeScope(req);
      const body=await HttpServer.parseBody(req);
      if(body&&typeof body==='object'&&Object.keys(body).length)
        throw fault(400,'INVALID_REQUEST','The tester uses only your saved merchant webhook URL');
      if(!merchant.webhookUrl)throw fault(400,'NO_WEBHOOK_URL','Save a webhook URL under Business settings first');
      const validated=validateOutboundWebhookUrl(merchant.webhookUrl);
      if(!validated.valid||validated.url.protocol!=='https:')
        throw fault(400,'INVALID_WEBHOOK_URL','Webhook testing requires a public HTTPS destination');
      // Prevent accidentally overriding the private-address block in production.
      if(process.env.NODE_ENV==='production'&&process.env.YOUPI_ALLOW_PRIVATE_WEBHOOKS==='true')
        throw fault(503,'UNSAFE_OUTBOUND_CONFIG','Disable private webhook destinations in production');
      const requestedAt=now();
      const allowed=db.transaction(()=>{
        const previous=db.queryOne('SELECT last_requested_at FROM pp_webhook_probe WHERE merchant_id=?',[merchant.id]);
        if(previous&&Date.now()-Date.parse(previous.last_requested_at)<WINDOW_MS)return false;
        db.execute('INSERT INTO pp_webhook_probe(merchant_id,last_requested_at) VALUES(?,?) ON CONFLICT(merchant_id) DO UPDATE SET last_requested_at=excluded.last_requested_at',[merchant.id,requestedAt]);
        return true;
      });
      if(!allowed)throw fault(429,'TEST_RATE_LIMITED','Wait 30 seconds before testing this webhook again');
      const deliveryId=crypto.randomUUID(),payload=JSON.stringify(diagnosticEvent(merchant.id,deliveryId));
      const headers={
        'Content-Type':'application/json',
        'User-Agent':'24-7-Pay-Webhook-Tester/1.0',
        'X-Gateway-Event':'WEBHOOK_TEST',
        'X-Gateway-Signature':'sha256='+generateHmac(payload,merchant.webhookSecret),
        'X-Gateway-Delivery-Id':deliveryId,
        'X-Gateway-Timestamp':String(Date.now())
      };
      const started=Date.now();let result;
      try{
        const response=await transport(validated.url.toString(),{
          method:'POST',headers,body:payload,signal:AbortSignal.timeout(5000),
          timeoutMs:5000,maxResponseBytes:8192,redirect:'manual'
        });
        const responseBody=String(await response.text()).slice(0,500);
        result={success:response.ok,test:true,status_code:response.status,
          response_body:responseBody,duration_ms:Date.now()-started,
          error_code:response.ok?null:'WEBHOOK_HTTP_ERROR',
          delivery_id:deliveryId,signature_header:'X-Gateway-Signature',
          message:response.ok?'Test event acknowledged by merchant endpoint':'Merchant endpoint returned a non-success HTTP response'};
      }catch(error){
        const code=normalizeError(error);
        result={success:false,test:true,status_code:null,response_body:'',
          duration_ms:Date.now()-started,error_code:code,delivery_id:deliveryId,
          message:code==='WEBHOOK_TIMEOUT'?'The merchant endpoint did not respond within five seconds':'The merchant webhook could not be reached'};
      }
      db.execute('INSERT INTO pp_webhook_probe_results(id,merchant_id,user_id,status_code,success,duration_ms,error_code,created_at) VALUES(?,?,?,?,?,?,?,?)',
        [deliveryId,merchant.id,req.platform.userId,result.status_code,result.success?1:0,result.duration_ms,result.error_code,now()]);
      identity.audit?.(req,'WEBHOOK_CONNECTIVITY_TESTED',deliveryId,{merchantId:merchant.id,success:result.success,statusCode:result.status_code,durationMs:result.duration_ms,errorCode:result.error_code});
      HttpServer.json(res,200,result);
    }catch(error){
      HttpServer.json(res,error.status||400,{success:false,test:true,error_code:error.code||'WEBHOOK_TEST_FAILED',message:error.status?error.message:'Unable to test webhook'});
    }
  };
  // The existing platform/merchant session guard covers this route.
  server.post(PREFIX+'/webhooks/test',run);
  // Compatibility alias for merchant integrations. Apply the SAME authenticated
  // platform session guard explicitly, as its normal prefix check does not
  // include /api/v1/merchant routes.
  server.use(async(req,res,pathname)=>{
    if(pathname!==ALIAS)return false;
    return identity.guard(req,res,PREFIX+'/webhooks/test');
  });
  server.post(ALIAS,run);
}
