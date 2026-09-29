/* POST /api/quiz-lead: the /shsat/quiz gate (spec 5.3.1).
   Spec: docs/specs/2026-09-27-shsat-quiz-design.md (2.8, 2.9, 5.2, 5.3.1, 5.4)

   Phase 1 (QUIZ_BACKEND = 'site'): emails Vicente the tap-to-text alert and,
   when the page asks for it, the plan copy to the parent. Phase 2: sends the
   plan copy (delivery copy_only) and is the fallback when the platform route
   fails. The page picks delivery from its PLAN_COPY flag: alert_and_copy when
   it is on, alert_only while it is off, so the plan copy is built here but
   only sent when the page asks for it.

   GET is the deploy-gate probe: { ok, resend_configured }, never sends.
   OPTIONS is 204 with no CORS headers (same-origin only). Anything else 405.

   POST, in order: Origin, 4 KB, delivery, validation (400 with field),
   idempotency (quiz_id + delivery, 1 hour, per warm instance), honeypot,
   rate limits (counted only after a successful send), RESEND_API_KEY, the
   alert (5 s), then the plan copy (at most 4 s, inside 9 s overall). A plan
   copy failure never fails the request.

   Works on Vercel (req.body parsed) and in a plain Node server (the E2E
   harness), where the body is read from the request stream. Logs carry no
   PII: one line per request plus failure reasons.

   Env: RESEND_API_KEY (required); QUIZ_ALERT_TO, QUIZ_ALERT_FROM,
   QUIZ_PLAN_FROM, QUIZ_REPLY_TO (optional overrides); QUIZ_RESEND_URL,
   QUIZ_ALERT_DRY_RUN (tests and harness only; the dry run is ignored when
   VERCEL_ENV is production, so it can never swallow real leads). */
'use strict';

const Q = require('../shsat-quiz-logic.js');
const A = require('./_quiz-alert.js');

const MAX_BODY = 4096;
const RESEND_URL = 'https://api.resend.com/emails';
const ALERT_TIMEOUT_MS = 5000;
const COPY_TIMEOUT_MS = 4000;
const BUDGET_MS = 9000; // vercel.json maxDuration is 10 s
const HOUR = 3600000;
const DAY = 86400000;
const DELIVERIES = ['alert_and_copy', 'alert_only', 'copy_only'];

const SAVE_ERROR = "We couldn’t save that just now. Please try again.";
const RATE_ERROR = 'Too many tries in a short time. Please call or text (929) 394-0349.';

const PROD_ORIGINS = ['https://www.ivypathacademy.com', 'https://ivypathacademy.com'];
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/i;
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/i;

// ---------------------------------------------------------------------------
// In-memory state, per warm instance (best effort by design, spec 5.3.1)
// ---------------------------------------------------------------------------

function limiter(limit, windowMs) {
  const hits = new Map();
  function live(key, now) {
    const list = (hits.get(key) || []).filter((ts) => now - ts < windowMs);
    if (list.length) hits.set(key, list); else hits.delete(key);
    return list;
  }
  return {
    // A blank key (unknown IP) is never limited, so one missing header cannot lock everyone out.
    over(key, now) { return Boolean(key) && live(key, now).length >= limit; },
    hit(key, now) {
      if (!key) return;
      const list = live(key, now);
      list.push(now);
      hits.set(key, list);
      if (hits.size > 5000) for (const k of Array.from(hits.keys())) live(k, now);
    }
  };
}

const limits = {
  alertIp: limiter(5, HOUR),
  alertPhone: limiter(2, DAY),
  copyEmail: limiter(2, DAY),
  copyIp: limiter(5, HOUR)
};

const done = new Map();     // quiz_id:delivery -> { at, status, body }
const inflight = new Map(); // quiz_id:delivery -> Promise, so a double submit sends once

function stored(key, now) {
  const hit = done.get(key);
  if (!hit) return null;
  if (now - hit.at < HOUR) return hit;
  done.delete(key);
  return null;
}

function store(key, now, status, body) {
  done.set(key, { at: now, status, body });
  if (done.size > 5000) for (const k of Array.from(done.keys())) stored(k, now);
}

// ---------------------------------------------------------------------------
// Request helpers
// ---------------------------------------------------------------------------

function header(req, name) {
  const h = req && req.headers ? req.headers[name] : undefined;
  return Array.isArray(h) ? h[0] : h;
}

function originAllowed(origin, env) {
  if (origin === undefined) return true; // no Origin header: not a cross-site browser request
  if (typeof origin !== 'string') return false;
  if (PROD_ORIGINS.indexOf(origin) !== -1 || PREVIEW_ORIGIN.test(origin)) return true;
  const dev = !env.VERCEL_ENV || env.VERCEL_ENV === 'development';
  return dev && LOCAL_ORIGIN.test(origin);
}

// First x-forwarded-for entry (Vercel sets it), else the socket. '' when it is not an IP.
function clientIp(req) {
  const xff = header(req, 'x-forwarded-for');
  let ip = xff ? String(xff).split(',')[0].trim() : '';
  if (!ip) ip = String(header(req, 'x-real-ip') || (req.socket && req.socket.remoteAddress) || '').trim();
  return /^[0-9a-f:.]{2,45}$/i.test(ip) ? ip : '';
}

