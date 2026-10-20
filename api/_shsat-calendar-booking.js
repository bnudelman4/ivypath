'use strict';
const crypto=require('node:crypto');
const Q=require('../shsat-quiz-logic');
const Slots=require('../booking-slots');
const R=require('./_shsat-request');
const TRUST=require('./_booking-trust');
const {eventInstant}=require('./_shsat-relay');
const RECEIVER='https://app.ivypathacademy.com/api/bookings/site';
function digest(value){return crypto.createHash('sha256').update(value).digest('hex');}
function nativeIdentity(body){
 const quiz={version:1,quiz_id:body.quiz.quiz_id.toLowerCase(),role:'parent',grade:Number(body.quiz.grade),targets:Q.CODES.targets.filter(t=>body.quiz.targets.includes(t)),prep:body.quiz.prep,practice_test:body.quiz.practice_test,worry:body.quiz.worry};
 const exact={name:body.name,email:body.email,phone:body.phone,date:body.date,time:body.time,ref:body.ref,quiz};
 return {eventId:digest('ivypath/shsat/calendar/v1\0'+quiz.quiz_id),fingerprint:digest(JSON.stringify(exact))};
}
function createCalendarQuestionnaireBooking({env=process.env,calendarFactory=()=>require('./_calendar').calendarClient(),book=(req,res)=>require('./_book-consultation-handler')(req,res),fetchImpl=fetch}={}) {
 async function lookup(calendar,id){
  try{return (await calendar.events.get({calendarId:'primary',eventId:id},{timeout:1800,retry:false})).data;}
  catch(e){if(e?.code===404||e?.response?.status===404)return null;throw new Error('calendar_read_unavailable');}
 }
 function matches(event,body,identity){
  const props=event?.extendedProperties?.private;
  if(!event||event.id!==identity.eventId||event.status==='cancelled'||event.visibility!=='private'||props?.source!=='shsat_quiz'||props.quiz_id!==body.quiz.quiz_id||props.shsat_request!==identity.fingerprint||!Q.BANDS.includes(props.quiz_band))return false;
  const {buildQuizBooking}=require('./_book-consultation-handler');
  const summary=buildQuizBooking(Q,{...body.quiz,band:props.quiz_band});
  const expected='Free 15-minute consultation with IvyPath Academy.\n\nStudent/Parent: '+body.name+'\nEmail: '+body.email+'\nPhone: '+body.phone+'\n\n'+summary.quizBlock;
  const [y,m,d]=body.date.split('-').map(Number),match=/^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(body.time);
  const start=Slots.etToMs(y,m,d,(Number(match[1])%12)+(match[3]==='PM'?12:0),Number(match[2]));
  return event.summary==='IvyPath Academy - Free Consultation'+(body.ref?' [ref: '+body.ref+']':'') && event.description===expected && event.attendees?.length===1 && Q.normalizeEmail(event.attendees[0].email)===body.email && eventInstant(event.start)===start && eventInstant(event.end)===start+15*60000;
 }
 async function relayRecovered(body,event){
  // Same existing post-booking receiver/secret/scope and attribution contract.
  // Its existing external-event unique key handles retries. No outbox/job/new
  // permission is introduced; delivery remains best-effort as on the live site.
  if(!env.SITE_BOOKING_RELAY_SECRET)return;
  const attribution=body.attribution||{},payload={source:'site',type:'consultation',name:body.name,email:body.email,phone:body.phone,start:new Date(eventInstant(event.start)).toISOString(),end:new Date(eventInstant(event.end)).toISOString(),google_event_id:event.id,meet_link:event.hangoutLink||null,event_link:event.htmlLink||null,ref:body.ref||null};
  for(const k of ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','wbraid','gbraid','fbclid'])payload[k]=attribution[k]||null;
  payload.page=attribution.page||attribution.landing||null;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),1800);
  try{await fetchImpl(RECEIVER,{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.SITE_BOOKING_RELAY_SECRET},body:JSON.stringify(payload)});}catch(_){/* Existing receiver can be retried on exact Calendar replay. */}finally{clearTimeout(timer);}
 }
 async function recovered(res,event,body,identity){
  if(!matches(event,body,identity))return res.status(409).json({error:'booking_conflict'});
  await relayRecovered(body,event);
  const [y,m,d]=body.date.split('-').map(Number);
  const date=new Date(Date.UTC(y,m-1,d)).toLocaleDateString('en-US',{timeZone:'UTC',weekday:'long',month:'long',day:'numeric',year:'numeric'});
  return res.status(200).json({ok:true,calendar:true,success:true,date,time:body.time,email:body.email,meetLink:event.hangoutLink||'',eventLink:event.htmlLink||''});
 }
 return async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
  if(env.VERCEL_ENV==='preview')return res.status(503).json({error:'booking_unavailable'});
  if(!R.originAllowed(R.header(req,'origin'),{VERCEL_ENV:'production'}))return res.status(403).json({error:'origin_not_allowed'});
  try{
   const raw=await R.readBody(req);if(raw===R.TOO_LARGE)return res.status(413).json({error:'request_too_large'});
   const q=raw?.quiz;
   if(!q||q.version!==1||!Q.isUuid(q.quiz_id)||q.role!=='parent'||Q.firstMissing(q)!==null||!Q.consultationFit(q).eligible)return res.status(400).json({error:'completed_eligible_questionnaire_required'});
   if(raw.type||raw.exam==='sat')return res.status(400).json({error:'invalid_booking'});
   const name=typeof raw.name==='string'?Q.sanitizeName(raw.name):'',email=typeof raw.email==='string'?Q.normalizeEmail(raw.email):'',phone=Q.normalizeUsMobile(raw.phone);
   if(name.length<2||!Q.isValidEmail(email)||!phone)return res.status(400).json({error:'invalid_contact'});
   if(typeof raw.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(raw.date)||typeof raw.time!=='string'||! /^(?:[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/.test(raw.time))return res.status(400).json({error:'invalid_slot'});
   const [y,m,d]=raw.date.split('-').map(Number),date=new Date(Date.UTC(y,m-1,d));
   if(date.getUTCFullYear()!==y||date.getUTCMonth()+1!==m||date.getUTCDate()!==d)return res.status(400).json({error:'invalid_slot'});
   const attribution=Q.sanitizeAttribution(raw.attribution);
   // Preserve the existing marketing-only braid IDs and landing path as well
   // as the quiz's attribution keys. They never enter Calendar descriptions.
   for(const key of ['wbraid','gbraid']){
    const value=raw.attribution?.[key];if(typeof value==='string'&&/^[a-z0-9._~-]{1,200}$/i.test(value))attribution[key]=value;
   }
   const landing=raw.attribution?.landing;
   if(typeof landing==='string'&&/^\/[a-z0-9._/~-]{0,150}$/i.test(landing.split(/[?#]/)[0]))attribution.landing=landing.split(/[?#]/)[0];
   for(const key of Object.keys(attribution))attribution[key]=attribution[key].slice(0,200);
   const body={name,email,phone,date:raw.date,time:raw.time,ref:typeof raw.ref==='string'&&/^[a-z0-9._-]{0,64}$/i.test(raw.ref)?raw.ref:'',booking_flow:'shsat_quiz',quiz:{version:1,quiz_id:q.quiz_id.toLowerCase(),role:'parent',grade:Number(q.grade),targets:Q.CODES.targets.filter(t=>q.targets.includes(t)),prep:q.prep,practice_test:q.practice_test,worry:q.worry,band:Q.bandFor(q,Q.todayNY())},attribution};
   const identity=nativeIdentity(body),calendar=calendarFactory();
   // Provider-native ID, not an in-process lock or cross-parent slot lock.
   // Replay checks require the exact private Calendar evidence, never a client
   // completion flag, digest, response or claimed provider outcome.
   const prior=await lookup(calendar,identity.eventId);
   if(prior)return recovered(res,prior,body,identity);
   if(!Slots.openSlots(y,m,d,{durationMinutes:15,busy:[]}).includes(body.time))return res.status(400).json({error:'invalid_slot'});
   let attempted=false;
   /** @type {{status:number,body:any}|undefined} */
   let result;
   body[TRUST]={eventId:identity.eventId,calendar,legacySideEffects:true,beforeInsert:async event=>{
    if(event.id!==identity.eventId||event.visibility!=='private')throw new Error('private_calendar_evidence_required');
    event.extendedProperties.private.shsat_request=identity.fingerprint;attempted=true;
   }};
   const proxy={statusCode:200,setHeader:(...args)=>res.setHeader(...args),status(n){this.statusCode=n;return this;},json(value){result={status:this.statusCode,body:value};return this;},end(){return this;}};
   try{await book({...req,body},proxy);}catch(_){/* Reconcile only the bound event below. */}
   if(result?.status===200&&result.body?.calendar===true)return res.status(200).json(result.body);
   if(!attempted)return res.status(result?.status||503).json(result?.body||{error:'booking_unavailable'});
   // A lost acknowledgement/duplicate-ID conflict gets one read-only check.
   // Never issue a second insert inside this request or accept supplied evidence.
   const actual=await lookup(calendar,identity.eventId);
   if(actual)return recovered(res,actual,body,identity);
   return res.status(503).json({error:'booking_reconciliation_required'});
  }catch(_){return res.status(503).json({error:'booking_unavailable'});}
 };
}
module.exports={createCalendarQuestionnaireBooking,nativeIdentity};
