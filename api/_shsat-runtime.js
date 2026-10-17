'use strict';
const {Pool,Client}=require('pg');
const {checkServerIdentity}=require('node:tls');
const {isIP}=require('node:net');
const {createStore}=require('./_shsat-store');
const {createRelayDelivery,createSiteBookingSender,createBookingRecovery}=require('./_shsat-relay');
const {createQuestionnaireBooking}=require('./_shsat-questionnaire');
const R=require('./_shsat-request');

// Managed database bindings require DNS certificate identities. Reject IP
// literals and legacy numeric-IP aliases even when supplied via a host query.
function dnsDatabaseHost(host) {
  if(typeof host!=='string' || !host || isIP(host))return false;
  const name=host.endsWith('.')?host.slice(0,-1):host;
  if(name.length>253 || !name.split('.').every(label=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label)))return false;
  try{return !isIP(new URL('http://'+name).hostname);}catch(_){return false;}
}

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
  if(!negotiated || typeof negotiated!=='object' || !dnsDatabaseHost(client.host))throw new Error();
  const ssl=/** @type {import('node:tls').ConnectionOptions} */ (negotiated);
  if(ssl.rejectUnauthorized===false || (ssl.checkServerIdentity && ssl.checkServerIdentity!==checkServerIdentity))throw new Error();
  const databaseHost=client.host;
  // Bind verification to the effective endpoint, never a TLS callback/default
  // host that could differ from the database we intend to authenticate.
  const checkDatabaseIdentity=(_serverName,cert)=>checkServerIdentity(databaseHost,cert);
  const verifiedSSL={...ssl,rejectUnauthorized:true,servername:databaseHost,checkServerIdentity:checkDatabaseIdentity};
  // pg hides client-key material from logging; preserve that non-enumerability.
  if(ssl.key!==undefined)Object.defineProperty(verifiedSSL,'key',{value:ssl.key,enumerable:false});
  for(const name of seen)url.searchParams.delete(name);
  const config={connectionString:url.toString(),ssl:verifiedSSL,max:2,connectionTimeoutMillis:2000,idleTimeoutMillis:10000};
  const effective=new Client(config);
  const effectiveSSL=/** @type {import('node:tls').ConnectionOptions} */ (/** @type {unknown} */ (effective.ssl));
  if(!effectiveSSL || effectiveSSL.rejectUnauthorized!==true || effectiveSSL.checkServerIdentity!==checkDatabaseIdentity || effectiveSSL.servername!==databaseHost || effective.host!==databaseHost || !dnsDatabaseHost(effective.host))throw new Error();
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