const TOO_LARGE = { tooLarge: true };
const INVALID = { invalid: true };

function readStream(req) {
  return new Promise((resolve) => {
    // On Vercel, a missing or unknown Content-Type leaves req.body undefined after the platform
    // has already read the stream; waiting for 'end' again would hang until the function times out.
    if (!req || typeof req.on !== 'function' || req.readableEnded) return resolve(INVALID);
    const chunks = [];
    let size = 0;
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
    req.on('data', (c) => {
      if (settled) return; // keep draining, ignore the rest
      const buf = Buffer.isBuffer(c) ? c : Buffer.from(String(c));
      size += buf.length;
      if (size > MAX_BODY) return finish(TOO_LARGE);
      chunks.push(buf);
    });
    req.on('end', () => finish(Buffer.concat(chunks)));
    req.on('error', () => finish(INVALID));
  });
}

// The parsed JSON value, TOO_LARGE or INVALID.
async function readBody(req) {
  const declared = Number(header(req, 'content-length'));
  if (declared > MAX_BODY) return TOO_LARGE;
  let raw;
  try {
    raw = req.body; // Vercel parses it lazily and throws on invalid JSON
  } catch (e) {
    return INVALID;
  }
  if (raw === undefined) raw = await readStream(req);
  if (raw === TOO_LARGE || raw === INVALID) return raw;
  let size;
  if (Buffer.isBuffer(raw)) size = raw.length;
  else if (typeof raw === 'string') size = Buffer.byteLength(raw);
  else {
    try { size = Buffer.byteLength(JSON.stringify(raw) || ''); } catch (e) { return INVALID; }
  }
  if (size > MAX_BODY) return TOO_LARGE;
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return INVALID; }
  }
  return raw === null ? INVALID : raw;
}

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------

