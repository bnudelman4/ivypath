'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createPlatformBooking,bridgeSignature}=require('../api/_shsat-platform');
const env={VERCEL:'1',VERCEL_ENV:'production',SHSAT_PLATFORM_BOOKING_ENABLED:'1',SITE_BOOKING_RELAY_SECRET:'synthetic-fixture-not-a-credential'};
function res(){return{statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}};}
const body={booking_flow:'shsat_quiz',quiz:{quiz_id:'synthetic-invalid',grade:8}};
const request=()=>({method:'POST',headers:{origin:'https://www.ivypathacademy.com','x-vercel-forwarded-for':'203.0.113.8'},body});
test('platform bridge binds raw payload and platform-owned IP to fixed HTTPS endpoint, without URLs/ad/log data',async()=>{
 let count=0;
 const h=createPlatformBooking({env,now:()=>1800000000000,fetchImpl:async(url,init)=>{
  count++;assert.equal(url,'https://app.ivypathacademy.com/api/bookings/shsat');assert.equal(init.redirect,'error');
  const parsed=JSON.parse(init.body);assert.equal(parsed.ip,'203.0.113.8');assert.deepEqual(parsed.payload,body);
  assert.equal(init.headers['X-Shsat-Signature'],bridgeSignature(env.SITE_BOOKING_RELAY_SECRET,'1800000000',init.body));
  return new Response(JSON.stringify({error:'completed_eligible_questionnaire_required'}),{status:400});
 }});const r=res();await h(request(),r);assert.equal(r.statusCode,400);assert.equal(count,1);
});
test('platform bridge never calls backend when gate, production environment, origin, IP, secret or body is invalid',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;throw new Error();};
 for(const over of [{SHSAT_PLATFORM_BOOKING_ENABLED:'0'},{VERCEL_ENV:'preview'},{VERCEL:'0'},{SITE_BOOKING_RELAY_SECRET:''},{SITE_BOOKING_RELAY_SECRET:'bad\r\nvalue'}]){
  const r=res();await createPlatformBooking({env:{...env,...over},fetchImpl})(request(),r);assert.equal(r.statusCode,503);
 }
 for(const change of [{headers:{origin:'https://evil.example','x-vercel-forwarded-for':'203.0.113.8'}},{headers:{'x-forwarded-for':'203.0.113.8'}},{body:{...body,padding:'x'.repeat(4096)}}]){
  const r=res();await createPlatformBooking({env,fetchImpl})({...request(),...change},r);assert.ok([403,413,503].includes(r.statusCode));
 }assert.equal(calls,0);
});
test('platform bridge fails closed on unknown outcomes, redirects/provider errors and misleading success',async()=>{
 for(const fetchImpl of [async()=>{throw new Error('unknown');},async()=>new Response('{}',{status:500}),async()=>new Response('{"ok":true,"calendar":false,"success":true}',{status:200}),async()=>new Response('x'.repeat(5000),{status:200})]){
  const r=res();await createPlatformBooking({env,fetchImpl})(request(),r);assert.equal(r.statusCode,503);assert.deepEqual(r.body,{error:'booking_unavailable'});
 }
});
test('platform bridge only returns allowlisted booking JSON and generic errors',async()=>{
 const h=createPlatformBooking({env,fetchImpl:async()=>new Response(JSON.stringify({ok:true,success:true,calendar:true,date:'2026-10-23',time:'4:00 PM',email:'fixture@example.com',meetLink:'',eventLink:'',answers:{private:true},booking_receipt:'never-browser'}))});
 const r=res();await h(request(),r);assert.equal(r.statusCode,200);assert.equal(r.body.answers,undefined);assert.equal(r.body.booking_receipt,undefined);
 const x=res();await createPlatformBooking({env,fetchImpl:async()=>new Response('{"error":"SQL raw secret details"}',{status:503})})(request(),x);assert.deepEqual(x.body,{error:'booking_unavailable'});
});
test('approved server gate wires the actual public SHSAT route; default-off and preview stay closed',async()=>{
 const keys=['VERCEL','VERCEL_ENV','SHSAT_PLATFORM_BOOKING_ENABLED','SITE_BOOKING_RELAY_SECRET'];const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]])),original=global.fetch;
 try{
  Object.assign(process.env,env);let calls=0;global.fetch=async()=>{calls++;return new Response(JSON.stringify({ok:true,success:true,calendar:true,email:'synthetic@example.com',date:'2026-10-23',time:'4:00 PM',meetLink:'',eventLink:''}));};
  const handler=require('../api/book-consultation');const r=res();await handler(request(),r);assert.equal(r.statusCode,200);assert.equal(calls,1);
  process.env.SHSAT_PLATFORM_BOOKING_ENABLED='0';const closed=res();await handler(request(),closed);assert.equal(closed.statusCode,409);assert.equal(calls,1);
  process.env.SHSAT_PLATFORM_BOOKING_ENABLED='1';process.env.VERCEL_ENV='preview';const preview=res();await handler(request(),preview);assert.equal(preview.statusCode,409);assert.equal(calls,1);
 }finally{global.fetch=original;for(const k of keys){if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}}
});
