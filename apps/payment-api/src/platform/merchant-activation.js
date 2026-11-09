/**
 * Reconciles legacy, non-disciplinary onboarding states after a merchant OWNER
 * has actually completed email verification. This never overrides deliberate
 * holds, fraud reviews, suspensions, rejections, or an absent merchant.
 *
 * Used by login, owner invitation acceptance and authorized payment creation.
 */
export function activateEligibleMerchant(db,merchantId,{audit}={}){
 if(!merchantId)return {active:false,reason:'NO_MERCHANT'};
 const merchant=db.queryOne('SELECT merchant_id,status,profile FROM pp_merchants WHERE merchant_id=?',[merchantId]);
 if(!merchant)return {active:false,reason:'MERCHANT_NOT_FOUND'};
 if(merchant.status==='ACTIVE')return {active:true,changed:false,status:'ACTIVE'};
 const eligible=new Set(['PROFILE_INCOMPLETE','EMAIL_PENDING','APPROVED']);
 if(!eligible.has(merchant.status))return {active:false,changed:false,status:merchant.status,reason:'REQUIRES_ADMIN_REVIEW'};
 const owner=db.queryOne("SELECT id,active,email_verified FROM pp_users WHERE merchant_id=? AND role='OWNER' ORDER BY created_at LIMIT 1",[merchantId]);
 if(!owner||!owner.active||!owner.email_verified)return {active:false,changed:false,status:merchant.status,reason:'OWNER_EMAIL_UNVERIFIED'};
 let profile;
 try{profile=JSON.parse(merchant.profile||'{}');}catch{return {active:false,changed:false,status:merchant.status,reason:'INVALID_PROFILE'};}
 if(!profile||typeof profile!=='object'||!String(profile.businessName||'').trim()||!String(profile.contactName||'').trim()||!/^\+?[0-9]{10,15}$/.test(String(profile.mobile||''))){
  return {active:false,changed:false,status:merchant.status,reason:'PROFILE_INCOMPLETE'};
 }
 const updated=db.execute("UPDATE pp_merchants SET status='ACTIVE',updated_at=? WHERE merchant_id=? AND status=?",[new Date().toISOString(),merchantId,merchant.status]);
 if(updated?.changes===1){
  audit?.({previousStatus:merchant.status,reason:'verified_owner_completed_onboarding'});
  return {active:true,changed:true,status:'ACTIVE'};
 }
 const current=db.queryOne('SELECT status FROM pp_merchants WHERE merchant_id=?',[merchantId]);
 return {active:current?.status==='ACTIVE',changed:false,status:current?.status||'UNKNOWN'};
}