// { ok, why }. Success is a 2xx with an id. The timeout also covers reading the response,
// and a race makes sure a fetch that ignores the abort signal cannot hang the function.
async function sendEmail(kind, payload, timeoutMs, ctx) {
  if (ctx.dryRun) {
    console.log('quiz-lead: dry run, would send ' + kind + ' ' + ctx.quizId);
    return { ok: true };
  }
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      if (ctrl) ctrl.abort();
      resolve({ ok: false, why: 'timeout' });
    }, timeoutMs);
  });
  const attempt = (async () => {
    try {
      const r = await fetch(ctx.env.QUIZ_RESEND_URL || RESEND_URL, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + ctx.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl ? ctrl.signal : undefined
      });
      let data = null;
      try { data = JSON.parse(await r.text()); } catch (e) { data = null; }
      const two = r.status >= 200 && r.status < 300;
      if (two && data && typeof data.id === 'string' && data.id) return { ok: true };
      return { ok: false, why: two ? 'no id' : 'HTTP ' + r.status };
    } catch (e) {
      return { ok: false, why: e && e.name === 'AbortError' ? 'timeout' : 'network' };
    }
  })();
  try {
    return await Promise.race([attempt, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

module.exports = async function quizLead(req, res) {
  const started = Date.now();
  const receivedAt = new Date(started);
  const env = process.env;
  const log = { quizId: '-', delivery: '-', backend: '-' };

  const reply = (status, body) => {
    res.statusCode = status;
    res.setHeader('Cache-Control', 'no-store');
    if (body === null) res.end();
    else {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    }
    console.log('quiz-lead ' + status + ' ' + log.quizId + ' delivery=' + log.delivery + ' backend=' + log.backend);
  };

  let flight = null; // { key, release } while this request owns quiz_id + delivery
  try {
    const method = String(req.method || '').toUpperCase();
    if (method === 'GET') return reply(200, { ok: true, resend_configured: Boolean(env.RESEND_API_KEY) });
    if (method === 'OPTIONS') return reply(204, null);
    if (method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return reply(405, { ok: false });
    }
    if (!originAllowed(header(req, 'origin'), env)) return reply(403, { ok: false });

    // 1. Size
    const body = await readBody(req);
    if (body === TOO_LARGE) return reply(413, { ok: false });
    if (body === INVALID || typeof body !== 'object' || Array.isArray(body)) {
      return reply(400, { ok: false, error: Q.ERRORS.generic });
    }
    if (Q.isUuid(body.quiz_id)) log.quizId = body.quiz_id.toLowerCase();

    // 2. Delivery
    const delivery = body.delivery === undefined || body.delivery === null ? 'alert_and_copy' : body.delivery;
    if (DELIVERIES.indexOf(delivery) === -1) return reply(400, { ok: false, error: Q.ERRORS.generic });
    log.delivery = delivery;

    // 3. Validation. It also applies step 8, the attribution allowlist (the platform's
    // ATTRIBUTION_KEYS, strings only, control characters stripped, 300 characters).
    const checked = Q.validateQuizPayload(body);
    if (!checked.ok) {
      return reply(400, checked.field ? { ok: false, field: checked.field, error: checked.error } : { ok: false, error: checked.error });
    }
    const value = checked.value;
    log.backend = value.fallback_reason ? 'site_fallback' : 'site';

    // 4. Idempotency. A repeat returns the stored response, sends nothing and counts toward no limit.
    const key = value.quiz_id + ':' + delivery;
    while (inflight.has(key)) await inflight.get(key);
    const prior = stored(key, Date.now());
    if (prior) return reply(prior.status, prior.body);
    flight = { key, release: null };
    inflight.set(key, new Promise((resolve) => { flight.release = resolve; }));

    // 5. Honeypot: a lost parent costs more than bot noise, so the alert still goes out, flagged.
    const honeypot = A.isHoneypot(value);
    const wantsAlert = delivery !== 'copy_only';
    let wantsCopy = delivery !== 'alert_only' && !honeypot;
    if (honeypot && !wantsAlert) {
      const result = { ok: true, plan_emailed: false };
      store(key, Date.now(), 200, result);
      return reply(200, result);
    }

    // 6. Rate limits. With an alert, a copy over its limit is skipped rather than losing the lead.
    const ip = clientIp(req);
    const now = Date.now();
    if (wantsAlert && (limits.alertIp.over(ip, now) || limits.alertPhone.over(value.phone, now))) {
      return reply(429, { ok: false, error: RATE_ERROR });
    }
    let copyNote = null;
    if (wantsCopy && (limits.copyEmail.over(value.parent_email, now) || limits.copyIp.over(ip, now))) {
      if (!wantsAlert) return reply(429, { ok: false, error: RATE_ERROR });
      wantsCopy = false;
      copyNote = 'no';
    }

    // 7. Key, or the dry run (never in production).
    const dryRun = env.QUIZ_ALERT_DRY_RUN === '1' && env.VERCEL_ENV !== 'production';
    if (!dryRun && !env.RESEND_API_KEY) {
      console.error('quiz-lead: RESEND_API_KEY missing');
      return reply(503, { ok: false, error: SAVE_ERROR });
    }
    const ctx = { env, dryRun, quizId: log.quizId };

    // 9. Alert
    if (wantsAlert) {
      const mail = A.buildAlertEmail(value, {
        receivedAt,
        ip,
        userAgent: header(req, 'user-agent'),
        planCopy: copyNote || undefined
      });
      const sent = await sendEmail('alert', {
        from: env.QUIZ_ALERT_FROM || A.ALERT_FROM,
        to: A.alertRecipients(env.QUIZ_ALERT_TO),
        reply_to: value.parent_email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text
      }, ALERT_TIMEOUT_MS, ctx);
      if (!sent.ok) {
        console.error('quiz-lead: alert send failed (' + sent.why + ') ' + log.quizId);
        return reply(502, { ok: false, error: SAVE_ERROR });
      }
      const t = Date.now();
      limits.alertIp.hit(ip, t);
      limits.alertPhone.hit(value.phone, t);
    }

    // 10. Plan copy: the quiz answers only, so no user-supplied text reaches the parent's inbox.
    let planEmailed = false;
    if (wantsCopy) {
      const budget = Math.min(COPY_TIMEOUT_MS, BUDGET_MS - (Date.now() - started));
      let mail = null;
      try {
        mail = A.buildPlanEmail({
          role: 'parent', grade: value.student_grade, targets: value.quiz.targets, prep: value.quiz.prep,
          practice_test: value.quiz.practice_test, worry: value.quiz.worry
        }, Q.todayNY(receivedAt));
      } catch (e) {
        console.error('quiz-lead: plan copy not built (' + (e && e.name ? e.name : 'Error') + ') ' + log.quizId);
      }
      if (mail && budget > 0) {
        const sent = await sendEmail('plan copy', {
          from: env.QUIZ_PLAN_FROM || A.PLAN_FROM,
          to: [value.parent_email],
          reply_to: env.QUIZ_REPLY_TO || A.PLAN_REPLY_TO,
          subject: mail.subject,
          html: mail.html,
          text: mail.text
        }, budget, ctx);
        if (sent.ok) {
          planEmailed = true;
          const t = Date.now();
          limits.copyEmail.hit(value.parent_email, t);
          limits.copyIp.hit(ip, t);
        } else {
          console.error('quiz-lead: plan copy failed (' + sent.why + ') ' + log.quizId);
        }
      } else if (mail) {
        console.error('quiz-lead: plan copy skipped (no time left) ' + log.quizId);
      }
    }

    const result = { ok: true, plan_emailed: planEmailed };
    // Store only when something went out; a copy_only whose copy failed may be retried.
    if (wantsAlert || planEmailed) store(key, Date.now(), 200, result);
    return reply(200, result);
  } catch (err) {
    // Name only: a message could quote request data.
    console.error('quiz-lead: unexpected error (' + (err && err.name ? err.name : 'Error') + ') ' + log.quizId);
    if (!res.writableEnded && !res.ended) return reply(500, { ok: false, error: SAVE_ERROR });
  } finally {
    if (flight) {
      inflight.delete(flight.key);
      flight.release();
    }
  }
};
