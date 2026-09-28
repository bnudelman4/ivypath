// Step 1 of book.html (name, email, mobile) -> platform POST /api/bookings/site-started.
// A parent who types a mobile and stops at the time picker used to leave no trace:
// nothing reached a server until a slot was booked. The platform stores the contact
// (deduped by phone) and, if no booking follows within 60 minutes, sends Vicente one
// ops alert with a tap-to-call link. It never messages the family automatically.
//
// Fire-and-forget for the page: the browser always gets 204 (405 for non-POST), so a
// platform outage can never slow down or break the booking flow. The platform's
// answer only shows up in this function's logs.

const RELAY_URL = 'https://app.ivypathacademy.com/api/bookings/site-started';
const MAX_BODY = 4096;
const HEARD_FROM = ['google', 'instagram', 'tiktok', 'youtube', 'facebook', 'friend', 'classmate', 'school', 'community_program', 'parent_group', 'event', 'other'];
const ATTR_KEYS = ['gclid', 'wbraid', 'gbraid', 'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'landing', 'page', 'first_landing', 'first_referrer', 'ref'];
const PAGES = ['/book.html', '/cn-book.html'];

// Only our own pages post here (production, www, and Vercel previews).
function allowedOrigin(origin) {
  if (!origin) return true; // same-origin fetches may omit it
  try {
    const h = new URL(origin).hostname;
    return h === 'ivypathacademy.com' || h === 'www.ivypathacademy.com' || h.endsWith('.vercel.app') || h === 'localhost';
  } catch (e) {
    return false;
  }
}

// 10-digit US number (11 with a leading 1), area code and exchange 2-9 -> +1XXXXXXXXXX.
// A number typed with a non-US country code (+44 ..., +92 ...) is rejected rather than
// misread as a US number.
function usPhone(raw) {
  const s = String(raw || '').trim();
  if (/^\+/.test(s) && !/^\+\s*1/.test(s)) return '';
  if (/^00/.test(s)) return '';
  let d = s.replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length !== 10 || !/[2-9]/.test(d[0]) || !/[2-9]/.test(d[3])) return '';
  return '+1' + d;
}

// One line, no control or bidi characters (they reach an ops alert), length-capped.
function clean(v, max) {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function buildPayload(body) {
  const name = clean(body.name, 120);
  const email = clean(body.email, 1000);
  if (email.length > 200) return null;
  const phone = usPhone(body.phone);
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone) return null;

  const exam = body.exam === 'shsat' || body.exam === 'sat' ? body.exam : '';
  const page = PAGES.includes(body.page) ? body.page : '/book.html';
  const heard_from = HEARD_FROM.includes(body.heard_from) ? body.heard_from : '';
  const attribution = {};
  if (body.attribution && typeof body.attribution === 'object') {
    for (const k of ATTR_KEYS) {
      const v = clean(body.attribution[k], 200);
      if (v) attribution[k] = v;
    }
  }
  return {
    name,
    email,
    phone,
    exam,
    page,
    heard_from,
    attribution,
    // Preview and local deployments relay to the production platform too, and the
    // ivp_notrack cookie can't be set on *.vercel.app, so anything outside production
    // is always a test.
    test: body.test === true || process.env.VERCEL_ENV !== 'production',
    client_ts: clean(body.client_ts, 40),
  };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }
  try {
    if (!allowedOrigin(req.headers.origin)) return res.status(204).end();
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    if (JSON.stringify(body).length > MAX_BODY) return res.status(204).end();

    const payload = buildPayload(body);
    const secret = process.env.SITE_BOOKING_RELAY_SECRET;
    if (!payload) return res.status(204).end();
    if (!secret) {
      console.warn('booking-started: SITE_BOOKING_RELAY_SECRET is not set; step-1 contact dropped');
      return res.status(204).end();
    }
    const json = JSON.stringify(payload);
    // The platform caps the payload at 4096 UTF-8 bytes.
    if (Buffer.byteLength(json) > MAX_BODY) return res.status(204).end();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    try {
      const r = await fetch(RELAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + secret },
        body: json,
        signal: ctrl.signal,
      });
      if (!r.ok) console.error('booking-started relay: platform answered', r.status);
    } catch (e) {
      console.error('booking-started relay failed:', e && e.name === 'AbortError' ? 'timeout' : (e && e.message));
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.error('booking-started error:', e && e.message);
  }
  return res.status(204).end();
};

module.exports.usPhone = usPhone;
module.exports.buildPayload = buildPayload;
