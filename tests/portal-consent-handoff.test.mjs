import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../oauth/consent.js',import.meta.url));
const {portalConsentHandoff}=await import('data:text/javascript;base64,'+source.toString('base64'));
test('forwards only the exact request ID to the fixed verified portal route',()=>{
 const result=new URL(portalConsentHandoff('https://www.ivypathacademy.com/oauth/consent.html?authorization_id=request_123&code=private-code&state=opaque&access_token=secret&redirect_uri=https://evil.example#fragment'));
 assert.equal(result.origin,'https://app.ivypathacademy.com');assert.equal(result.pathname,'/oauth/consent');assert.equal(result.search,'?authorization_id=request_123');assert.equal(result.hash,'');
});
test('missing, duplicate, overlong or malformed IDs fail closed',()=>{
 for(const query of ['', '?authorization_id=', '?authorization_id=a&authorization_id=b', '?authorization_id='+ 'a'.repeat(129), '?authorization_id=id%2Fother', '?authorization_id=id%00', '?authorization_id=%3Cscript%3E'])assert.throws(()=>portalConsentHandoff('https://www.ivypathacademy.com/oauth/consent.html'+query));
});
test('the handoff page contains no credential form, auth client or grant calls',async()=>{
 const html=await readFile(new URL('../oauth/consent.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/<form|type="password"/);assert.doesNotMatch(source.toString(),/supabase|signInWithPassword|approveAuthorization|fetch\(/);
 assert.match(html,/name="referrer" content="no-referrer"/);assert.match(source.toString(),/location\.replace/);
});
