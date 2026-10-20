'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const {Pool}=require('pg');
const Q=require('../shsat-quiz-logic');
const Slots=require('../booking-slots');
const {createStore}=require('../api/_shsat-store');
const {createQuestionnaireBooking:questionnaireFactory}=require('../api/_shsat-questionnaire');
const {createBooking:bookingFactory}=require('../api/_shsat-booking');
const R=require('../api/_shsat-request');
const {createRelayDelivery,createSiteBookingSender,createBookingRecovery}=require('../api/_shsat-relay');
const testIp=req=>R.clientIp(req,{VERCEL:'1',VERCEL_ENV:'production'});
function testBindings(args){return {delivery:createRelayDelivery({store:args.store,send:async()=>true}),clientIp:testIp,...args};}
const createQuestionnaireBooking=args=>questionnaireFactory(testBindings(args));
const createBooking=args=>bookingFactory(testBindings(args));
const fixture=require('./fixtures/quiz-payload.json').valid[0].body;
const url=process.env.SHSAT_TEST_DATABASE_URL;
if(url && url!=='postgres://postgres@127.0.0.1:55439/postgres')throw new Error('local_disposable_database_only');
let admin,a,b,sa,sb,seq=0;
const secret=Buffer.alloc(32,7); // synthetic local fixture, not a production key
const dbtest=(name,fn)=>test(name,{skip:!url},fn);
function res(){return{statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(s){this.statusCode=s;return this;},json(body){this.body=body;return this;},end(s){this.body=s?JSON.parse(s):null;}};}
async function call(h,body,ip='203.0.113.7'){const r=res();await h({method:'POST',headers:{origin:'https://www.ivypathacademy.com','x-forwarded-for':ip,'x-vercel-forwarded-for':ip},body},r);return r;}
function finalBooking(over={}){
 const today=Slots.etToday();let date,time;
 for(let i=1;i<15;i++){const d=new Date(Date.UTC(today.y,today.m-1,today.d+i));const slots=Slots.openSlots(d.getUTCFullYear(),d.getUTCMonth()+1,d.getUTCDate(),{busy:[]});if(slots.length){date=d.toISOString().slice(0,10);time=slots[seq % slots.length];break;}}
 const n=++seq;
 return {booking_flow:'shsat_quiz',name:'Sam Rivera',email:'synthetic'+n+'@example.com',phone:'+1202555'+String(100+n).padStart(4,'0'),date,time,
 quiz:{...fixture.quiz,quiz_id:crypto.randomUUID(),grade:8},...over};
}
async function accepted(req,res,body={ok:true,calendar:true}){
 const TRUST=require('../api/_booking-trust');const event={id:req.body[TRUST].eventId,visibility:'private',summary:'Consultation',description:'Synthetic SHSAT summary',start:{dateTime:req.body.date+'T16:00:00',timeZone:'America/New_York'},end:{dateTime:req.body.date+'T16:15:00',timeZone:'America/New_York'},attendees:[{email:req.body.email}],extendedProperties:{private:{source:'shsat_quiz'}}};
 await req.body[TRUST].beforeInsert(event);res.status(200).json(body);return event;
}
test.before(async()=>{
 if(!url)return;admin=new Pool({connectionString:url});await admin.query('DROP SCHEMA IF EXISTS shsat_intake CASCADE');
 await admin.query(fs.readFileSync('db/shsat-booking-owner-review.sql','utf8'));
 await admin.query(fs.readFileSync('db/shsat-relay-owner-review.sql','utf8'));
 await admin.query("DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='shsat_fixture') THEN CREATE ROLE shsat_fixture NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$");
 const grants=fs.readFileSync('db/shsat-booking-grants.psql','utf8');
 await admin.query(grants.slice(grants.indexOf('BEGIN;'),grants.indexOf('COMMIT;')+7).replaceAll(':"intake_role"','shsat_fixture'));
 const upgrade=fs.readFileSync('db/shsat-relay-grants.psql','utf8');
 await admin.query(upgrade.slice(upgrade.indexOf('BEGIN;'),upgrade.indexOf('COMMIT;')+7).replaceAll(':"intake_role"','shsat_fixture'));
 a=new Pool({connectionString:url,options:'-c role=shsat_fixture'});b=new Pool({connectionString:url,options:'-c role=shsat_fixture'});sa=createStore(a,secret);sb=createStore(b,secret);
});
test.beforeEach(async()=>{if(url)await admin.query('TRUNCATE shsat_intake.intakes CASCADE');});
test.after(async()=>{if(a)await a.end();if(b)await b.end();if(admin)await admin.end();});

