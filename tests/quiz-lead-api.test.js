/* Handler tests for api/quiz-lead.js (spec 5.3.1, 2.8, 2.9, 8.1).
   Run: npm test   (node --test tests/*.test.js; no dependencies)

   No real network. global.fetch is replaced for the whole file: calls to
   STUB_URL (a reserved .invalid host that can never resolve) go to an
   in-process stub that records each email body; one test points
   QUIZ_RESEND_URL at a loopback stub server; anything else throws. Each test
   loads a fresh copy of the handler, so the in-memory idempotency and
   rate-limit state starts empty. Console output is captured, both to keep
   the run quiet and to prove the logs carry no email, phone or name. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');

const Q = require('../shsat-quiz-logic.js');
const A = require('../api/_quiz-alert.js');
const FIXTURES = require('./fixtures/quiz-payload.json');

const HANDLER = require.resolve('../api/quiz-lead.js');
const STUB_URL = 'http://resend.stub.invalid/emails';
const t = (s) => s.replace(/'/g, '’');
const SAVE_ERROR = t("We couldn't save that just now. Please try again.");
const RATE_ERROR = 'Too many tries in a short time. Please call or text (929) 394-0349.';
const HOUR = 3600000;
const DAY = 86400000;
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';

// ---------------------------------------------------------------------------
// Network guard and stub
// ---------------------------------------------------------------------------

const realFetch = global.fetch;
let sent = [];
let responder = null;

global.fetch = async function stubFetch(url, init) {
  const u = String(url);
  if (/^http:\/\/127\.0\.0\.1:\d+\//.test(u)) return realFetch(url, init);
  if (u !== STUB_URL) throw new Error('unexpected network call: ' + u);
  const call = { url: u, method: init && init.method, headers: (init && init.headers) || {}, body: JSON.parse(init.body), signal: init && init.signal };
  sent.push(call);
  return responder(call, sent.length);
};

function okResponse(n) {
  return new Response(JSON.stringify({ id: 'email_' + (n || 1) }), { status: 200, headers: { 'content-type': 'application/json' } });
}
function status(code, body) {
  return new Response(body === undefined ? JSON.stringify({ name: 'error', message: 'stub' }) : body, { status: code, headers: { 'content-type': 'application/json' } });
}
function hang(call) {
  return new Promise((resolve, reject) => {
    if (call.signal) call.signal.addEventListener('abort', () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' })));
  });
}

// ---------------------------------------------------------------------------
// Env, console and handler loading
// ---------------------------------------------------------------------------

const ENV_KEYS = ['RESEND_API_KEY', 'QUIZ_RESEND_URL', 'QUIZ_ALERT_TO', 'QUIZ_ALERT_FROM', 'QUIZ_PLAN_FROM', 'QUIZ_REPLY_TO', 'QUIZ_ALERT_DRY_RUN', 'VERCEL_ENV'];
const savedEnv = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

let logs = [];
const savedConsole = {};
for (const k of ['log', 'info', 'warn', 'error']) {
  savedConsole[k] = console[k];
  console[k] = (...args) => { logs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')); };
}

test.beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.RESEND_API_KEY = 'test';
  process.env.QUIZ_RESEND_URL = STUB_URL;
  sent = [];
  logs = [];
  responder = (call, n) => okResponse(n);
});

test.after(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  for (const k of Object.keys(savedConsole)) console[k] = savedConsole[k];
  global.fetch = realFetch;
});

function fresh() {
  delete require.cache[HANDLER];
  return require(HANDLER);
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    text: undefined,
    ended: false,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    getHeader(k) { return this.headers[String(k).toLowerCase()]; },
    removeHeader(k) { delete this.headers[String(k).toLowerCase()]; },
    end(data) { this.ended = true; this.text = data === undefined ? '' : String(data); }
  };
}

function mockReq(o) {
  return {
    method: o.method || 'POST',
    headers: Object.assign({ 'content-type': 'application/json', 'x-forwarded-for': o.ip || '203.0.113.7, 10.0.0.1', 'user-agent': IPHONE_UA }, o.headers || {}),
    body: o.body
  };
}

async function call(handler, o) {
  o = o || {};
  const req = o.req || mockReq(o);
  const res = mockRes();
  await handler(req, res);
  assert.ok(res.ended, 'response was ended');
  let json = null;
  try { json = res.text ? JSON.parse(res.text) : null; } catch (e) { json = null; }
  return { status: res.statusCode, headers: res.headers, json, text: res.text };
}

let seq = 0;
// A valid gate body (the fixture's 5.2 example) with a fresh quiz_id, phone and email unless given.
function payload(over, unique) {
  const b = JSON.parse(JSON.stringify(FIXTURES.valid[0].body));
  b.quiz_id = crypto.randomUUID();
  if (unique !== false) {
    seq++;
    b.phone = '+1917555' + String(1000 + seq).slice(-4);
    b.parent_email = 'parent' + seq + '@example.com';
  }
  return Object.assign(b, over || {});
}

function flush() { return new Promise((r) => setImmediate(r)); }
async function waitFor(fn, what) {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await flush();
  }
  assert.fail('timed out waiting for ' + (what || 'condition'));
}

function requestLines() {
  return logs.filter((l) => /^quiz-lead \d{3} /.test(l));
}

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

test('GET is the deploy-gate probe: resend_configured true or false, and nothing is sent', async () => {
  const h = fresh();
  let r = await call(h, { method: 'GET' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, resend_configured: true });
  assert.match(r.headers['content-type'], /^application\/json/);
  assert.equal(r.headers['cache-control'], 'no-store');
  delete process.env.RESEND_API_KEY;
  r = await call(h, { method: 'GET' });
  assert.deepEqual(r.json, { ok: true, resend_configured: false });
  process.env.RESEND_API_KEY = '';
  r = await call(h, { method: 'GET' });
  assert.deepEqual(r.json, { ok: true, resend_configured: false });
  assert.equal(sent.length, 0);
});

test('OPTIONS returns 204 with no CORS headers', async () => {
  const h = fresh();
  const r = await call(h, { method: 'OPTIONS', headers: { origin: 'https://www.ivypathacademy.com', 'access-control-request-method': 'POST' } });
  assert.equal(r.status, 204);
  assert.equal(r.text, '');
  for (const k of Object.keys(r.headers)) assert.ok(!k.startsWith('access-control-'), k);
  assert.equal(sent.length, 0);
});

test('other methods return 405', async () => {
  const h = fresh();
  for (const method of ['PUT', 'PATCH', 'DELETE', 'HEAD']) {
    const r = await call(h, { method, body: payload() });
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.allow, 'GET, POST, OPTIONS', method);
    if (method !== 'HEAD') assert.deepEqual(r.json, { ok: false }, method);
  }
  assert.equal(sent.length, 0);
});

test('no response carries CORS headers', async () => {
  const h = fresh();
  const r = await call(h, { body: payload(), headers: { origin: 'https://www.ivypathacademy.com' } });
  assert.equal(r.status, 200);
  for (const k of Object.keys(r.headers)) assert.ok(!k.startsWith('access-control-'), k);
});

// ---------------------------------------------------------------------------
// Size
// ---------------------------------------------------------------------------

function sizedBody(bytes) {
  const b = payload();
  b.attribution.pad = '';
  const base = Buffer.byteLength(JSON.stringify(b));
  b.attribution.pad = 'x'.repeat(bytes - base);
  assert.equal(Buffer.byteLength(JSON.stringify(b)), bytes);
  return b;
}

test('413 for a body over 4 KB; exactly 4 KB is accepted', async () => {
  const h = fresh();
  let r = await call(h, { body: sizedBody(4097) });
  assert.equal(r.status, 413);
  assert.equal(r.json.ok, false);
  assert.equal(sent.length, 0);
  r = await call(h, { body: sizedBody(4096) });
  assert.equal(r.status, 200);
  // A declared length over the limit is refused before anything is parsed.
  r = await call(h, { body: payload(), headers: { 'content-length': '5000' } });
  assert.equal(r.status, 413);
  // A raw string body is measured in bytes.
  r = await call(h, { body: JSON.stringify(sizedBody(4097)), headers: { 'content-type': 'text/plain' } });
  assert.equal(r.status, 413);
});

// ---------------------------------------------------------------------------
// Origin
// ---------------------------------------------------------------------------

test('Origin: production, apex and vercel.app previews are allowed; anything else is 403', async () => {
  for (const origin of ['https://www.ivypathacademy.com', 'https://ivypathacademy.com', 'https://ivypath-git-feat-shsat-quiz-bnudelman4.vercel.app', undefined]) {
    const r = await call(fresh(), { body: payload(), headers: origin ? { origin } : {} });
    assert.equal(r.status, 200, String(origin));
  }
  for (const origin of ['https://evil.example', 'http://www.ivypathacademy.com', 'https://www.ivypathacademy.com.evil.example',
    'https://evil.vercel.app.evil.example', 'https://a.b.vercel.app', 'https://vercel.app', 'null', '',
    'https://localhost:3000', 'http://localhost.evil.example:3000']) {
    sent = [];
    const r = await call(fresh(), { body: payload(), headers: { origin } });
    assert.equal(r.status, 403, origin);
    assert.deepEqual(r.json, { ok: false });
    assert.equal(sent.length, 0, origin);
  }
});

test('Origin: localhost and 127.0.0.1 are allowed only when VERCEL_ENV is unset or development', async () => {
  const locals = ['http://localhost:3000', 'http://127.0.0.1:5173', 'http://localhost'];
  for (const env of [undefined, 'development']) {
    if (env) process.env.VERCEL_ENV = env; else delete process.env.VERCEL_ENV;
    for (const origin of locals) {
      const r = await call(fresh(), { body: payload(), headers: { origin } });
      assert.equal(r.status, 200, env + ' ' + origin);
    }
  }
  for (const env of ['preview', 'production']) {
    process.env.VERCEL_ENV = env;
    for (const origin of locals) {
      const r = await call(fresh(), { body: payload(), headers: { origin } });
      assert.equal(r.status, 403, env + ' ' + origin);
    }
  }
});

// ---------------------------------------------------------------------------
// Validation (400)
// ---------------------------------------------------------------------------

test('every valid fixture is accepted', async () => {
  for (const f of FIXTURES.valid) {
    sent = [];
    const r = await call(fresh(), { body: JSON.parse(JSON.stringify(f.body)) });
    assert.equal(r.status, 200, f.name);
    assert.equal(r.json.ok, true, f.name);
    const alert = sent.find((s) => s.body.subject.includes('Quiz lead'));
    if (f.body.delivery === 'copy_only') assert.equal(alert, undefined, f.name);
    else assert.ok(alert, f.name);
  }
});

test('every invalid fixture returns 400 with its field and error, and sends nothing', async () => {
  const h = fresh();
  const byField = { parent_name: [Q.ERRORS.name], phone: [Q.ERRORS.phone], parent_email: [Q.ERRORS.email, Q.ERRORS.school], consent: [Q.ERRORS.consent] };
  for (const f of FIXTURES.invalid) {
    const r = await call(h, { body: JSON.parse(JSON.stringify(f.body)) });
    assert.equal(r.status, 400, f.name);
    assert.equal(r.json.ok, false, f.name);
    if (f.field) {
      assert.equal(r.json.field, f.field, f.name);
      assert.ok(byField[f.field].includes(r.json.error), f.name + ': ' + r.json.error);
    } else {
      assert.ok(!('field' in r.json), f.name);
      assert.equal(r.json.error, Q.ERRORS.generic, f.name);
    }
  }
  assert.equal(sent.length, 0);
});

test('400: each field message, the school address and a near miss', async () => {
  const h = fresh();
  const cases = [
    [{ parent_name: 'S' }, 'parent_name', 'Please enter your name.'],
    [{ phone: '(123) 456-7890' }, 'phone', 'Please enter a 10-digit US mobile number.'],
    [{ parent_email: 'sam.rivera@' }, 'parent_email', 'Please enter a valid email address.'],
    [{ parent_email: 'sam@nycstudents.net' }, 'parent_email', t("Please use a personal or parent email. We can't deliver to @nycstudents.net school accounts.")],
    [{ parent_email: 'sam@nycstudent.net' }, 'parent_email', t("Please use a personal or parent email. We can't deliver to @nycstudents.net school accounts.")],
    [{ consent: false }, 'consent', 'Please check the box so we can follow up.'],
    [{ consent_version: 'quiz-2025-01-01' }, 'consent', 'Please check the box so we can follow up.']
  ];
  for (const [over, field, error] of cases) {
    const r = await call(h, { body: payload(over) });
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.deepEqual(r.json, { ok: false, field, error });
  }
  assert.equal(sent.length, 0);
});

test('400 without a field: bad delivery, wrong shapes, invalid JSON', async () => {
  const h = fresh();
  const generic = { ok: false, error: 'Please check your entries and try again.' };
  for (const body of [payload({ delivery: 'both' }), payload({ test_type: 'SAT' }), [], 'hello', null, 42]) {
    const r = await call(h, { body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.deepEqual(r.json, generic);
  }
  let r = await call(h, { body: '{"quiz_id": ', headers: { 'content-type': 'text/plain' } });
  assert.deepEqual([r.status, r.json], [400, generic]);
  // On Vercel, reading req.body throws on invalid JSON.
  const req = mockReq({});
  Object.defineProperty(req, 'body', { get() { throw new Error('Invalid JSON'); } });
  r = await call(h, { req });
  assert.deepEqual([r.status, r.json], [400, generic]);
  // A raw JSON string body (text/plain, as sendBeacon sends) is parsed.
  r = await call(h, { body: JSON.stringify(payload()), headers: { 'content-type': 'text/plain' } });
  assert.equal(r.status, 200);
  assert.equal(sent.length, 2);
});

test('a plain Node request stream (the E2E harness) is read and parsed; an oversized one is 413', async () => {
  const h = fresh();
  const body = Buffer.from(JSON.stringify(payload()));
  const req = Readable.from([body.subarray(0, 100), body.subarray(100)]);
  req.method = 'POST';
  req.headers = { 'content-type': 'application/json', 'x-forwarded-for': '127.0.0.1' };
  let r = await call(h, { req });
  assert.equal(r.status, 200);
  assert.equal(sent.length, 2);
  // Vercel with no or an unknown Content-Type: the stream is already consumed and req.body is undefined.
  const used = Readable.from([body]);
  used.resume();
  await new Promise((resolve) => used.on('end', resolve));
  used.method = 'POST';
  used.headers = {};
  r = await call(h, { req: used });
  assert.deepEqual([r.status, r.json], [400, { ok: false, error: Q.ERRORS.generic }]);
  const big = Readable.from([Buffer.from('{"a":"' + 'x'.repeat(5000) + '"}')]);
  big.method = 'POST';
  big.headers = { 'content-type': 'application/json' };
  r = await call(h, { req: big });
  assert.equal(r.status, 413);
});

// ---------------------------------------------------------------------------
// Happy path and Resend payloads
// ---------------------------------------------------------------------------

test('happy path: alert to the ops inboxes, then the plan copy to the parent', async (t2) => {
  t2.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-28T16:30:00Z') });
  const h = fresh();
  const body = payload({ parent_email: '  Sam.Rivera@Example.com ', phone: '(917) 555-0142' }, false);
  const r = await call(h, { body });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, plan_emailed: true });
  assert.equal(sent.length, 2);
  const [alert, copy] = sent;

  for (const s of sent) {
    assert.equal(s.url, STUB_URL);
    assert.equal(s.method, 'POST');
    assert.equal(s.headers.Authorization, 'Bearer test');
    assert.equal(s.headers['Content-Type'], 'application/json');
  }

  assert.equal(alert.body.from, 'IvyPath Alerts <hello@noreply.ivypathacademy.com>');
  assert.deepEqual(alert.body.to, ['vicentexia@gmail.com', 'ivypathacademy@gmail.com']);
  assert.equal(alert.body.reply_to, 'sam.rivera@example.com');
  assert.ok(alert.body.subject.includes('gr 8'), alert.body.subject);
  assert.ok(alert.body.subject.includes('Stuyvesant, Bronx Science'), alert.body.subject);
  assert.ok(alert.body.subject.endsWith('text now'), alert.body.subject);
  assert.ok(alert.body.subject.startsWith('[TEST?] '), 'example.com is flagged, and still sent');
  assert.ok(alert.body.html.includes('href="sms:+19175550142?&amp;body='));
  assert.ok(alert.body.text.includes('sms:+19175550142?&body='));
  assert.ok(alert.body.text.includes('tel:+19175550142'));
  assert.ok(alert.body.text.includes('\nIP: 203.0.113.7\n'), 'first x-forwarded-for entry');
  assert.ok(alert.body.text.includes('\nDevice: iPhone\n'));
  assert.ok(alert.body.text.includes('\nAgreed at: 2026-09-28 12:30 PM ET (2026-09-28T16:30:00.000Z)\n'));
  assert.ok(alert.body.text.includes('\nPlan copy emailed: yes\n'));
  assert.ok(alert.body.text.includes('\nbackend: site\n'));

  assert.equal(copy.body.from, 'IvyPath Academy <hello@noreply.ivypathacademy.com>');
  assert.match(copy.body.from, /@noreply\.ivypathacademy\.com>$/);
  assert.deepEqual(copy.body.to, ['sam.rivera@example.com']);
  assert.equal(copy.body.reply_to, 'info@ivypathacademy.com');
  const answers = { role: 'parent', grade: 8, targets: ['stuyvesant', 'bronx_science'], prep: 'self', practice_test: 'no', worry: 'timing' };
  const expected = A.buildPlanEmail(answers, '2026-09-28');
  assert.equal(copy.body.subject, expected.subject);
  assert.equal(copy.body.text, expected.text);
  assert.equal(copy.body.html, expected.html);
  const parentFacing = copy.body.subject + copy.body.html + copy.body.text;
  for (const s of ['Sam', 'Rivera', 'sam.rivera', '555-0142', '9175550142']) assert.ok(!parentFacing.includes(s), s);
});

test('the Resend payloads carry exactly from, to, reply_to, subject, html and text', async () => {
  const r = await call(fresh(), { body: payload() });
  assert.equal(r.status, 200);
  for (const s of sent) assert.deepEqual(Object.keys(s.body).sort(), ['from', 'html', 'reply_to', 'subject', 'text', 'to']);
});

test('the plan copy is built for the New York date the request arrived', async (t2) => {
  const answers = { role: 'parent', grade: 8, targets: ['stuyvesant', 'bronx_science'], prep: 'self', practice_test: 'no', worry: 'timing' };
  const cases = [
    ['2026-10-31T15:00:00Z', '2026-10-31', Q.TAKEAWAY_TEXT.T1_REG_CLOSED],
    ['2026-10-31T03:30:00Z', '2026-10-30', Q.TAKEAWAY_TEXT.T1_REG_OPEN], // 11:30 PM on Oct 30 in New York
    ['2026-11-19T15:00:00Z', '2026-11-19', 'After the fall 2026 test']
  ];
  t2.mock.timers.enable({ apis: ['Date'], now: 0 });
  for (const [iso, today, expect] of cases) {
    t2.mock.timers.setTime(Date.parse(iso));
    sent = [];
    const r = await call(fresh(), { body: payload() });
    assert.equal(r.status, 200, iso);
    assert.equal(sent[1].body.text, A.buildPlanEmail(answers, today).text, iso);
    assert.ok(sent[1].body.text.includes(expect), iso);
  }
});

test('delivery is checked before the fields (5.3.1 order)', async () => {
  const r = await call(fresh(), { body: payload({ delivery: 'both', phone: '123' }) });
  assert.deepEqual([r.status, r.json], [400, { ok: false, error: Q.ERRORS.generic }]);
});

test('env overrides: QUIZ_ALERT_TO, QUIZ_ALERT_FROM, QUIZ_PLAN_FROM, QUIZ_REPLY_TO', async () => {
  process.env.QUIZ_ALERT_TO = 'ops1@family.invalid, ops2@family.invalid';
  process.env.QUIZ_ALERT_FROM = 'Alerts <alerts@noreply.family.invalid>';
  process.env.QUIZ_PLAN_FROM = 'Plans <plans@noreply.family.invalid>';
  process.env.QUIZ_REPLY_TO = 'desk@family.invalid';
  const r = await call(fresh(), { body: payload() });
  assert.equal(r.status, 200);
  assert.deepEqual(sent[0].body.to, ['ops1@family.invalid', 'ops2@family.invalid']);
  assert.equal(sent[0].body.from, 'Alerts <alerts@noreply.family.invalid>');
  assert.equal(sent[1].body.from, 'Plans <plans@noreply.family.invalid>');
  assert.equal(sent[1].body.reply_to, 'desk@family.invalid');
});

test('delivery: alert_only sends only the alert; copy_only sends only the plan copy', async () => {
  const h = fresh();
  let r = await call(h, { body: payload({ delivery: 'alert_only' }) });
  assert.deepEqual([r.status, r.json], [200, { ok: true, plan_emailed: false }]);
  assert.equal(sent.length, 1);
  assert.ok(sent[0].body.subject.includes('Quiz lead'));
  assert.ok(sent[0].body.text.includes('\nPlan copy emailed: off\n'));
  sent = [];
  r = await call(h, { body: payload({ delivery: 'copy_only' }) });
  assert.deepEqual([r.status, r.json], [200, { ok: true, plan_emailed: true }]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body.from, A.PLAN_FROM);
  // No delivery field defaults to alert_and_copy.
  sent = [];
  const b = payload();
  delete b.delivery;
  r = await call(h, { body: b });
  assert.deepEqual([r.status, r.json], [200, { ok: true, plan_emailed: true }]);
  assert.equal(sent.length, 2);
});

test('a Phase 2 fallback body is labeled site_fallback in the alert and the log', async () => {
  const h = fresh();
  const b = payload({ fallback_reason: 'platform_503' });
  const r = await call(h, { body: b });
  assert.equal(r.status, 200);
  assert.ok(sent[0].body.text.includes('\nbackend: site_fallback (reason platform_503)\n'));
  assert.ok(requestLines().includes(`quiz-lead 200 ${b.quiz_id} delivery=alert_and_copy backend=site_fallback`), requestLines().join('\n'));
});

test('attribution: only the allowlisted keys reach the alert', async () => {
  const h = fresh();
  const b = payload();
  b.attribution = Object.assign({}, b.attribution, { evil_key: 'EVILVALUE', utm_campaign: 'fall\u0000push', utm_term: 12 });
  const r = await call(h, { body: b });
  assert.equal(r.status, 200);
  const text = sent[0].body.text;
  assert.ok(!text.includes('EVILVALUE'));
  assert.ok(text.includes('google / cpc / fallpush / none'), text);
});

// ---------------------------------------------------------------------------
// Honeypot
// ---------------------------------------------------------------------------

test('honeypot: the alert goes out with [HONEYPOT?] and no plan copy; copy_only sends nothing', async () => {
  const h = fresh();
  let r = await call(h, { body: payload({ company_name: 'Acme Corp' }) });
  assert.deepEqual([r.status, r.json], [200, { ok: true, plan_emailed: false }]);
  assert.equal(sent.length, 1);
  assert.ok(sent[0].body.subject.startsWith('[HONEYPOT?] '), sent[0].body.subject);
  assert.ok(sent[0].body.text.includes('\nPlan copy emailed: no\n'));
  sent = [];
  r = await call(h, { body: payload({ company_name: 'Acme Corp', delivery: 'alert_only' }) });
  assert.deepEqual([r.status, r.json], [200, { ok: true, plan_emailed: false }]);
  assert.equal(sent.length, 1);
  assert.ok(sent[0].body.subject.startsWith('[HONEYPOT?] '));
  sent = [];
  r = await call(h, { body: payload({ company_name: 'Acme Corp', delivery: 'copy_only' }) });
  assert.deepEqual([r.status, r.json], [200, { ok: true, plan_emailed: false }]);
  assert.equal(sent.length, 0);
  // Whitespace only is not a honeypot hit.
  r = await call(h, { body: payload({ company_name: '   ' }) });
  assert.deepEqual(r.json, { ok: true, plan_emailed: true });
  assert.ok(!sent[0].body.subject.includes('[HONEYPOT?]'));
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test('idempotency: the same quiz_id twice sends once and returns the stored response', async () => {
  const h = fresh();
  const b = payload();
  const first = await call(h, { body: b });
  assert.deepEqual(first.json, { ok: true, plan_emailed: true });
  assert.equal(sent.length, 2);
  responder = () => status(500); // a replay must not even try
  const again = await call(h, { body: JSON.parse(JSON.stringify(b)) });
  assert.deepEqual([again.status, again.json], [200, { ok: true, plan_emailed: true }]);
  assert.equal(sent.length, 2);
  // The key is quiz_id + delivery: copy_only for the same quiz is a different request.
  responder = (c, n) => okResponse(n);
  const copy = await call(h, { body: Object.assign({}, b, { delivery: 'copy_only' }) });
  assert.deepEqual(copy.json, { ok: true, plan_emailed: true });
  assert.equal(sent.length, 3);
});

test('idempotency: repeats do not count toward the limits', async () => {
  const h = fresh();
  const b = payload();
  assert.equal((await call(h, { body: b })).status, 200);
  for (let i = 0; i < 6; i++) assert.equal((await call(h, { body: b })).status, 200, 'repeat ' + i);
  for (let i = 0; i < 4; i++) assert.equal((await call(h, { body: payload() })).status, 200, 'new ' + i);
  const r = await call(h, { body: payload() });
  assert.equal(r.status, 429, 'the 6th distinct lead from one IP');
  assert.equal(sent.length, 10);
});

test('idempotency: two concurrent posts of one quiz_id send once', async () => {
  const h = fresh();
  responder = (c, n) => new Promise((resolve) => setImmediate(() => resolve(okResponse(n))));
  const b = payload();
  const [r1, r2] = await Promise.all([call(h, { body: b }), call(h, { body: JSON.parse(JSON.stringify(b)) })]);
  assert.deepEqual(r1.json, { ok: true, plan_emailed: true });
  assert.deepEqual(r2.json, { ok: true, plan_emailed: true });
  assert.equal(sent.length, 2);
});

test('idempotency: failures are not stored, and stored responses expire after an hour', async (t2) => {
  t2.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-28T16:30:00Z') });
  const h = fresh();
  const b = payload();
  responder = () => status(500);
  assert.equal((await call(h, { body: b })).status, 502);
  responder = (c, n) => okResponse(n);
  assert.equal((await call(h, { body: b })).status, 200);
  assert.equal(sent.length, 3);
  t2.mock.timers.tick(HOUR - 1);
  assert.equal((await call(h, { body: b })).status, 200);
  assert.equal(sent.length, 3, 'still stored just under an hour');
  t2.mock.timers.tick(2);
  assert.equal((await call(h, { body: b })).status, 200);
  assert.equal(sent.length, 5, 'expired after an hour, so it is handled again');
  // A copy_only whose copy failed sent nothing, so a retry may try again.
  const c = payload({ delivery: 'copy_only' });
  responder = () => status(500);
  assert.deepEqual((await call(h, { body: c })).json, { ok: true, plan_emailed: false });
  responder = (x, n) => okResponse(n);
  assert.deepEqual((await call(h, { body: c })).json, { ok: true, plan_emailed: true });
});

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------

test('rate limit: 429 on the 6th successful alert from one IP, and the window slides', async (t2) => {
  t2.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-28T16:30:00Z') });
  const h = fresh();
  for (let i = 0; i < 5; i++) assert.equal((await call(h, { body: payload() })).status, 200, 'lead ' + i);
  assert.equal(sent.length, 10);
  const r = await call(h, { body: payload() });
  assert.deepEqual([r.status, r.json], [429, { ok: false, error: RATE_ERROR }]);
  assert.equal(sent.length, 10, 'nothing sent over the limit');
  // Another IP is not affected.
  assert.equal((await call(h, { body: payload(), ip: '198.51.100.9' })).status, 200);
  t2.mock.timers.tick(HOUR);
  assert.equal((await call(h, { body: payload() })).status, 200, 'an hour later');
});

test('rate limit: a failed Resend call does not count', async () => {
  const h = fresh();
  responder = () => status(500);
  for (let i = 0; i < 3; i++) assert.equal((await call(h, { body: payload() })).status, 502);
  responder = (c, n) => okResponse(n);
  for (let i = 0; i < 5; i++) assert.equal((await call(h, { body: payload() })).status, 200, 'lead ' + i);
  assert.equal((await call(h, { body: payload() })).status, 429);
});

test('rate limit: 2 alerts a day per mobile number', async (t2) => {
  t2.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-28T16:30:00Z') });
  const h = fresh();
  const phone = '+19175550142';
  assert.equal((await call(h, { body: payload({ phone }), ip: '198.51.100.1' })).status, 200);
  assert.equal((await call(h, { body: payload({ phone: '917-555-0142' }), ip: '198.51.100.2' })).status, 200);
  const r = await call(h, { body: payload({ phone: '(917) 555-0142' }), ip: '198.51.100.3' });
  assert.deepEqual([r.status, r.json], [429, { ok: false, error: RATE_ERROR }]);
  t2.mock.timers.tick(DAY);
  assert.equal((await call(h, { body: payload({ phone }), ip: '198.51.100.4' })).status, 200, 'a day later');
});

test('rate limit: plan copies, 2 a day per recipient and 5 an hour per IP', async () => {
  const h = fresh();
  const email = 'sam.rivera@example.com';
  assert.deepEqual((await call(h, { body: payload({ parent_email: email, delivery: 'copy_only' }), ip: '198.51.100.1' })).json, { ok: true, plan_emailed: true });
  assert.deepEqual((await call(h, { body: payload({ parent_email: 'SAM.RIVERA@example.com', delivery: 'copy_only' }), ip: '198.51.100.2' })).json, { ok: true, plan_emailed: true });
  let r = await call(h, { body: payload({ parent_email: email, delivery: 'copy_only' }), ip: '198.51.100.3' });
  assert.deepEqual([r.status, r.json], [429, { ok: false, error: RATE_ERROR }]);
  assert.equal(sent.length, 2);
  // With an alert, the lead still goes through: the alert is sent, the copy is skipped.
  r = await call(h, { body: payload({ parent_email: email }), ip: '198.51.100.4' });
  assert.deepEqual([r.status, r.json], [200, { ok: true, plan_emailed: false }]);
  assert.equal(sent.length, 3);
  assert.ok(sent[2].body.subject.includes('Quiz lead'));
  assert.ok(sent[2].body.text.includes('\nPlan copy emailed: no\n'));

  const h2 = fresh();
  sent = [];
  for (let i = 0; i < 5; i++) assert.equal((await call(h2, { body: payload({ delivery: 'copy_only' }), ip: '192.0.2.50' })).status, 200);
  r = await call(h2, { body: payload({ delivery: 'copy_only' }), ip: '192.0.2.50' });
  assert.equal(r.status, 429);
  assert.equal(sent.length, 5);
});

test('rate limit: honeypot alerts count too, so a bot cannot flood the inbox', async () => {
  const h = fresh();
  for (let i = 0; i < 5; i++) assert.equal((await call(h, { body: payload({ company_name: 'Acme' }) })).status, 200);
  const r = await call(h, { body: payload({ company_name: 'Acme' }) });
  assert.equal(r.status, 429);
  assert.equal(sent.length, 5);
});

// ---------------------------------------------------------------------------
// Missing key, dry run
// ---------------------------------------------------------------------------

test('a missing RESEND_API_KEY returns 503 and logs it; nothing is sent', async () => {
  delete process.env.RESEND_API_KEY;
  const h = fresh();
  for (const delivery of ['alert_and_copy', 'alert_only', 'copy_only']) {
    const r = await call(h, { body: payload({ delivery }) });
    assert.deepEqual([r.status, r.json], [503, { ok: false, error: SAVE_ERROR }], delivery);
  }
  assert.ok(logs.includes('quiz-lead: RESEND_API_KEY missing'), logs.join('\n'));
  assert.equal(sent.length, 0);
});

test('QUIZ_ALERT_DRY_RUN=1 sends nothing and returns ok, but never in production', async () => {
  delete process.env.RESEND_API_KEY;
  process.env.QUIZ_ALERT_DRY_RUN = '1';
  const h = fresh();
  let r = await call(h, { body: payload() });
  assert.deepEqual([r.status, r.json], [200, { ok: true, plan_emailed: true }]);
  r = await call(h, { body: payload({ delivery: 'alert_only' }) });
  assert.deepEqual([r.status, r.json], [200, { ok: true, plan_emailed: false }]);
  assert.equal(sent.length, 0);
  assert.ok(logs.some((l) => /^quiz-lead: dry run, would send alert /.test(l)), logs.join('\n'));
  assert.ok(logs.some((l) => /^quiz-lead: dry run, would send plan copy /.test(l)), logs.join('\n'));
  process.env.VERCEL_ENV = 'production';
  r = await call(fresh(), { body: payload() });
  assert.equal(r.status, 503);
});

// ---------------------------------------------------------------------------
// Resend failures (502, no plan copy)
// ---------------------------------------------------------------------------

test('Resend 500, 422, a 2xx without id, a non-JSON 2xx or a network error: 502 and no plan copy', async () => {
  const outcomes = [
    () => status(500),
    () => status(422),
    () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }),
    () => new Response('{"id":""}', { status: 200 }),
    () => new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } }),
    () => { throw new TypeError('fetch failed'); }
  ];
  for (const o of outcomes) {
    sent = [];
    responder = o;
    const r = await call(fresh(), { body: payload() });
    assert.deepEqual([r.status, r.json], [502, { ok: false, error: SAVE_ERROR }], String(o));
    assert.equal(sent.length, 1, 'only the alert was attempted');
  }
});

test('the alert times out at 5 s: 502 and no plan copy', async (t2) => {
  t2.mock.timers.enable({ apis: ['setTimeout'] });
  const h = fresh();
  responder = hang;
  let done = false;
  const p = call(h, { body: payload() }).then((r) => { done = true; return r; });
  await waitFor(() => sent.length === 1, 'the alert request');
  t2.mock.timers.tick(4999);
  await flush(); await flush();
  assert.equal(done, false, 'still waiting at 4.999 s');
  t2.mock.timers.tick(1);
  const r = await p;
  assert.deepEqual([r.status, r.json], [502, { ok: false, error: SAVE_ERROR }]);
  assert.equal(sent.length, 1);
});

test('a stub that ignores the abort signal still times out', async (t2) => {
  t2.mock.timers.enable({ apis: ['setTimeout'] });
  const h = fresh();
  responder = () => new Promise(() => {});
  const p = call(h, { body: payload() });
  await waitFor(() => sent.length === 1);
  t2.mock.timers.tick(5000);
  assert.equal((await p).status, 502);
});

// ---------------------------------------------------------------------------
// Plan copy failures (200, plan_emailed false)
// ---------------------------------------------------------------------------

test('a plan copy failure returns 200 with plan_emailed false', async () => {
  const h = fresh();
  responder = (c, n) => (n === 1 ? okResponse(n) : status(500));
  const r = await call(h, { body: payload() });
  assert.deepEqual([r.status, r.json], [200, { ok: true, plan_emailed: false }]);
  assert.equal(sent.length, 2);
  assert.ok(logs.some((l) => /^quiz-lead: plan copy failed/.test(l)), logs.join('\n'));
});

test('a plan copy that cannot be built still returns 200 once the alert is out', async () => {
  const orig = A.buildPlanEmail;
  A.buildPlanEmail = () => { throw new TypeError('boom sam.rivera@example.com'); };
  try {
    const h = fresh();
    const b = payload();
    const r = await call(h, { body: b });
    assert.deepEqual([r.status, r.json], [200, { ok: true, plan_emailed: false }]);
    assert.equal(sent.length, 1);
    // Stored, so a retry does not send a second alert.
    assert.deepEqual((await call(h, { body: b })).json, { ok: true, plan_emailed: false });
    assert.equal(sent.length, 1);
  } finally {
    A.buildPlanEmail = orig;
  }
  assert.ok(logs.some((l) => /^quiz-lead: plan copy not built \(TypeError\)/.test(l)), logs.join('\n'));
  assert.ok(!logs.join('\n').includes('sam.rivera'));
});

test('an unexpected error before any send returns 500 and logs no request data', async () => {
  const orig = A.buildAlertEmail;
  A.buildAlertEmail = () => { throw new Error('boom Sam Rivera +19175550142'); };
  try {
    const r = await call(fresh(), { body: payload() });
    assert.deepEqual([r.status, r.json], [500, { ok: false, error: SAVE_ERROR }]);
    assert.equal(sent.length, 0);
  } finally {
    A.buildAlertEmail = orig;
  }
  const all = logs.join('\n');
  assert.ok(/quiz-lead: unexpected error \(Error\)/.test(all), all);
  assert.ok(!all.includes('Rivera') && !all.includes('9175550142'), all);
});

test('the plan copy times out at 4 s', async (t2) => {
  t2.mock.timers.enable({ apis: ['setTimeout'] });
  const h = fresh();
  responder = (c, n) => (n === 1 ? okResponse(n) : hang(c));
  let done = false;
  const p = call(h, { body: payload() }).then((r) => { done = true; return r; });
  await waitFor(() => sent.length === 2, 'the plan copy request');
  t2.mock.timers.tick(3999);
  await flush(); await flush();
  assert.equal(done, false, 'still waiting at 3.999 s');
  t2.mock.timers.tick(1);
  const r = await p;
  assert.deepEqual([r.status, r.json], [200, { ok: true, plan_emailed: false }]);
});

test('the plan copy gets only what is left of 9 s, and is skipped when nothing is left', async (t2) => {
  t2.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse('2026-09-28T16:30:00Z') });
  // A request body that takes 6 s to arrive leaves 3 s for the copy.
  let h = fresh();
  responder = (c, n) => (n === 1 ? okResponse(n) : hang(c));
  let req = new EventEmitter();
  req.method = 'POST';
  req.headers = { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.1' };
  let done = false;
  let p = call(h, { req }).then((r) => { done = true; return r; });
  await flush();
  t2.mock.timers.tick(6000);
  req.emit('data', Buffer.from(JSON.stringify(payload())));
  req.emit('end');
  await waitFor(() => sent.length === 2, 'the plan copy request');
  t2.mock.timers.tick(2999);
  await flush(); await flush();
  assert.equal(done, false);
  t2.mock.timers.tick(1);
  assert.deepEqual((await p).json, { ok: true, plan_emailed: false });

  // 9.5 s in: the alert still goes out, the copy is skipped.
  sent = [];
  h = fresh();
  responder = (c, n) => okResponse(n);
  req = new EventEmitter();
  req.method = 'POST';
  req.headers = { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.2' };
  p = call(h, { req });
  await flush();
  t2.mock.timers.tick(9500);
  req.emit('data', Buffer.from(JSON.stringify(payload())));
  req.emit('end');
  assert.deepEqual((await p).json, { ok: true, plan_emailed: false });
  assert.equal(sent.length, 1);
});

// ---------------------------------------------------------------------------
// Real fetch through QUIZ_RESEND_URL (loopback stub server)
// ---------------------------------------------------------------------------

test('QUIZ_RESEND_URL points the real fetch at a local stub', async (t2) => {
  const received = [];
  const server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      received.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(data) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ id: 'loop_' + received.length }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t2.after(() => new Promise((r) => server.close(r)));
  process.env.QUIZ_RESEND_URL = 'http://127.0.0.1:' + server.address().port + '/emails';
  const r = await call(fresh(), { body: payload() });
  assert.deepEqual([r.status, r.json], [200, { ok: true, plan_emailed: true }]);
  assert.equal(received.length, 2);
  assert.equal(received[0].path, '/emails');
  assert.equal(received[0].auth, 'Bearer test');
  assert.equal(received[0].body.from, A.ALERT_FROM);
  assert.equal(received[1].body.from, A.PLAN_FROM);
  assert.equal(sent.length, 0, 'the in-process stub was not used');
});

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

test('logs: one line per request in the 5.3.1 format', async () => {
  const h = fresh();
  const b = payload();
  await call(h, { body: b });
  await call(h, { method: 'GET' });
  await call(h, { body: payload({ phone: '123' }) });
  const lines = requestLines();
  assert.deepEqual(lines, [
    `quiz-lead 200 ${b.quiz_id} delivery=alert_and_copy backend=site`,
    'quiz-lead 200 - delivery=- backend=-',
    lines[2]
  ]);
  assert.match(lines[2], /^quiz-lead 400 [0-9a-f-]{36} delivery=alert_and_copy backend=-$/);
  // A quiz_id that is not a UUID is never logged (it could be anything the client sent).
  logs = [];
  await call(h, { body: payload({ quiz_id: 'sam.rivera@example.com' }) });
  assert.deepEqual(requestLines(), ['quiz-lead 400 - delivery=alert_and_copy backend=-']);
});

test('logs never contain an email, phone or name', async (t2) => {
  t2.mock.timers.enable({ apis: ['setTimeout'] });
  const name = 'Sam Rivera';
  const email = 'sam.rivera@example.com';
  const phone = '+19175550142';
  const mk = (over) => payload(Object.assign({ parent_name: name, parent_email: email, phone }, over), false);
  let h = fresh();
  await call(h, { body: mk() });                                    // 200
  await call(h, { body: mk() });                                    // 200 (phone limit reached)
  await call(h, { body: mk(), ip: '198.51.100.8' });                // 429
  await call(h, { body: mk({ parent_name: 'S' }) });                // 400
  await call(h, { body: mk({ parent_email: 'sam@nycstudents.net' }) });
  await call(h, { body: mk({ quiz_id: email }) });                  // 400, quiz_id not logged
  h = fresh();
  sent = [];
  responder = () => status(500);
  await call(h, { body: mk() });                                    // 502
  responder = hang;
  const p = call(h, { body: mk() });
  await waitFor(() => sent.length === 2, 'the hanging alert');
  t2.mock.timers.tick(5000);
  await p;                                                          // 502 timeout
  delete process.env.RESEND_API_KEY;
  await call(fresh(), { body: mk() });                              // 503
  process.env.QUIZ_ALERT_DRY_RUN = '1';
  await call(fresh(), { body: mk() });                              // dry run
  const all = logs.join('\n');
  assert.ok(logs.length >= 10, all);
  for (const s of [email, 'sam.rivera', 'nycstudents', '9175550142', '917) 555', '555-0142', name, 'Rivera', '203.0.113.7']) {
    assert.ok(!all.includes(s), 'log leaks ' + s + ':\n' + all);
  }
});

test('the error strings a parent can see pass the 2.11 lint', async () => {
  const { lintText } = require('./helpers/copy-lint.js');
  const seen = new Set();
  let h = fresh();
  for (const over of [{ parent_name: 'S' }, { phone: '1' }, { parent_email: 'x' }, { parent_email: 'a@nycstudents.net' }, { consent: false }, { test_type: 'SAT' }]) {
    seen.add((await call(h, { body: payload(over) })).json.error);
  }
  for (let i = 0; i < 6; i++) {
    const r = await call(h, { body: payload() });
    if (r.status === 429) seen.add(r.json.error);
  }
  responder = () => status(500);
  seen.add((await call(fresh(), { body: payload() })).json.error);
  delete process.env.RESEND_API_KEY;
  seen.add((await call(fresh(), { body: payload() })).json.error);
  assert.ok(seen.has(SAVE_ERROR) && seen.has(RATE_ERROR) && seen.size === 8, [...seen].join(' | '));
  for (const s of seen) assert.deepEqual(lintText(s), [], s);
});
