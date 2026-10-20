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
 const policy=require('../api/_shsat-policy'),liveHandler=policy.bookingHandler;assert.equal(typeof liveHandler,'function');assert.equal(policy.captureHandler,null);
 const env={VERCEL:'1',VERCEL_ENV:'production',SHSAT_BOOKING_DATABASE_URL:'postgres://synthetic@db.example.invalid/booking?sslmode=verify-full',SHSAT_BOOKING_CRYPTO_KEY_BASE64:Buffer.alloc(32,7).toString('base64'),SITE_BOOKING_RELAY_SECRET:'synthetic-relay-secret'};
 let pools=0;const args={env,book:async()=>{},lookup:async()=>null,poolFactory:()=>{pools++;return{end:async()=>{}};}};
 for(const key of ['SHSAT_BOOKING_DATABASE_URL','SHSAT_BOOKING_CRYPTO_KEY_BASE64','SITE_BOOKING_RELAY_SECRET','VERCEL']){
  assert.throws(()=>createShsatRuntime({...args,env:{...env,[key]:undefined}}),e=>!e.message.includes('synthetic@') && !e.message.includes('synthetic-relay-secret'));assert.equal(pools,0);
 }
 assert.throws(()=>createShsatRuntime({...args,env:{...env,SHSAT_BOOKING_DATABASE_URL:env.SHSAT_BOOKING_DATABASE_URL.replace('verify-full','disable')}}));
 const runtime=createShsatRuntime(args);assert.equal(pools,1);assert.equal(typeof runtime.bookingHandler,'function');assert.equal(typeof runtime.reconcile,'function');assert.equal(typeof runtime.retryPending,'function');assert.equal(policy.bookingHandler,liveHandler);assert.notEqual(policy.bookingHandler,runtime.bookingHandler);
 assert.throws(()=>createBookingRecovery({store:{},delivery:{},lookup:async()=>null}),/recovery_binding_required/);
});


test('release recovery: one durable-store failure does not starve unrelated pending deliveries',async()=>{
 const store={dueRelays:async()=>['bad','good'],claimRelay:async id=>{if(id==='bad')throw new Error('synthetic encrypted record failure');return{payload};},finishRelay:async(_job,ok)=>ok};
 let sends=0;const delivery=createRelayDelivery({store,send:async()=>{sends++;return true;}});
 assert.deepEqual(await delivery.retryPending(),{checked:2,delivered:1});assert.equal(sends,1);
});

test('review TLS: locked driver uses the last duplicate sslmode, demonstrating the rejected downgrade',()=>{
 const {Client}=require('pg');
 const dsn='postgres://synthetic@db.example.invalid/booking?sslmode=verify-full';
 assert.equal(new Client({connectionString:dsn+'&sslmode=disable'}).ssl,false);
 assert.equal(new Client({connectionString:dsn+'&sslmode=no-verify'}).ssl.rejectUnauthorized,false);
});
test('review TLS: ambiguous duplicate SSL parameters fail before pool construction without leaking the DSN',()=>{
 const base='postgres://synthetic:synthetic-password@db.example.invalid/booking?';let pools=0;
 const env={VERCEL:'1',VERCEL_ENV:'production',SHSAT_BOOKING_CRYPTO_KEY_BASE64:Buffer.alloc(32,7).toString('base64'),SITE_BOOKING_RELAY_SECRET:'synthetic-relay-secret'};
 for(const query of ['sslmode=verify-full&sslmode=disable','sslmode=verify-full&sslmode=no-verify','sslmode=disable&sslmode=verify-full','sslmode=verify-full&sslmode=verify-full','sslmode=verify-full&%73slmode=no-verify','sslmode=verify-full&SSLMODE=disable','sslmode=verify-full&sslrootcert=one&sslrootcert=two','sslmode=verify-full&uselibpqcompat=false&uselibpqcompat=true','sslmode=verify-full&host=%2Ftmp%2Fsynthetic-socket','sslmode=verify-full&connectionString=postgres%3A%2F%2Fsynthetic%40db.example.invalid%2Fx%3Fsslmode%3Ddisable','sslmode=verify-full&ssl=0']){
  assert.throws(()=>createShsatRuntime({env:{...env,SHSAT_BOOKING_DATABASE_URL:base+query},book:async()=>{},lookup:async()=>null,poolFactory:()=>{pools++;return{end:async()=>{}};}}),e=>e.message==='booking_database_and_crypto_binding_required',query);
  assert.equal(pools,0);
 }
});
test('review TLS: pool receives verified effective TLS options with no connection-string SSL overrides',()=>{
 const {Client}=require('pg');let seen;
 const env={VERCEL:'1',VERCEL_ENV:'production',SHSAT_BOOKING_DATABASE_URL:'postgres://synthetic@db.example.invalid/booking?sslmode=verify-full&application_name=synthetic',SHSAT_BOOKING_CRYPTO_KEY_BASE64:Buffer.alloc(32,7).toString('base64'),SITE_BOOKING_RELAY_SECRET:'synthetic-relay-secret'};
 const old=process.env.PGSSLMODE,oldTLS=process.env.NODE_TLS_REJECT_UNAUTHORIZED;process.env.PGSSLMODE='no-verify';process.env.NODE_TLS_REJECT_UNAUTHORIZED='0';
 try{
  createShsatRuntime({env,book:async()=>{},lookup:async()=>null,poolFactory:config=>{seen=config;return{end:async()=>{}};}});
  assert.equal(typeof seen,'object');assert.equal(new URL(seen.connectionString).searchParams.has('sslmode'),false);
  const driver=new Client(seen);assert.equal(driver.ssl.rejectUnauthorized,true);assert.equal(driver.ssl.servername,'db.example.invalid');assert.equal(driver.host,'db.example.invalid');
  assert.equal(driver.ssl.checkServerIdentity('wrong.example.invalid',{subjectaltname:'DNS:db.example.invalid'}),undefined);
  assert.equal(driver.ssl.checkServerIdentity('wrong.example.invalid',{subjectaltname:'DNS:wrong.example.invalid'}).code,'ERR_TLS_CERT_ALTNAME_INVALID');
  assert.equal(driver.ssl.checkServerIdentity('db.example.invalid',{subjectaltname:'DNS:wrong.example.invalid'}).code,'ERR_TLS_CERT_ALTNAME_INVALID');
  assert.equal(driver.ssl.checkServerIdentity('db.example.invalid',{subjectaltname:'DNS:db.example.invalid'}),undefined);
  assert.equal(seen.max,2);assert.equal(seen.connectionTimeoutMillis,2000);assert.equal(seen.idleTimeoutMillis,10000);
 }finally{if(old===undefined)delete process.env.PGSSLMODE;else process.env.PGSSLMODE=old;if(oldTLS===undefined)delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;else process.env.NODE_TLS_REJECT_UNAUTHORIZED=oldTLS;}
});