dbtest('server validates complete eligible questionnaire; stores encrypted exact booking intake without a message outbox',async()=>{
 let calls=0,seen;const book=async(req,res)=>{calls++;seen=req.body;await accepted(req,res);};
 const h=createQuestionnaireBooking({store:sa,book}),request=finalBooking();request.quiz.band='early_start';
 assert.equal((await call(h,request)).statusCode,200);assert.equal(calls,1);assert.equal(seen.quiz.role,'parent');assert.equal(seen.quiz.grade,8);assert.equal(seen.quiz.band,'final_weeks_baseline');
 assert.equal((await call(createQuestionnaireBooking({store:sb,book}),request)).statusCode,200);assert.equal(calls,1);
 const row=(await a.query('SELECT * FROM shsat_intake.intakes')).rows[0];
 for(const value of [request.name,request.email,request.phone,'stuyvesant'])assert.ok(!JSON.stringify(row).includes(value));
 const verified=await sa.verify(seen.booking_receipt);assert.equal(verified.value.booking_requested,true);assert.equal(verified.value.consent,false);
 assert.equal((await admin.query("SELECT to_regclass('shsat_intake.outbox') AS name")).rows[0].name,null);
 const edited=structuredClone(request);edited.quiz.worry='ela';assert.equal((await call(h,edited)).statusCode,409);assert.equal(calls,1);
});
dbtest('completion/eligibility flags do not bypass answer, role, grade, contact or slot validation',async()=>{
 let calls=0;const h=createQuestionnaireBooking({store:sa,book:async()=>{calls++;}});
 for(const grade of [4,'under5',10,'over9']){const x=finalBooking();Object.assign(x,{completed:true,eligible:true});x.quiz.grade=grade;assert.equal((await call(h,x)).statusCode,400);}
 for(const field of ['role','targets','prep','practice_test','worry']){const x=finalBooking();delete x.quiz[field];x.eligible=true;assert.equal((await call(h,x)).statusCode,400);}
 for(const [field,value]of [['role','student'],['targets',['stuyvesant','not_sure']],['worry','INJECTED']]){const x=finalBooking();x.quiz[field]=value;assert.equal((await call(h,x)).statusCode,400);}
 for(const over of [{date:'2026-02-31'},{time:'4:12 AM'},{email:'invalid'},{phone:'invalid'}])assert.equal((await call(h,finalBooking(over))).statusCode,400);
 assert.equal(calls,0);assert.equal(Number((await a.query('SELECT count(*) n FROM shsat_intake.intakes')).rows[0].n),0);
});
dbtest('grades5 through9 qualify without score, income or diagnostic entitlement assumptions',async()=>{
 let calls=0;const h=createQuestionnaireBooking({store:sa,book:async(req,res)=>{calls++;await accepted(req,res);}});
 for(const grade of [5,6,7,8,9]){const x=finalBooking();x.quiz.grade=grade;assert.equal((await call(h,x,'203.0.113.'+grade)).statusCode,200);}
 assert.equal(calls,5);assert.equal(Q.diagAvailable(5),false);
});
dbtest('independent instances reserve phone capacity atomically before calendar calls',async()=>{
 let calls=0,release;const hold=new Promise(r=>{release=r;});const book=async(_req,res)=>{calls++;await hold;res.status(503).json({error:'calendar_unavailable'});};
 const hs=[createQuestionnaireBooking({store:sa,book}),createQuestionnaireBooking({store:sb,book})];
 const jobs=Array.from({length:10},(_,i)=>call(hs[i%2],finalBooking({phone:'+12025550100'}),'203.0.113.'+(i+1)));
 for(let i=0;i<100 && calls<2;i++)await new Promise(r=>setTimeout(r,10));assert.equal(calls,2);release();
 const results=await Promise.all(jobs);assert.equal(results.filter(r=>r.statusCode===429).length,8);
});
dbtest('independent instances count failed and pending reservations against five IP attempts',async()=>{
 let calls=0;const book=async(_req,res)=>{calls++;res.status(503).json({error:'calendar_unavailable'});};
 const hs=[createQuestionnaireBooking({store:sa,book}),createQuestionnaireBooking({store:sb,book})];
 const results=await Promise.all(Array.from({length:12},(_,i)=>call(hs[i%2],finalBooking())));
 assert.equal(calls,5);assert.equal(results.filter(r=>r.statusCode===429).length,7);
});
dbtest('unknown provider outcome blocks duplicate calls; GET reconciliation must match the exact event',async()=>{
 let calls=0,event;const TRUST=require('../api/_booking-trust');
 const book=async(req,res)=>{calls++;event={id:req.body[TRUST].eventId,visibility:'private',summary:'Consultation',description:'Canonical saved answers',start:{dateTime:req.body.date+'T12:00:00',timeZone:'America/New_York'},end:{dateTime:req.body.date+'T12:15:00',timeZone:'America/New_York'},attendees:[{email:req.body.email}],extendedProperties:{private:{source:'shsat_quiz'}}};await req.body[TRUST].beforeInsert(event);res.status(503).json({error:'unknown'});};
 const request=finalBooking(),h=createQuestionnaireBooking({store:sa,book});
 assert.equal((await call(h,request)).statusCode,503);assert.equal((await call(createQuestionnaireBooking({store:sb,book}),request)).statusCode,409);assert.equal(calls,1);
 const open=Slots.openSlots;Slots.openSlots=()=>[];
 try{assert.equal((await call(h,request)).statusCode,409);assert.equal(calls,1);}finally{Slots.openSlots=open;}
 const row=(await a.query('SELECT receipt_hash FROM shsat_intake.intakes')).rows[0];assert.match(row.receipt_hash,/^[a-f0-9]{64}$/);
 // Reconstruct the token only through the server store's exact intake replay.
 const trusted={...fixture,parent_name:request.name,parent_email:request.email,phone:request.phone,quiz_id:request.quiz.quiz_id,student_grade:8,quiz:fixture.quiz,purpose:'consultation_booking'};
 const replay=await sa.reserve(trusted,'203.0.113.7');assert.ok(replay.receipt);
 assert.equal(await sa.reconcileBooking(replay.receipt,async()=>({...event,description:'tampered'})),false);
 assert.equal(await sa.reconcileByQuizId(request.quiz.quiz_id,async()=>({...event,start:{dateTime:event.start.dateTime+'-04:00'},end:{dateTime:event.end.dateTime+'-04:00'},htmlLink:'https://calendar.example.invalid/event'})),true);
 assert.equal((await call(h,request)).statusCode,200);assert.equal(calls,1);
});
dbtest('booking rejects expired/forged proof and does not attach another parent contact',async()=>{
 const h=createBooking({store:sa,book:async()=>assert.fail('must not call calendar')});
 assert.equal((await call(h,finalBooking({booking_receipt:'0'.repeat(64)}))).statusCode,409);
 assert.equal((await sa.verify('bad')).ok,false);
 let receipt;const capture=createQuestionnaireBooking({store:sa,book:async(req,res)=>{receipt=req.body.booking_receipt;await accepted(req,res);}});const x=finalBooking();await call(capture,x);
 await admin.query("UPDATE shsat_intake.intakes SET expires_at=clock_timestamp()-interval '1 second'");
 // An exact terminal response is read-only even after intake capability expiry.
 assert.equal((await call(capture,x)).statusCode,200);
 assert.equal((await call(h,{...x,booking_receipt:receipt})).statusCode,409); // Expired capability cannot authorize a booking write.
});
dbtest('restricted server role has RLS, no product access and cannot change intake ciphertext',async()=>{
 await admin.query('CREATE TABLE IF NOT EXISTS public.shsat_product_sentinel (id integer)');
 await assert.rejects(a.query('SELECT * FROM public.shsat_product_sentinel'),/permission denied/);
 await assert.rejects(a.query("UPDATE shsat_intake.intakes SET snapshot='changed'"),/permission denied/);
 const rows=(await admin.query("SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='shsat_intake' AND c.relkind='r'")).rows;
 assert.equal(rows.length,3);assert.ok(rows.every(r=>r.relrowsecurity));
});

