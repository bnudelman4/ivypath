'use strict';
const {Pool,Client}=require('pg');
const {checkServerIdentity}=require('node:tls');
const {createStore}=require('./_shsat-store');
const {createRelayDelivery,createSiteBookingSender,createBookingRecovery}=require('./_shsat-relay');
const {createQuestionnaireBooking}=require('./_shsat-questionnaire');
const R=require('./_shsat-request');

// Match the locked driver's parsing, not URLSearchParams' first-value view.
// Resolve TLS once, remove all URL TLS overrides, and pass explicit verified
// options to the pool. Construction performs no database/network operation.
function poolConfiguration(dsn) {
  const url=new URL(dsn);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error();
  const allowed=new Set(['sslmode','sslrootcert','sslcert','sslkey','uselibpqcompat']);
  const seen=new Set();
  for(const [name] of url.searchParams){
    const normalized=name.toLowerCase();
    if(normalized==='connectionstring')throw new Error();
    if(normalized.startsWith('ssl') || normalized==='uselibpqcompat'){
      if(name!==normalized || !allowed.has(name) || seen.has(normalized))throw new Error();
      seen.add(normalized);
    }
  }
  if(url.searchParams.get('sslmode')!=='verify-full')throw new Error();
  const client=new Client({connectionString:dsn});
  const negotiated=/** @type {unknown} */ (client.ssl);
  if(!negotiated || typeof negotiated!=='object' || !client.host || client.host.startsWith('/'))throw new Error();
  const ssl=/** @type {import('node:tls').ConnectionOptions} */ (negotiated);
  if(ssl.rejectUnauthorized===false || (ssl.checkServerIdentity && ssl.checkServerIdentity!==checkServerIdentity))throw new Error();
  const verifiedSSL={...ssl,rejectUnauthorized:true,checkServerIdentity};
  // pg hides client-key material from logging; preserve that non-enumerability.
  if(ssl.key!==undefined)Object.defineProperty(verifiedSSL,'key',{value:ssl.key,enumerable:false});
  for(const name of seen)url.searchParams.delete(name);
  const config={connectionString:url.toString(),ssl:verifiedSSL,max:2,connectionTimeoutMillis:2000,idleTimeoutMillis:10000};
  const effective=new Client(config);
  const effectiveSSL=/** @type {import('node:tls').ConnectionOptions} */ (/** @type {unknown} */ (effective.ssl));
  if(!effectiveSSL || effectiveSSL.rejectUnauthorized!==true || effectiveSSL.checkServerIdentity!==checkServerIdentity || !effective.host || effective.host.startsWith('/'))throw new Error();
  return config;
}

// Constructor only: deliberately NOT bound by _shsat-policy.js. Owner-reviewed
// wiring must supply existing approved values and authenticated recovery/job
// invocation AFTER SQL, live identity, proxy, independent-review/release gates.
// Importing this module creates no connection, credential or provider request.
function createShsatRuntime({env=process.env,book,lookup,poolFactory=config=>new Pool(config)}) {
  if(env.VERCEL!=='1' || !['production','preview'].includes(env.VERCEL_ENV) || typeof book!=='function' || typeof lookup!=='function')throw new Error('approved_server_binding_required');
  let config,secret;
  try {
    config=poolConfiguration(env.SHSAT_BOOKING_DATABASE_URL);
    const encoded=env.SHSAT_BOOKING_CRYPTO_KEY_BASE64;
    secret=Buffer.from(encoded||'','base64');
    if(secret.length!==32 || secret.toString('base64')!==encoded)throw new Error();
  }catch(_){throw new Error('booking_database_and_crypto_binding_required');}
  // Validate the existing relay binding before constructing even a lazy pool.
  const send=createSiteBookingSender({secret:env.SITE_BOOKING_RELAY_SECRET});
  const pool=poolFactory(config),store=createStore(pool,secret);
  const delivery=createRelayDelivery({store,send});
  return {bookingHandler:createQuestionnaireBooking({store,book,delivery,clientIp:req=>R.clientIp(req,env)}),
    reconcile:createBookingRecovery({store,delivery,lookup}),retryPending:delivery.retryPending,
    close:()=>pool.end()};
}
module.exports={createShsatRuntime};
