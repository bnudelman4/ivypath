'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const Slots=require('../booking-slots');
const {createCalendarQuestionnaireBooking,nativeIdentity}=require('../api/_shsat-calendar-booking');
const originalFetch=global.fetch,keys=['RESEND_API_KEY','SITE_BOOKING_RELAY_SECRET'],saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
let relayCalls=[];
const stubFetch=async(url,init)=>{assert.equal(url,'https://app.ivypathacademy.com/api/bookings/site');relayCalls.push(JSON.parse(init.body));return new Response('{"ok":true}',{status:200});};
test.beforeEach(()=>{delete process.env.RESEND_API_KEY;process.env.SITE_BOOKING_RELAY_SECRET='synthetic-existing-relay';relayCalls=[];global.fetch=stubFetch;});
test.after(()=>{global.fetch=originalFetch;for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}});
function res(){return{statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;},end(){return this;}};}
function body(over={}){
 const today=Slots.etToday();let date,time;
 for(let n=1;n<15;n++){const d=new Date(Date.UTC(today.y,today.m-1,today.d+n)),slots=Slots.openSlots(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate(),{busy:[]});if(slots.length){date=d.toISOString().slice(0,10);time=slots[0];break;}}
 return {name:'Synthetic Parent',email:'synthetic@example.com',phone:'+12025550142',date,time,booking_flow:'shsat_quiz',quiz:{version:1,quiz_id:crypto.randomUUID(),role:'parent',grade:8,targets:['stuyvesant'],prep:'self',practice_test:'no',worry:'timing'},attribution:{utm_source:'google',utm_campaign:'shsat',gclid:'synthetic-click',wbraid:'synthetic-wbraid',gbraid:'synthetic-gbraid',landing:'/shsat'},...over};
}
function provider(){
 const events=new Map();let inserts=0,reads=0,busyReads=0;
 const state={events,unknown:false,readFailure:false,insertFailure:false,busyFailure:false,busy:[],barrier:null};
 state.calendar={events:{get:async({eventId})=>{reads++;if(state.readFailure)throw{code:503};if(!events.has(eventId))throw{code:404};return{data:events.get(eventId)};},insert:async(args)=>{
  inserts++;const event=args.resource;if(events.has(event.id))throw{code:409};if(state.insertFailure)throw{code:503};
  events.set(event.id,{...structuredClone(event),status:'confirmed',hangoutLink:'https://meet.google.com/aaa-bbbb-ccc',htmlLink:'https://calendar.google.com/calendar/event?eid=synthetic'});
  if(state.unknown)throw{code:503};return{data:events.get(event.id)};
 }},freebusy:{query:async()=>{busyReads++;if(state.barrier)await state.barrier();if(state.busyFailure)throw new Error('synthetic freebusy failure');return{data:{calendars:{primary:{busy:state.busy}}}};}}};
 state.counts=()=>({inserts,reads,busyReads});return state;
}
function handler(p,options={}){return createCalendarQuestionnaireBooking({env:{VERCEL:'1',VERCEL_ENV:'production',SITE_BOOKING_RELAY_SECRET:'synthetic-existing-relay'},calendarFactory:()=>p.calendar,fetchImpl:stubFetch,...options});}
async function call(h,b,extra={}){const r=res();await h({method:'POST',headers:{origin:'https://www.ivypathacademy.com'},body:b,...extra},r);return r;}
test('native Calendar path validates six answers and creates one private meeting with existing attribution and relay',async()=>{
 const p=provider(),b=body(),r=await call(handler(p),b);
 assert.equal(r.statusCode,200);assert.equal(r.body.calendar,true);assert.equal(p.counts().inserts,1);assert.equal(relayCalls.length,1);
 const e=[...p.events.values()][0];assert.equal(e.visibility,'private');assert.match(e.id,/^[a-f0-9]{64}$/);assert.equal(e.conferenceData.createRequest.requestId,e.id);
 assert.ok(e.description.includes('SHSAT PLAN'));assert.ok(e.description.includes('Grade: 8th grade'));assert.equal(e.extendedProperties.private.utm_source,'google');assert.equal(e.extendedProperties.private.gclid,'yes');
 assert.equal(e.extendedProperties.private.wbraid,'yes');assert.equal(e.extendedProperties.private.gbraid,'yes');assert.equal(e.extendedProperties.private.landing,'/shsat');
 assert.equal(relayCalls[0].wbraid,'synthetic-wbraid');assert.equal(relayCalls[0].gbraid,'synthetic-gbraid');assert.equal(relayCalls[0].gclid,'synthetic-click');assert.equal(relayCalls[0].google_event_id,e.id);assert.ok(!JSON.stringify(relayCalls).includes('stuyvesant'));
 assert.equal(r.body.booking_receipt,undefined);assert.equal(r.body.quiz,undefined);
});
test('native Calendar endpoint rejects incomplete, ineligible, student and forged completed flags before any provider request',async()=>{
 const p=provider(),h=handler(p);
 for(const edit of [{role:'student'},{grade:4},{grade:10},{targets:[]},{worry:'injected'},{version:2}]){
  const b=body();Object.assign(b.quiz,edit);b.completed=true;b.eligible=true;assert.equal((await call(h,b)).statusCode,400);
 }
 for(const edit of [{email:'bad'},{phone:'bad'},{date:'2026-02-31'},{time:'99:00 AM'},{type:'consulting-strategy'},{exam:'sat'}])assert.equal((await call(h,body(edit))).statusCode,400);
 assert.deepEqual(p.counts(),{inserts:0,reads:0,busyReads:0});
});
test('native Calendar endpoint accepts all grades5–9 without score/income/diagnostic assumptions',async()=>{
 const p=provider(),h=handler(p);
 for(const grade of [5,6,7,8,9]){const b=body();b.quiz.grade=grade;assert.equal((await call(h,b)).statusCode,200);}
 assert.equal(p.counts().inserts,5);
});
test('exact Calendar read-back replays without another insert; altered contact, answer or slot conflicts',async()=>{
 const p=provider(),h=handler(p),b=body(),first=await call(h,b),again=await call(handler(p),b);
 assert.equal(first.statusCode,200);assert.deepEqual(again.body,first.body);assert.equal(p.counts().inserts,1);
 for(const edit of [{email:'other@example.com'},{phone:'+12025550143'},{quiz:{...b.quiz,worry:'math'}},{time:b.time==='4:00 PM'?'4:15 PM':'4:00 PM'}])assert.equal((await call(h,{...b,...edit})).statusCode,409);
 assert.equal(p.counts().inserts,1);
});
test('lost Calendar acknowledgement reconciles exact private evidence without another insert',async()=>{
 const p=provider();p.unknown=true;const h=handler(p),b=body();
 assert.equal((await call(h,b)).statusCode,200);assert.equal((await call(handler(p),b)).statusCode,200);assert.equal(p.counts().inserts,1);
 assert.equal(new Set(relayCalls.map(x=>x.google_event_id)).size,1);
});
test('a missing/uncertain event or failed read never receives a fabricated meeting confirmation',async()=>{
 const p=provider();p.insertFailure=true;const h=handler(p);
 const r=await call(h,body());assert.equal(r.statusCode,503);assert.equal(r.body.error,'booking_reconciliation_required');assert.equal(relayCalls.length,0);
 const before=p.counts().inserts;p.readFailure=true;assert.equal((await call(h,body())).statusCode,503);assert.equal(p.counts().inserts,before);
});
test('provider-native duplicate IDs let two instances replay the same attempt; no in-process lock is used',async()=>{
 const p=provider();let checks=0,release;const barrier=new Promise(r=>{release=r;});
 p.barrier=async()=>{if(++checks===2)release();await barrier;};const b=body();
 const results=await Promise.all([call(handler(p),b),call(handler(p),b)]);assert.ok(results.every(r=>r.statusCode===200));assert.equal(p.events.size,1);
 assert.equal(new Set(relayCalls.map(x=>x.google_event_id)).size,1);
});
test('freebusy outage and taken slot fail closed for quiz; existing cross-parent concurrency is not claimed solved',async()=>{
 const p=provider();p.busyFailure=true;assert.equal((await call(handler(p),body())).statusCode,503);assert.equal(p.counts().inserts,0);
 p.busyFailure=false;const b=body();p.busy=[{start:b.date+'T00:00:00Z',end:b.date+'T23:59:59Z'}];assert.equal((await call(handler(p),b)).statusCode,409);assert.equal(p.counts().inserts,0);
});
test('same-attempt Calendar evidence cannot be accepted after provider-side content, visibility or attendance edits',async()=>{
 const p=provider(),h=handler(p),b=body();assert.equal((await call(h,b)).statusCode,200);const id=[...p.events.keys()][0],original=structuredClone(p.events.get(id));
 for(const change of [{description:'wrong answer'},{visibility:'default'},{status:'cancelled'},{attendees:[{email:'other@example.com'}]},{start:{dateTime:b.date+'T00:00:00Z'}}]){
  p.events.set(id,{...structuredClone(original),...change});assert.equal((await call(h,b)).statusCode,409);
 }
 assert.equal(p.counts().inserts,1);
});
test('preview, hostile origin and oversize payload are stopped before using the real Calendar',async()=>{
 const p=provider(),b=body();assert.equal((await call(handler(p,{env:{VERCEL_ENV:'preview'}}),b)).statusCode,503);
 assert.equal((await call(handler(p),b,{headers:{origin:'https://evil.example'}})).statusCode,403);
 assert.equal((await call(handler(p),{...b,padding:'x'.repeat(4096)})).statusCode,413);assert.equal(p.counts().reads,0);
});
test('native identity binds one quiz attempt and every canonical booking field without an extra secret',()=>{
 const b=body();b.ref='';const id=nativeIdentity(b),changed=nativeIdentity({...b,email:'other@example.com'});
 assert.equal(changed.eventId,id.eventId);assert.notEqual(changed.fingerprint,id.fingerprint);
 assert.equal(nativeIdentity({...b,quiz:{...b.quiz,band:'made_up'}}).fingerprint,id.fingerprint);
});
test('public quiz route now uses the existing Calendar binding and rejects forged qualification without a platform gate',async()=>{
 const policy=require('../api/_shsat-policy');assert.equal(policy.captureHandler,null);assert.equal(typeof policy.bookingHandler,'function');
 const b=body();b.quiz.role='student';b.completed=true;b.eligible=true;
 assert.equal((await call(require('../api/book-consultation'),b)).statusCode,400);
 const source=require('node:fs').readFileSync(require.resolve('../api/_shsat-policy'),'utf8');
 assert.ok(!source.includes('_shsat-platform'));assert.ok(!source.includes('_shsat-runtime'));
});