test('public capture stays disabled; flags cannot bypass native quiz validation or missing existing Calendar configuration',async()=>{
 const original=process.env.QUIZ_PLAN_COPY_ENABLED,key=process.env.GOOGLE_SERVICE_ACCOUNT_KEY;process.env.QUIZ_PLAN_COPY_ENABLED='true';delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
 try{
  assert.equal((await call(require('../api/quiz-lead'),fixture)).statusCode,503);
  const invalid=finalBooking({eligible:true,completed:true});invalid.quiz.role='student';
  assert.equal((await call(require('../api/book-consultation'),invalid)).statusCode,400);
  assert.equal((await call(require('../api/book-consultation'),finalBooking())).statusCode,503);
 }finally{if(original===undefined)delete process.env.QUIZ_PLAN_COPY_ENABLED;else process.env.QUIZ_PLAN_COPY_ENABLED=original;if(key===undefined)delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY;else process.env.GOOGLE_SERVICE_ACCOUNT_KEY=key;}
});

dbtest('two different eligible parents cannot reserve the same calendar slot across instances',async()=>{
 let calls=0;const book=async(req,res)=>{calls++;await accepted(req,res);};
 const x=finalBooking(),y=finalBooking({date:x.date,time:x.time});
 const results=await Promise.all([call(createQuestionnaireBooking({store:sa,book}),x),call(createQuestionnaireBooking({store:sb,book}),y)]);
 assert.equal(calls,1);assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);assert.equal(results.find(r=>r.statusCode===409).body.error,'slot_taken');
});

