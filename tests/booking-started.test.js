// node --test tests/booking-started.test.js
const test = require('node:test');
const assert = require('node:assert');
const handler = require('../api/booking-started.js');

function mockRes() {
  const r = { code: 0, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.end = () => r;
  return r;
}
const good = { name: 'Test Parent', email: 'parent@example.com', phone: '(917) 555-0142', exam: 'shsat', page: '/book.html', heard_from: 'google', attribution: { utm_source: 'google', gclid: 'abc', evil: 'x' }, test: true, client_ts: '2026-09-28T08:00:00Z' };

test('usPhone normalizes US numbers and rejects others', () => {
  assert.strictEqual(handler.usPhone('(917) 555-0142'), '+19175550142');
  assert.strictEqual(handler.usPhone('+1 917-555-0142'), '+19175550142');
  assert.strictEqual(handler.usPhone('+92 300 1234567'), '');
  assert.strictEqual(handler.usPhone('555-0142'), '');
  assert.strictEqual(handler.usPhone('(117) 555-0142'), '');
  assert.strictEqual(handler.usPhone('+45 3212 3456'), '');
  assert.strictEqual(handler.usPhone('+44 20 7946 0958'), '');
  assert.strictEqual(handler.usPhone('0044 20 7946 0958'), '');
  assert.strictEqual(handler.usPhone('+(1) 917 555 0142'), '+19175550142');
  assert.strictEqual(handler.usPhone('001 917 555 0142'), '+19175550142');
});

test('buildPayload allowlists fields and drops junk', () => {
  const p = handler.buildPayload({ ...good, exam: '<x>', page: '/evil', heard_from: 'nope', name: 'A\nB' });
  assert.deepStrictEqual(p.attribution, { utm_source: 'google', gclid: 'abc' });
  assert.strictEqual(p.exam, '');
  assert.strictEqual(p.page, '/book.html');
  assert.strictEqual(p.heard_from, '');
  assert.strictEqual(p.name, 'A B');
  assert.strictEqual(p.test, true);
  assert.strictEqual(handler.buildPayload({ ...good, email: 'bad' }), null);
  assert.strictEqual(handler.buildPayload({ ...good, phone: '12345' }), null);
  assert.strictEqual(handler.buildPayload({ ...good, email: 'a'.repeat(195) + '@example.com' }), null);
  assert.strictEqual(handler.buildPayload({ ...good, name: 'Ann\u202eE\u0000\tLee' }).name, 'Ann E Lee');
  assert.strictEqual(handler.buildPayload({ ...good, attribution: { ref: 'ABC123' } }).attribution.ref, 'ABC123');
});

test('test flag: forced outside production, honored from the page in production', () => {
  const prev = process.env.VERCEL_ENV;
  process.env.VERCEL_ENV = 'production';
  assert.strictEqual(handler.buildPayload({ ...good, test: false }).test, false);
  assert.strictEqual(handler.buildPayload({ ...good, test: true }).test, true);
  process.env.VERCEL_ENV = 'preview';
  assert.strictEqual(handler.buildPayload({ ...good, test: false }).test, true);
  delete process.env.VERCEL_ENV;
  assert.strictEqual(handler.buildPayload({ ...good, test: false }).test, true);
  assert.strictEqual(handler.buildPayload({ ...good, test: false }, 'www.ivypathacademy.com').test, false);
  assert.strictEqual(handler.buildPayload({ ...good, test: false }, 'ivypath-git-x.vercel.app').test, true);
  if (prev !== undefined) process.env.VERCEL_ENV = prev;
});

test('non-POST gets 405', async () => {
  const res = mockRes();
  await handler({ method: 'GET', headers: {} }, res);
  assert.strictEqual(res.code, 405);
});

test('relays a valid body with the bearer secret and returns 204', async () => {
  process.env.SITE_BOOKING_RELAY_SECRET = 's3cret';
  const calls = [];
  global.fetch = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200 }; };
  const res = mockRes();
  await handler({ method: 'POST', headers: { origin: 'https://www.ivypathacademy.com' }, body: good }, res);
  assert.strictEqual(res.code, 204);
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].url, 'https://app.ivypathacademy.com/api/bookings/site-started');
  assert.strictEqual(calls[0].opts.headers.Authorization, 'Bearer s3cret');
  const sent = JSON.parse(calls[0].opts.body);
  assert.strictEqual(sent.phone, '+19175550142');
  assert.strictEqual(sent.exam, 'shsat');
});

test('drops foreign origins, oversize bodies, invalid contacts and a missing secret (still 204, no relay)', async () => {
  const calls = [];
  global.fetch = async () => { calls.push(1); return { ok: true, status: 200 }; };
  process.env.SITE_BOOKING_RELAY_SECRET = 's3cret';
  for (const req of [
    { method: 'POST', headers: { origin: 'https://evil.example' }, body: good },
    { method: 'POST', headers: {}, body: { ...good, name: 'x'.repeat(5000) } },
    { method: 'POST', headers: {}, body: { ...good, phone: '+44 20 7946 0958' } },
  ]) {
    const res = mockRes();
    await handler(req, res);
    assert.strictEqual(res.code, 204);
  }
  delete process.env.SITE_BOOKING_RELAY_SECRET;
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: good }, res);
  assert.strictEqual(res.code, 204);
  assert.strictEqual(calls.length, 0);
});

test('a payload over 4096 UTF-8 bytes is not relayed', async () => {
  process.env.SITE_BOOKING_RELAY_SECRET = 's3cret';
  const calls = [];
  global.fetch = async () => { calls.push(1); return { ok: true, status: 200 }; };
  const attribution = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'landing', 'first_landing']) attribution[k] = '中'.repeat(200);
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: { ...good, attribution } }, res);
  assert.strictEqual(res.code, 204);
  assert.strictEqual(calls.length, 0);
});

test('a platform error or hang still returns 204 within ~2s', { timeout: 5000 }, async () => {
  process.env.SITE_BOOKING_RELAY_SECRET = 's3cret';
  global.fetch = (url, opts) => new Promise((_, rej) => opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }));
  const t0 = Date.now();
  const res = mockRes();
  await handler({ method: 'POST', headers: {}, body: good }, res);
  assert.strictEqual(res.code, 204);
  assert.ok(Date.now() - t0 < 2600);
  global.fetch = async () => ({ ok: false, status: 500 });
  const res2 = mockRes();
  await handler({ method: 'POST', headers: {}, body: good }, res2);
  assert.strictEqual(res2.code, 204);
});