test('review TLS: approved CA/client-certificate options survive URL sanitization without exposing key material',()=>{
 const fs=require('node:fs'),read=fs.readFileSync;let seen;
 const files={'synthetic-review-ca':'synthetic-ca-data','synthetic-review-cert':'synthetic-cert-data','synthetic-review-key':'synthetic-key-data'};
 fs.readFileSync=function(path,...args){if(Object.hasOwn(files,path))return Buffer.from(files[path]);return read.call(this,path,...args);};
 try{
  const env={VERCEL:'1',VERCEL_ENV:'production',SHSAT_BOOKING_DATABASE_URL:'postgres://synthetic@db.example.invalid/booking?sslmode=verify-full&sslrootcert=synthetic-review-ca&sslcert=synthetic-review-cert&sslkey=synthetic-review-key&uselibpqcompat=true',SHSAT_BOOKING_CRYPTO_KEY_BASE64:Buffer.alloc(32,7).toString('base64'),SITE_BOOKING_RELAY_SECRET:'synthetic-relay-secret'};
  createShsatRuntime({env,book:async()=>{},lookup:async()=>null,poolFactory:config=>{seen=config;return{end:async()=>{}};}});
  const ssl=new (require('pg').Client)(seen).ssl;
  assert.equal(ssl.ca,files['synthetic-review-ca']);assert.equal(ssl.cert,files['synthetic-review-cert']);assert.equal(ssl.key,files['synthetic-review-key']);assert.equal(ssl.rejectUnauthorized,true);
  assert.ok(!JSON.stringify(seen).includes(files['synthetic-review-key']));
  for(const key of ['sslmode','sslrootcert','sslcert','sslkey','uselibpqcompat'])assert.equal(new URL(seen.connectionString).searchParams.has(key),false);
 }finally{fs.readFileSync=read;}
});

test('review identity: literal IP and numeric-IP aliases cannot reach database pool construction',()=>{
 const env={VERCEL:'1',VERCEL_ENV:'production',SHSAT_BOOKING_CRYPTO_KEY_BASE64:Buffer.alloc(32,7).toString('base64'),SITE_BOOKING_RELAY_SECRET:'synthetic-relay-secret'};let pools=0;
 const hosts=['127.0.0.1','[::1]','[::ffff:127.0.0.1]','2130706433','127.1','0177.0.0.1','0x7f000001'];
 for(const host of hosts){
  const dsn='postgres://postgres@'+host+':55439/postgres?sslmode=verify-full';
  assert.throws(()=>createShsatRuntime({env:{...env,SHSAT_BOOKING_DATABASE_URL:dsn},book:async()=>{},lookup:async()=>null,poolFactory:()=>{pools++;return{end:async()=>{}};}}),e=>e.message==='booking_database_and_crypto_binding_required');
 }
 const override='postgres://synthetic@db.example.invalid/postgres?sslmode=verify-full&host=127.0.0.1';
 assert.throws(()=>createShsatRuntime({env:{...env,SHSAT_BOOKING_DATABASE_URL:override},book:async()=>{},lookup:async()=>null,poolFactory:()=>{pools++;return{end:async()=>{}};}}),/booking_database_and_crypto_binding_required/);
 assert.equal(pools,0);
});