dbtest('review P2: identical accepted replay survives lead-time cutoff, but changed intake/slot cannot use it',async()=>{
 let calls=0;const h=createQuestionnaireBooking({store:sa,book:async(req,res)=>{calls++;await accepted(req,res,{ok:true,calendar:true,meetLink:'https://meet.example.invalid/bound'});}});
 const x=finalBooking();const first=await call(h,x);assert.equal(first.statusCode,200);
 const open=Slots.openSlots;Slots.openSlots=()=>[];
 try{
  const replay=await call(h,x);assert.equal(replay.statusCode,200);assert.deepEqual(replay.body,first.body);assert.equal(calls,1);
  const edited=structuredClone(x);edited.quiz.worry='ela';assert.equal((await call(h,edited)).statusCode,409);
  assert.equal((await call(h,{...x,email:'changed@example.com'})).statusCode,409);
  assert.equal((await call(h,{...x,time:x.time==='5:00 PM'?'5:30 PM':'5:00 PM'})).statusCode,409);assert.equal(calls,1);
  assert.equal((await call(h,finalBooking())).statusCode,400);assert.equal(calls,1);
 }finally{Slots.openSlots=open;}
});
dbtest('review security: twenty identical pre-provider slot rejections cannot repeat provider checks without bound',async()=>{
 let checks=0;const book=async(_req,res)=>{checks++;res.status(409).json({error:'slot_taken'});};
 const hs=[createQuestionnaireBooking({store:sa,book}),createQuestionnaireBooking({store:sb,book})],x=finalBooking();const results=[];
 for(let i=0;i<20;i++)results.push(await call(hs[i%2],x,'203.0.113.'+(i+1))); // Rotating IPs cannot bypass the phone budget.
 assert.equal(checks,5);assert.equal(results.filter(r=>r.statusCode===429).length,15);
 assert.equal(Number((await a.query('SELECT count(*) n FROM shsat_intake.intakes')).rows[0].n),1);
});
dbtest('review security: one rejected slot can be corrected, then terminal replay never rechecks provider',async()=>{
 let checks=0;const book=async(req,res)=>{checks++;if(checks===1)res.status(409).json({error:'slot_taken'});else await accepted(req,res);};
 const h=createQuestionnaireBooking({store:sa,book}),x=finalBooking();assert.equal((await call(h,x)).statusCode,409);
 const date=x.date.split('-').map(Number);const options=Slots.openSlots(...date,{busy:[]});const corrected={...x,time:options.find(t=>t!==x.time)};
 assert.equal((await call(h,corrected)).statusCode,200);assert.equal(checks,2);
 for(let i=0;i<10;i++)assert.equal((await call(h,corrected)).statusCode,200);assert.equal(checks,2);
});

