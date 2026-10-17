'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSiteBookingSender,createBookingRecovery,createRelayDelivery}=require('../api/_shsat-relay');
const {createShsatRuntime}=require('../api/_shsat-runtime');
const payload={source:'site',type:'consultation',name:'Synthetic Parent',email:'synthetic@example.com',phone:'+12025550123',start:'2026-10-20T20:00:00.000Z',end:'2026-10-20T20:15:00.000Z',google_event_id:'a'.repeat(64),meet_link:null};
test('release sender: HTTP failures, malformed or missing acknowledgements cannot mark delivery',async()=>{
 for(const response of [{ok:false,json:async()=>({ok:true,id:'3b1f0c9e-6a0e-4f2d-9d6b-2f4f7b0c1a11'})},{ok:true,json:async()=>({ok:true})},{ok:true,json:async()=>({ok:false,id:'3b1f0c9e-6a0e-4f2d-9d6b-2f4f7b0c1a11'})},{ok:true,json:async()=>{throw new Error('malformed');}}]){
  const send=createSiteBookingSender({secret:'synthetic-relay-secret',fetchImpl:async()=>response});let result=false;try{result=await send(payload);}catch(_){}assert.equal(result,false);
 }
});
test('release sender: fixed receiver, strict field projection, no redirect and bounded abort',async()=>{
 let seen;const send=createSiteBookingSender({secret:'synthetic-relay-secret',fetchImpl:async(url,init)=>{seen={url,init};return {ok:true,json:async()=>({ok:true,id:'3b1f0c9e-6a0e-4f2d-9d6b-2f4f7b0c1a11'})};}});
 assert.equal(await send({...payload,quiz:{grade:8},gclid:'must-not-send',url:'https://attacker.invalid'}),true);
 assert.equal(seen.url,'https://app.ivypathacademy.com/api/bookings/site');assert.equal(seen.init.redirect,'error');assert.deepEqual(JSON.parse(seen.init.body),payload);
 assert.ok(!seen.init.body.includes('synthetic-relay-secret'));
 const timeout=createSiteBookingSender({secret:'synthetic-relay-secret',fetchImpl:async(_url,init)=>new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('synthetic timeout'))))});
 await assert.rejects(timeout(payload),/synthetic timeout/);
});
test('release runtime: constructor remains unbound, requires exact approved server configuration and does not expose values',()=>{
 const policy=require('../api/_shsat-policy');assert.equal(policy.bookingHandler,null);assert.equal(policy.captureHandler,null);
 const env={VERCEL:'1',VERCEL_ENV:'production',SHSAT_BOOKING_DATABASE_URL:'postgres://synthetic@db.example.invalid/booking?sslmode=verify-full',SHSAT_BOOKING_CRYPTO_KEY_BASE64:Buffer.alloc(32,7).toString('base64'),SITE_BOOKING_RELAY_SECRET:'synthetic-relay-secret'};
 let pools=0;const args={env,book:async()=>{},lookup:async()=>null,poolFactory:()=>{pools++;return{end:async()=>{}};}};
 for(const key of ['SHSAT_BOOKING_DATABASE_URL','SHSAT_BOOKING_CRYPTO_KEY_BASE64','SITE_BOOKING_RELAY_SECRET','VERCEL']){
  assert.throws(()=>createShsatRuntime({...args,env:{...env,[key]:undefined}}),e=>!e.message.includes('synthetic@') && !e.message.includes('synthetic-relay-secret'));assert.equal(pools,0);
 }
 assert.throws(()=>createShsatRuntime({...args,env:{...env,SHSAT_BOOKING_DATABASE_URL:env.SHSAT_BOOKING_DATABASE_URL.replace('verify-full','disable')}}));
 const runtime=createShsatRuntime(args);assert.equal(pools,1);assert.equal(typeof runtime.bookingHandler,'function');assert.equal(typeof runtime.reconcile,'function');assert.equal(typeof runtime.retryPending,'function');assert.equal(policy.bookingHandler,null);
 assert.throws(()=>createBookingRecovery({store:{},delivery:{},lookup:async()=>null}),/recovery_binding_required/);
});


test('release recovery: one durable-store failure does not starve unrelated pending deliveries',async()=>{
 const store={dueRelays:async()=>['bad','good'],claimRelay:async id=>{if(id==='bad')throw new Error('synthetic encrypted record failure');return{payload};},finishRelay:async(_job,ok)=>ok};
 let sends=0;const delivery=createRelayDelivery({store,send:async()=>{sends++;return true;}});
 assert.deepEqual(await delivery.retryPending(),{checked:2,delivered:1});assert.equal(sends,1);
});
