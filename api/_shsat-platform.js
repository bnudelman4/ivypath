'use strict';
const crypto=require('node:crypto');
const R=require('./_shsat-request');
const ENDPOINT='https://app.ivypathacademy.com/api/bookings/shsat';
function bridgeSignature(secret,timestamp,raw){return crypto.createHmac('sha256',secret).update('shsat-booking-bridge/v1\n'+timestamp+'\n'+raw).digest('hex');}
function createPlatformBooking({env=process.env,fetchImpl=fetch,now=Date.now}={}){
 return async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  if(!R.originAllowed(R.header(req,'origin'),{VERCEL_ENV:'production'}))return res.status(403).json({error:'origin_not_allowed'});
  // Existing shared-secret authorization is broadened only after specific
  // owner approval and reviews, by enabling BOTH server deployment gates.
  if(env.SHSAT_PLATFORM_BOOKING_ENABLED!=='1' || env.VERCEL!=='1' || env.VERCEL_ENV!=='production')return res.status(503).json({error:'booking_unavailable'});
  const secret=env.SITE_BOOKING_RELAY_SECRET;
  if(typeof secret!=='string'||!secret.trim()||/[\r\n]/.test(secret))return res.status(503).json({error:'booking_unavailable'});
  const ip=R.clientIp(req,env);if(!ip)return res.status(503).json({error:'trusted_ip_required'});
  try {
   const payload=await R.readBody(req);
   if(payload===R.TOO_LARGE)return res.status(413).json({error:'request_too_large'});
   if(!payload || payload===R.INVALID || payload.booking_flow!=='shsat_quiz')return res.status(400).json({error:'invalid_booking'});
   const raw=JSON.stringify({version:1,ip,payload}),timestamp=String(Math.floor(now()/1000));
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
   let response;
   try{response=await fetchImpl(ENDPOINT,{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json','X-Shsat-Timestamp':timestamp,'X-Shsat-Signature':bridgeSignature(secret,timestamp,raw)},body:raw});}
   finally{clearTimeout(timer);}
   if(![200,400,409,413,429,503].includes(response.status))throw new Error();
   const text=await response.text();if(Buffer.byteLength(text)>4096)throw new Error();
   const body=JSON.parse(text);
   if(response.status===200){
    if(body?.ok!==true||body.calendar!==true||body.success!==true)throw new Error();
    // Same private JSON response as the existing booking route; no query URL,
    // answer echo, diagnostic entitlement, or ad event is introduced.
    const result=Object.fromEntries(['ok','calendar','success','date','time','email','meetLink','eventLink'].map(k=>[k,body[k]]));
    return res.status(200).json(result);
   }
   const errors=new Set(['completed_eligible_questionnaire_required','invalid_contact','invalid_slot','intake_conflict','booking_conflict','slot_taken','rate_limited','intake_expired','booking_reconciliation_required','verified_intake_required','ineligible_intake','intake_contact_mismatch','request_too_large','booking_unavailable','trusted_ip_required']);
   return res.status(response.status).json({error:errors.has(body?.error)?body.error:'booking_unavailable'});
  }catch(_){return res.status(503).json({error:'booking_unavailable'});}
 };
}
module.exports={createPlatformBooking,bridgeSignature};