dbtest('release relay: confirmed private Calendar acceptance delivers only minimal operations fields once',async()=>{
 let calls=0;const posts=[];
 const send=createSiteBookingSender({secret:'synthetic-relay-secret',fetchImpl:async(url,init)=>{posts.push({url,init});return{ok:true,json:async()=>({ok:true,id:crypto.randomUUID()})};}});
 const delivery=createRelayDelivery({store:sa,send});
 const h=createQuestionnaireBooking({store:sa,delivery,book:async(req,res)=>{calls++;await accepted(req,res,{calendar:true,meetLink:'https://meet.google.com/abc-defg-hij',eventLink:'never-relayed'});}});
 const x=finalBooking({attribution:{gclid:'forbidden-click-id',utm_campaign:'forbidden-campaign',fbclid:'forbidden-fbclid'}});
 const first=await call(h,x);assert.equal(first.statusCode,200);assert.equal(calls,1);assert.equal(posts.length,1);
 const payload=JSON.parse(posts[0].init.body);
 assert.deepEqual(Object.keys(payload).sort(),['source','type','name','email','phone','start','end','google_event_id','meet_link'].sort());
 assert.equal(payload.source,'site');assert.equal(payload.type,'consultation');assert.equal(payload.phone,x.phone);assert.equal(payload.meet_link,'https://meet.google.com/abc-defg-hij');
 assert.equal(posts[0].url,'https://app.ivypathacademy.com/api/bookings/site');assert.equal(posts[0].init.redirect,'error');assert.equal(posts[0].init.headers['Idempotency-Key'],payload.google_event_id);
 for(const forbidden of ['forbidden-','targets','worry','grade','quiz','Synthetic SHSAT summary','never-relayed'])assert.ok(!posts[0].init.body.includes(forbidden));
 const row=(await a.query('SELECT relay_state,relay_payload,relay_attempts FROM shsat_intake.bookings')).rows[0];assert.equal(row.relay_state,'delivered');assert.equal(row.relay_attempts,1);
 assert.ok(!row.relay_payload.includes(x.email));assert.ok(!row.relay_payload.includes(x.phone));
 for(let i=0;i<5;i++)assert.deepEqual((await call(h,x)).body,first.body);
 assert.equal(calls,1);assert.equal(posts.length,1);
});

