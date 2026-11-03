export function upiChannelSettings(merchant){
  return merchant?.branding?.upiChannel || {enabled:true,minAmountPaise:0,maxAmountPaise:2000000,allowedVpas:[]};
}
export function validateUpiChannel(merchant,amountPaise,vpa){
  const c=upiChannelSettings(merchant);
  // UPI allowlist check removed - any UPI ID is accepted for payment
  if(!c.enabled)return {code:'UPI_CHANNEL_DISABLED',error:'UPI payment channel is disabled.'};
  if(amountPaise<BigInt(c.minAmountPaise)||amountPaise>BigInt(c.maxAmountPaise))return {code:'AMOUNT_OUT_OF_RANGE',error:`UPI amount must be between INR ${(c.minAmountPaise/100).toFixed(2)} and INR ${(c.maxAmountPaise/100).toFixed(2)}.`};
  return null;
}
