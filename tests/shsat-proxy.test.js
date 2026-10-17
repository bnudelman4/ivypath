'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const R=require('../api/_shsat-request');
const vercel={VERCEL:'1',VERCEL_ENV:'production'};
test('release proxy: untrusted forwarding headers and socket fallback cannot authorize a rate identity',()=>{
 for(const env of [{},{VERCEL:'0',VERCEL_ENV:'production'},{VERCEL:'1',VERCEL_ENV:'development'}])assert.equal(R.clientIp({headers:{'x-forwarded-for':'203.0.113.7','x-real-ip':'203.0.113.7','x-vercel-forwarded-for':'203.0.113.7'},socket:{remoteAddress:'127.0.0.1'}},env),'');
});
test('release proxy: only one valid platform IP is accepted, never first-of-chain parsing',()=>{
 for(const raw of [undefined,'', ['203.0.113.7'],'203.0.113.7, 198.51.100.8','999.1.2.3','abcd','::1%lo0','[2001:db8::1]'])assert.equal(R.clientIp({headers:{'x-vercel-forwarded-for':raw,'x-forwarded-for':'203.0.113.99'}},vercel),'');
 assert.equal(R.clientIp({headers:{'x-vercel-forwarded-for':'203.0.113.7','x-forwarded-for':'198.51.100.8'}},vercel),'203.0.113.7');
 assert.equal(R.clientIp({headers:{'x-vercel-forwarded-for':'2001:0DB8:0000::0001'}},vercel),'2001:db8::1');
 assert.equal(R.clientIp({headers:{'x-vercel-forwarded-for':'::ffff:192.0.2.7'}},vercel),'192.0.2.7');
});