// Real loopback TLS/Postgres fixture. Enabled only with the same explicit local
// test URL as the durable suite. Certificates/keys are ephemeral synthetic test
// material; no production connection, credential or invitation is involved.
test('review identity: real TLS trusts only the matching DNS identity and rejects IP configuration before connecting',{skip:process.env.SHSAT_TEST_DATABASE_URL!=='postgres://postgres@127.0.0.1:55439/postgres',timeout:90000},async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),dns=require('node:dns');
 const run=require('node:util').promisify(require('node:child_process').execFile);const {Pool}=require('pg');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'shsat-identity-'));const name='shsat-identity-'+process.pid+'-'+require('node:crypto').randomUUID().slice(0,8);
 const cert=path.join(dir,'server.crt'),key=path.join(dir,'server.key');const pools=[];let created=false;
 const order=dns.getDefaultResultOrder();dns.setDefaultResultOrder('ipv4first');
 try{
  await run('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost']);
  const certificate=new (require('node:crypto').X509Certificate)(fs.readFileSync(cert));
  assert.equal(certificate.subjectAltName,'DNS:localhost');assert.equal(certificate.checkIP('127.0.0.1'),undefined);
  await run('docker',['create','--pull=never','--name',name,'--publish','127.0.0.1::5432','--tmpfs','/var/lib/postgresql/data','--env','POSTGRES_HOST_AUTH_METHOD=trust','--entrypoint','sh','postgres:17-alpine','-ec',[
   'chown postgres:postgres /tmp/server.key /tmp/server.crt','chmod 600 /tmp/server.key','exec docker-entrypoint.sh postgres -c ssl=on -c ssl_cert_file=/tmp/server.crt -c ssl_key_file=/tmp/server.key'
  ].join('\n')]);created=true;
  await run('docker',['cp',key,name+':/tmp/server.key']);await run('docker',['cp',cert,name+':/tmp/server.crt']);await run('docker',['start',name]);
  const mapping=(await run('docker',['port',name,'5432/tcp'])).stdout.trim();assert.match(mapping,/^127\.0\.0\.1:\d+$/);const port=Number(mapping.split(':')[1]);
  const deadline=Date.now()+30000;let ready=false;
  while(Date.now()<deadline){try{await run('docker',['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-t','1']);ready=true;break;}catch(_){await new Promise(resolve=>setTimeout(resolve,200));}}
  assert.ok(ready,'isolated TLS fixture must be ready');
  const env={VERCEL:'1',VERCEL_ENV:'production',SHSAT_BOOKING_CRYPTO_KEY_BASE64:Buffer.alloc(32,7).toString('base64'),SITE_BOOKING_RELAY_SECRET:'synthetic-relay-secret'};
  function configure(host,trusted=true,redirectToLoopback=false){
   const url=new URL('postgres://postgres@'+host+':'+port+'/postgres?sslmode=verify-full');if(trusted)url.searchParams.set('sslrootcert',cert);
   let pool;
   const runtime=createShsatRuntime({env:{...env,SHSAT_BOOKING_DATABASE_URL:url.href},book:async()=>{},lookup:async()=>null,poolFactory:config=>{
    const options={...config};
    if(redirectToLoopback)options.stream=()=>{const socket=new net.Socket(),connect=socket.connect;socket.connect=function(){return connect.call(this,{host:'127.0.0.1',port});};return socket;};
    pool=new Pool(options);pools.push(pool);return pool;
   }});
   return {runtime,pool};
  }
  const positive=configure('localhost');assert.equal((await positive.pool.query('SELECT 1::int AS value')).rows[0].value,1);
  const mismatch=configure('wrong.example.invalid',true,true);
  await assert.rejects(mismatch.pool.query('SELECT 1'),e=>e.code==='ERR_TLS_CERT_ALTNAME_INVALID');
  const untrusted=configure('localhost',false);
  await assert.rejects(untrusted.pool.query('SELECT 1'),e=>['DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(e.code));
  const count=pools.length;assert.throws(()=>configure('127.0.0.1'),/booking_database_and_crypto_binding_required/);assert.equal(pools.length,count);
 }finally{
  await Promise.all(pools.map(p=>p.end()));dns.setDefaultResultOrder(order);
  if(created)await run('docker',['rm','--force','--volumes',name]);fs.rmSync(dir,{recursive:true,force:true});
 }
});