dbtest('release relay: uncertain Calendar evidence cannot relay; authenticated private reconciliation creates and delivers the job',async()=>{
 let event,calls=0,posts=0;
 const delivery=createRelayDelivery({store:sa,send:async()=>{posts++;return true;}});
 const x=finalBooking(),h=createQuestionnaireBooking({store:sa,delivery,book:async(req,res)=>{calls++;event=await accepted(req,res);res.status(503).json({error:'unknown'});}});
 assert.equal((await call(h,x)).statusCode,503);assert.equal(posts,0);
 assert.equal((await a.query('SELECT relay_state FROM shsat_intake.bookings')).rows[0].relay_state,'not_ready');
 const recover=createBookingRecovery({store:sb,delivery,lookup:async()=>({...event,visibility:'public'})});
 assert.equal((await recover(x.quiz.quiz_id)).reconciled,false);assert.equal(posts,0);
 const exact=createBookingRecovery({store:sb,delivery,lookup:async()=>({...event,hangoutLink:'https://meet.google.com/abc-defg-hij'})});
 assert.deepEqual(await exact(x.quiz.quiz_id),{reconciled:true,delivered:true});assert.equal(posts,1);
 assert.deepEqual(await exact(x.quiz.quiz_id),{reconciled:false,delivered:false});assert.equal(posts,1);assert.equal(calls,1);
 assert.equal((await call(h,x)).statusCode,200);assert.equal(posts,1);
});

dbtest('release relay: lost receiver acknowledgement retries the identical payload/key across instances and terminal replay cutoff',async()=>{
 const posts=[],records=new Map();let calls=0;
 const send=createSiteBookingSender({secret:'synthetic-relay-secret',fetchImpl:async(_url,init)=>{
  posts.push(init.body);const p=JSON.parse(init.body);if(!records.has(p.google_event_id))records.set(p.google_event_id,crypto.randomUUID());
  if(posts.length===1)throw new Error('synthetic response lost after receiver commit');
  return {ok:true,json:async()=>({ok:true,id:records.get(p.google_event_id),duplicate:true})};
 }});
 const x=finalBooking(),h=createQuestionnaireBooking({store:sa,delivery:createRelayDelivery({store:sa,send}),book:async(req,res)=>{calls++;await accepted(req,res);}});
 const first=await call(h,x);assert.equal(first.statusCode,200);assert.equal(posts.length,1);
 const encrypted=(await a.query('SELECT relay_payload FROM shsat_intake.bookings')).rows[0].relay_payload;
 for(let i=0;i<20;i++)assert.deepEqual((await call(h,x)).body,first.body);assert.equal(posts.length,1);assert.deepEqual(await sa.dueRelays(),[]);
 await admin.query("UPDATE shsat_intake.bookings SET relay_next_attempt_at=clock_timestamp()-interval '1 second'");
 const second=createQuestionnaireBooking({store:sb,delivery:createRelayDelivery({store:sb,send}),book:async()=>assert.fail('no second Calendar call')});
 const open=Slots.openSlots;Slots.openSlots=()=>[];
 try{assert.deepEqual((await call(second,x)).body,first.body);}finally{Slots.openSlots=open;}
 assert.equal(posts.length,2);assert.equal(posts[0],posts[1]);assert.equal(records.size,1);assert.equal(calls,1);
 const row=(await a.query('SELECT relay_state,relay_payload FROM shsat_intake.bookings')).rows[0];assert.equal(row.relay_state,'delivered');assert.equal(row.relay_payload,encrypted);
});

dbtest('release relay: crash lease recovery fences stale acknowledgements and permits only one claimant across instances',async()=>{
 const x=finalBooking(),h=createQuestionnaireBooking({store:sa,delivery:{byQuizId:async()=>{throw new Error('synthetic worker crash before delivery');}},book:accepted});
 assert.equal((await call(h,x)).statusCode,200);
 const claims=await Promise.all([sa.claimRelay(x.quiz.quiz_id),sb.claimRelay(x.quiz.quiz_id)]);assert.equal(claims.filter(Boolean).length,1);const first=claims.find(Boolean);
 await admin.query("UPDATE shsat_intake.bookings SET relay_lease_until=clock_timestamp()-interval '1 second'");
 const next=await sb.claimRelay(x.quiz.quiz_id);assert.ok(next);assert.deepEqual(next.payload,first.payload);
 assert.equal(await sa.finishRelay(first,true),false);assert.equal((await a.query('SELECT relay_state FROM shsat_intake.bookings')).rows[0].relay_state,'delivering');
 assert.equal(await sb.finishRelay(next,true),true);assert.equal(await sa.claimRelay(x.quiz.quiz_id),null);
 assert.equal((await a.query('SELECT relay_attempts FROM shsat_intake.bookings')).rows[0].relay_attempts,2);
});

