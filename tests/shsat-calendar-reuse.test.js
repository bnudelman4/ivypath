'use strict';
// Exact deployed marketing implementation, exercised WITHOUT production calls.
// This characterizes the minimum-reuse option; it does not change that handler
// or bless its legacy lead-acknowledgement behavior as meeting confirmation.
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const Q=require('../shsat-quiz-logic');
const LIVE='6c2db2c5ab40d3de91ec474e056d87642c0b194a';
const source=execFileSync('git',['show',LIVE+':api/book-consultation.js'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
const bookPage=execFileSync('git',['show',LIVE+':book.html'],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
function response(){return{statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;},end(){return this;}};}
function payload(over={}){return {name:'Synthetic Parent',email:'synthetic@example.com',phone:'+12025550142',date:'2026-11-03',time:'4:00 PM',booking_flow:'shsat_quiz',quiz:{version:1,quiz_id:crypto.randomUUID(),role:'parent',grade:8,targets:['stuyvesant'],prep:'self',practice_test:'no',worry:'timing'},attribution:{utm_source:'google',utm_campaign:'shsat',gclid:'synthetic-click'},...over};}
function load(options={}){
 const events=[],fetches=[],logs=[];
 const calendar={events:{insert:async args=>{
  const id=args.resource.id||crypto.randomUUID();events.push({...args.resource,id});
  if(options.unknownInsert)throw new Error('synthetic lost acknowledgement');
  return{data:{id,hangoutLink:'https://meet.google.com/aaa-bbbb-ccc',htmlLink:'https://calendar.google.com/calendar/event?eid=synthetic'}};
 }}};
 const module={exports:{}};
 vm.runInNewContext(source,{module,exports:module.exports,Buffer,URL,URLSearchParams,Date,Promise,setTimeout:fn=>{Promise.resolve().then(fn);return 1;},clearTimeout(){},
  process:{env:options.relay?{SITE_BOOKING_RELAY_SECRET:'synthetic-fixture-only'}:{}},
  console:Object.fromEntries(['log','error','warn','info'].map(k=>[k,(...a)=>logs.push(a.map(String).join(' '))])),
  fetch:async(url,init)=>{fetches.push({url,body:JSON.parse(init.body)});return{ok:true,status:200};},
  require(name){
   if(name==='uuid')return{v4:crypto.randomUUID};
   if(name==='./_calendar')return{calendarClient:()=>calendar,busyBetween:options.busyBetween|| (async()=>[]),overlaps:(a,b,c,d)=>Date.parse(a)<Date.parse(d)&&Date.parse(c)<Date.parse(b),etOffsetIso:()=>'-05:00'};
   throw new Error('unexpected dependency '+name);
  }},{filename:'exact-production-book-consultation.js'});
 return {handler:module.exports,events,fetches,logs};
}
async function call(server,body){const res=response();await server.handler({method:'POST',headers:{'x-vercel-forwarded-for':'203.0.113.7'},body},res);return res;}
test('existing marketing creates Google Calendar/Meet directly; platform relay runs after that insert',async()=>{
 const s=load({relay:true}),p=payload(),r=await call(s,p);
 assert.equal(r.statusCode,200);assert.equal(r.body.calendar,true);assert.equal(s.events.length,1);
 const e=s.events[0];assert.equal(e.attendees[0].email,p.email);assert.equal(e.conferenceData.createRequest.conferenceSolutionKey.type,'hangoutsMeet');
 assert.equal(e.extendedProperties.private.utm_source,'google');assert.equal(e.extendedProperties.private.gclid,'yes');
 assert.equal(s.fetches.length,1);assert.equal(s.fetches[0].url,'https://app.ivypathacademy.com/api/bookings/site');assert.equal(s.fetches[0].body.google_event_id,e.id);
 assert.ok(!JSON.stringify(e.extendedProperties.private).includes('synthetic-click'));
 assert.equal(s.fetches[0].body.gclid,'synthetic-click'); // Existing operations attribution, not Calendar/ad answer data.
});
test('existing deployed handler ignores all six quiz answers, role and grade; adding only the quiz link cannot enforce qualification',async()=>{
 for(const change of [{role:'student'},{grade:4},{grade:10},{targets:[]},{worry:'injected'}]){
  const s=load(),p=payload();Object.assign(p.quiz,change);const r=await call(s,p);
  assert.equal(r.body.calendar,true);assert.equal(s.events.length,1);assert.ok(!s.events[0].description.includes('SHSAT PLAN'));
 }
});
test('existing insert can create an event then lose its acknowledgement: retry creates a second event with a new ID',async()=>{
 const s=load({unknownInsert:true}),p=payload();const first=await call(s,p),second=await call(s,p);
 assert.equal(first.statusCode,200);assert.equal(first.body.ok,true);assert.equal(first.body.success,true);assert.equal(first.body.calendar,false);
 assert.equal(second.body.calendar,false);assert.equal(s.events.length,2);assert.notEqual(s.events[0].id,s.events[1].id);
 assert.notEqual(s.events[0].conferenceData.createRequest.requestId,s.events[1].conferenceData.createRequest.requestId);
 // Both live and candidate booking pages rely on response.ok. Only the
 // candidate's durable server wrapper turns unknown outcomes into non-2xx.
 assert.match(bookPage,/if \(!response\.ok\)/);assert.ok(!bookPage.includes('if (!data.calendar'));
 assert.match(bookPage,/window\.location\.href = 'thank-you\.html\?'/);
});
test('independent current handler instances can both observe a free slot and create conflicting meetings',async()=>{
 let checks=0,release;const barrier=new Promise(resolve=>{release=resolve;});
 const busyBetween=async()=>{if(++checks===2)release();await barrier;return[];};
 const a=load({busyBetween}),b=load({busyBetween}),p=payload();
 const results=await Promise.all([call(a,p),call(b,p)]);
 assert.ok(results.every(r=>r.body.calendar===true));assert.equal(a.events.length+b.events.length,2);assert.notEqual(a.events[0].id,b.events[0].id);
});
test('existing freebusy failure still inserts; repeated attempts have no shared phone/IP reservation',async()=>{
 const s=load({busyBetween:async()=>{throw new Error('synthetic freebusy failure');}}),p=payload();
 for(let i=0;i<6;i++){const r=await call(s,p);assert.equal(r.body.calendar,true);}
 assert.equal(s.events.length,6);assert.ok(s.logs.some(line=>line.includes('booking anyway')));
});
test('the approved quiz and booking page already keep the minimal direct-Calendar handoff and conversion routes',()=>{
 const page=fs.readFileSync(path.resolve(__dirname,'../book.html'),'utf8');
 assert.match(page,/fetch\('\/api\/book-consultation'/);assert.match(page,/payload\.booking_flow = 'shsat_quiz'/);
 assert.match(page,/sessionStorage\.setItem\('ivp_booked_email'/);assert.match(page,/window\.location\.href = 'thank-you\.html\?'/);
 assert.equal(Q.firstMissing(payload().quiz),null);assert.equal(Q.consultationFit(payload().quiz).eligible,true);
 const q=payload().quiz;for(const grade of [5,6,7,8,9])assert.equal(Q.consultationFit({...q,grade}).eligible,true);
 for(const grade of ['under5','over9'])assert.equal(Q.consultationFit({...q,grade}).eligible,false);
});
