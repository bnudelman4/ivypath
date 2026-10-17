'use strict';
const {Pool}=require('pg');
const {createStore}=require('./_shsat-store');
const {createRelayDelivery,createSiteBookingSender,createBookingRecovery}=require('./_shsat-relay');
const {createQuestionnaireBooking}=require('./_shsat-questionnaire');
const R=require('./_shsat-request');

// Constructor only: deliberately NOT bound by _shsat-policy.js. Owner-reviewed
// wiring must supply existing approved values and authenticated recovery/job
// invocation AFTER SQL, live identity, proxy, independent-review/release gates.
// Importing this module creates no connection, credential or provider request.
function createShsatRuntime({env=process.env,book,lookup,poolFactory=dsn=>new Pool({connectionString:dsn,max:2,connectionTimeoutMillis:2000,idleTimeoutMillis:10000})}) {
  if(env.VERCEL!=='1' || !['production','preview'].includes(env.VERCEL_ENV) || typeof book!=='function' || typeof lookup!=='function')throw new Error('approved_server_binding_required');
  let dsn,secret;
  try {
    dsn=env.SHSAT_BOOKING_DATABASE_URL;
    const url=new URL(dsn);if(!['postgres:','postgresql:'].includes(url.protocol) || url.searchParams.get('sslmode')!=='verify-full')throw new Error();
    const encoded=env.SHSAT_BOOKING_CRYPTO_KEY_BASE64;
    secret=Buffer.from(encoded||'','base64');
    if(secret.length!==32 || secret.toString('base64')!==encoded)throw new Error();
  }catch(_){throw new Error('booking_database_and_crypto_binding_required');}
  // Validate the existing relay binding before constructing even a lazy pool.
  const send=createSiteBookingSender({secret:env.SITE_BOOKING_RELAY_SECRET});
  const pool=poolFactory(dsn),store=createStore(pool,secret);
  const delivery=createRelayDelivery({store,send});
  return {bookingHandler:createQuestionnaireBooking({store,book,delivery,clientIp:req=>R.clientIp(req,env)}),
    reconcile:createBookingRecovery({store,delivery,lookup}),retryPending:delivery.retryPending,
    close:()=>pool.end()};
}
module.exports={createShsatRuntime};