dbtest('release relay: server recovery batches respect durable backoff and stop after twelve attempts',async()=>{
 let posts=0;const delivery=createRelayDelivery({store:sa,send:async()=>{posts++;return false;}});
 const x=finalBooking(),h=createQuestionnaireBooking({store:sa,delivery,book:accepted});assert.equal((await call(h,x)).statusCode,200);
 assert.deepEqual(await delivery.retryPending(),{checked:0,delivered:0});assert.equal(posts,1);
 for(let i=1;i<12;i++){await admin.query("UPDATE shsat_intake.bookings SET relay_next_attempt_at=clock_timestamp()-interval '1 second'");await delivery.retryPending();}
 const row=(await a.query('SELECT relay_state,relay_attempts FROM shsat_intake.bookings')).rows[0];assert.equal(row.relay_state,'blocked');assert.equal(row.relay_attempts,12);assert.equal(posts,12);
 assert.equal((await call(h,x)).statusCode,200);await delivery.retryPending();assert.equal(posts,12);
 await assert.rejects(delivery.retryPending(21),/bounded_recovery/);await assert.rejects(delivery.retryPending(0),/bounded_recovery/);
});

dbtest('release relay: acceptance persistence failure leaves no deliverable job and exact Calendar reconciliation recovers once',async()=>{
 let event,posts=0,calls=0;const delivery=createRelayDelivery({store:sa,send:async()=>{posts++;return true;}});
 await admin.query("CREATE FUNCTION shsat_intake.fixture_reject_accept() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state='accepted' THEN RAISE EXCEPTION 'synthetic durable write failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fixture_reject_accept BEFORE UPDATE ON shsat_intake.bookings FOR EACH ROW EXECUTE FUNCTION shsat_intake.fixture_reject_accept()");
 const x=finalBooking(),h=createQuestionnaireBooking({store:sa,delivery,book:async(req,res)=>{calls++;event=await accepted(req,res);}});
 try{assert.equal((await call(h,x)).statusCode,503);assert.equal(posts,0);const row=(await a.query('SELECT state,relay_state,relay_payload FROM shsat_intake.bookings')).rows[0];assert.equal(row.state,'pending');assert.equal(row.relay_state,'not_ready');assert.equal(row.relay_payload,null);}
 finally{await admin.query('DROP TRIGGER fixture_reject_accept ON shsat_intake.bookings; DROP FUNCTION shsat_intake.fixture_reject_accept()');}
 const recover=createBookingRecovery({store:sb,delivery,lookup:async()=>event});assert.deepEqual(await recover(x.quiz.quiz_id),{reconciled:true,delivered:true});assert.equal(posts,1);assert.equal(calls,1);
 assert.equal((await call(h,x)).statusCode,200);assert.equal(posts,1);assert.equal(calls,1);
});

dbtest('release proxy: absent trusted identity stops before durable writes, Calendar or relay',async()=>{
 const h=questionnaireFactory({store:sa,book:async()=>assert.fail('no Calendar'),delivery:{byQuizId:async()=>assert.fail('no relay')},clientIp:req=>R.clientIp(req,{})});
 assert.equal((await call(h,finalBooking())).statusCode,503);assert.equal(Number((await a.query('SELECT count(*) n FROM shsat_intake.intakes')).rows[0].n),0);
});
