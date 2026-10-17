'use strict';
const Q=require('../shsat-quiz-logic');
const Slots=require('../booking-slots');
const RECEIVER='https://app.ivypathacademy.com/api/bookings/site';
const KEYS=['source','type','name','email','phone','start','end','google_event_id','meet_link'];
function eventInstant(t) {
  if(!t || typeof t.dateTime!=='string')return NaN;
  if(/(?:Z|[+-]\d{2}:\d{2})$/.test(t.dateTime))return Date.parse(t.dateTime);
  const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00$/.exec(t.dateTime);
  return m && t.timeZone==='America/New_York'?Slots.etToMs(+m[1],+m[2],+m[3],+m[4],+m[5]):NaN;
}
function meetLink(raw) {
  try {const u=new URL(raw);return u.protocol==='https:' && u.hostname==='meet.google.com' && !u.username && !u.password && !u.search && !u.hash?u.href:null;}catch(_){return null;}
}
function buildRelayPayload(value,event,eventId,response) {
  const start=eventInstant(event.start),end=eventInstant(event.end);
  if(event.visibility!=='private' || event.id!==eventId || !Number.isFinite(start) || !Number.isFinite(end) || end-start!==15*60000 || event.attendees?.length!==1 || event.attendees[0].email!==value.parent_email)throw new Error('private_calendar_evidence_required');
  // Required contact/event fields only. Never copy description, answers,
  // quiz IDs, attribution, click identifiers or arbitrary request fields.
  return {source:'site',type:'consultation',name:value.parent_name,email:value.parent_email,phone:value.phone,
    start:new Date(start).toISOString(),end:new Date(end).toISOString(),google_event_id:eventId,meet_link:meetLink(response?.body?.meetLink)};
}
function createSiteBookingSender({secret,fetchImpl=fetch}) {
  if(typeof secret!=='string' || !secret.trim() || /[\r\n]/.test(secret))throw new Error('existing_relay_secret_required');
  return async payload=>{
    if(!payload || !/^[a-f0-9]{64}$/.test(payload.google_event_id))throw new Error('bound_event_required');
    const body=Object.fromEntries(KEYS.map(k=>[k,payload[k]]));
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),2000);
    try {
      const response=await fetchImpl(RECEIVER,{method:'POST',redirect:'error',signal:controller.signal,
        headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret,'Idempotency-Key':body.google_event_id},body:JSON.stringify(body)});
      if(!response.ok)return false;
      const ack=await response.json();return ack?.ok===true && Q.isUuid(ack.id);
    } finally {clearTimeout(timer);}
  };
}
function createRelayDelivery({store,send}) {
  if(typeof send!=='function')throw new Error('relay_sender_required');
  async function byQuizId(quizId) {
    const claim=await store.claimRelay(quizId);
    if(!claim)return false;
    let accepted=false;
    try {accepted=await send(claim.payload)===true;}catch(_){/* Outcome may be unknown; same durable payload/key on retry. */}
    return store.finishRelay(claim,accepted);
  }
  async function retryPending(limit=10) {
    const ids=await store.dueRelays(limit);let delivered=0;
    for(const id of ids){
      try{if(await byQuizId(id))delivered++;}
      catch(_){/* Keep durable evidence/lease; one failed job must not starve others. */}
    }
    return {checked:ids.length,delivered};
  }
  return {byQuizId,retryPending};
}
function createBookingRecovery({store,delivery,lookup}) {
  if(typeof delivery?.byQuizId!=='function' || typeof lookup!=='function')throw new Error('recovery_binding_required');
  return async quizId=>{
    const reconciled=await store.reconcileByQuizId(quizId,lookup);
    // Also retries a due relay for an already accepted Calendar event. This
    // never inserts Calendar events or trusts browser reconciliation evidence.
    const delivered=await delivery.byQuizId(quizId);
    return {reconciled,delivered};
  };
}
module.exports={eventInstant,buildRelayPayload,createSiteBookingSender,createRelayDelivery,createBookingRecovery};
