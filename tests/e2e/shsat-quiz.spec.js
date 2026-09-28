/* E2E flows for /shsat/quiz (spec 8.2) and the automated part of 8.3.
   Spec: docs/specs/2026-09-27-shsat-quiz-design.md

   Harness: tests/e2e/server.js serves the repo and mounts api/quiz-lead.js
   against a local Resend stub. Here, every request that leaves 127.0.0.1 is
   stubbed or blocked (page.route below), so no test reaches Google, Meta, the
   platform or Resend:
   - app.ivypathacademy.com/api/funnel/*: per-test handlers, bodies recorded
   - googletagmanager.com: a gtag.js stand-in (gtagStub below). Every gtag()
     call stays in window.dataLayer, which an init script records, and the
     stand-in models gtag's routing as requests to the Google Ads and GA4 hosts,
     which are answered here with a 1x1 GIF and never leave the machine
   - connect.facebook.net: a recording fbevents.js that takes over fbq's queue
   - fonts, unpkg, cdnjs: empty or no-op stand-ins; everything else is aborted
   /api/book-consultation and /api/availability are stubbed per test.

   Test hooks (3.1, 5.5) come from addInitScript: __IVP_QUIZ_TODAY,
   __IVP_QUIZ_NOW_MIN and __IVP_QUIZ_FLAGS. The copy sweep and the axe runs
   switch them between reloads through sessionStorage '__e2e_hooks', read by
   the same init script. Nothing here changes the page's own launch flags.

   Not automated (8.3): the manual VoiceOver and NVDA passes. */
'use strict';

const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const Q = require('../../shsat-quiz-logic.js');
const { lintText, lintTakeawayBody } = require('../helpers/copy-lint.js');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY0 = '2026-09-28';
const IN_WINDOW = 750;              // 12:30 PM ET: inside a texting window, after 9 AM
const RENDER_GUARD_MS = 350;        // 4.3: pointer clicks within 300 ms of a render are ignored
const OPS = 'ops-e2e@example.com';  // QUIZ_ALERT_TO in the harness
const DIAG_URL = 'https://app.ivypathacademy.com/free-diagnostic-shsat/';
const BOOKING_SEND_TO = 'AW-18428932469/Qw3yCMCb7O0cEPXizNNE'; // PR #38's booking label, unchanged
const GA4_ID = 'G-EW2RB4F5JB';      // tracking.js CFG.ga4Id: every quiz event is addressed to it alone (6.2)
const PIXEL_ID = '1550873539731081';
const FIXED_ID = '3b1f0c9e-6a0e-4f2d-9d6b-2f4f7b0c1a11';
const BASE = 'http://127.0.0.1:' + (process.env.E2E_PORT || 4317); // as in playwright.config.js
const DESKTOP = 'desktop-chrome';
const SMALL = 'mobile-320';

const PARENT8 = { role: 'parent', grade: 8, targets: ['stuyvesant', 'bronx_science'], prep: 'self', practice_test: 'no', worry: 'math' };
const SCHOOL_MSG = Q.ERRORS.school; // the guard's block message is the same sentence
const SAVE_FAILED = 'We couldn’t save that just now. Please try again. If it keeps happening, call or text (929) 394-0349.';
const TOO_MANY = 'Too many tries in a short time. Please call or text (929) 394-0349.';

const ty = (s) => String(s).replace(/'/g, '’');
const straight = (s) => String(s).replace(/’/g, "'");

// ---------------------------------------------------------------------------
// Page-side scripts
// ---------------------------------------------------------------------------

// Runs before any page script on every document of the page.
function initScript(o) {
  try {
    var ov = JSON.parse(window.sessionStorage.getItem('__e2e_hooks') || 'null');
    if (ov && typeof ov === 'object') {
      if ('today' in ov) o.today = ov.today;
      if ('nowMin' in ov) o.nowMin = ov.nowMin;
      if ('flags' in ov) o.flags = ov.flags;
    }
  } catch (e) {}
  if (o.today) window.__IVP_QUIZ_TODAY = o.today;
  if (typeof o.nowMin === 'number') window.__IVP_QUIZ_NOW_MIN = o.nowMin;
  if (o.flags) window.__IVP_QUIZ_FLAGS = o.flags;

  var rec = function (kind, payload) { try { window.__e2eRecord(kind, payload); } catch (e) {} };
  var ser = function (v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return String(v); } };

  // gtag() pushes its arguments object onto dataLayer (tracking.js); gtag.js is stubbed, so every call is recorded here.
  var dl = window.dataLayer = window.dataLayer || [];
  var push = Array.prototype.push;
  dl.push = function () {
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      var list = a && typeof a === 'object' && typeof a.length === 'number' ? Array.prototype.slice.call(a) : a;
      rec('gtag', { path: location.pathname, args: ser(list) });
    }
    return push.apply(this, arguments);
  };

  // The Ads helpers tracking.js defines: record each call, then run the real one.
  ['ivypathTrackQuizLead', 'ivypathTrackBooking', 'ivypathTrackLead'].forEach(function (name) {
    var fn;
    Object.defineProperty(window, name, {
      configurable: true,
      get: function () { return fn; },
      set: function (v) {
        fn = typeof v !== 'function' ? v : function () {
          rec('ads', { path: location.pathname, name: name, args: ser(Array.prototype.slice.call(arguments)) });
          return v.apply(this, arguments);
        };
      }
    });
  });
}

// Stands in for connect.facebook.net/en_US/fbevents.js: records fbq's queue and every later call.
const FBQ_STUB = '(function(){var f=window.fbq;if(!f)return;' +
  'function send(a){try{window.__e2eRecord("fbq",{path:location.pathname,args:JSON.parse(JSON.stringify(Array.prototype.slice.call(a)))});}catch(e){}}' +
  'var q=f.queue||[];for(var i=0;i<q.length;i++)send(q[i]);f.queue=[];f.callMethod=function(){send(arguments);};})();';

// Stands in for googletagmanager.com/gtag/js. Calls stay in dataLayer (recorded by
// initScript), and gtag's routing is modeled as network requests, so a test can see
// which Google endpoint an event would reach:
// - 'config' sends a page_view to that tag.
// - 'event' goes to its send_to, or, with no send_to, to every tag configured so far,
//   the Google Ads tag included.
// - Ads hits go to googleads.g.doubleclick.net (a conversion to www.googleadservices.com),
//   GA4 hits to www.google-analytics.com, with the event name, its params, and gcs
//   (G1 + ad_storage + analytics_storage, 1 granted, 0 denied).
// Consent never stops a hit: with ad_storage denied, gtag.js still sends cookieless
// pings. The only way to keep an event from the Ads tag is not to address it there.
function gtagStub() {
  var dl = window.dataLayer = window.dataLayer || [];
  if (dl.__e2eRouted) return;
  dl.__e2eRouted = 1;
  var tags = [];
  var consent = {};
  function hit(target, name, params) {
    var parts = String(target).split('/');
    var id = parts[0];
    var url;
    if (/^AW-/.test(id)) {
      url = name === 'conversion'
        ? 'https://www.googleadservices.com/pagead/conversion/' + id.slice(3) + '/?label=' + encodeURIComponent(parts[1] || '')
        : 'https://googleads.g.doubleclick.net/pagead/viewthroughconversion/' + id.slice(3) + '/?tid=' + id;
    } else if (/^G-/.test(id)) {
      url = 'https://www.google-analytics.com/g/collect?tid=' + id;
    } else {
      return;
    }
    url += '&en=' + encodeURIComponent(name) +
      '&gcs=G1' + (consent.ad_storage === 'denied' ? '0' : '1') + (consent.analytics_storage === 'denied' ? '0' : '1');
    for (var k in params) {
      if (k === 'send_to' || !Object.prototype.hasOwnProperty.call(params, k)) continue;
      var v = params[k];
      url += '&ep.' + encodeURIComponent(k) + '=' + encodeURIComponent(typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    new Image().src = url;
  }
  function run(a) {
    if (!a || typeof a !== 'object' || typeof a.length !== 'number') return;
    if (a[0] === 'consent') {
      var c = a[2] || {};
      for (var k in c) if (Object.prototype.hasOwnProperty.call(c, k)) consent[k] = c[k];
    } else if (a[0] === 'config') {
      var id = String(a[1]);
      if (tags.indexOf(id) === -1) tags.push(id);
      if (!(a[2] && a[2].send_page_view === false)) hit(id, 'page_view', {});
    } else if (a[0] === 'event') {
      var p = a[2] || {};
      var to = p.send_to == null ? tags.slice() : [].concat(p.send_to);
      for (var i = 0; i < to.length; i++) hit(to[i], String(a[1]), p);
    }
  }
  for (var i = 0; i < dl.length; i++) run(dl[i]);
  var push = dl.push;
  dl.push = function () {
    var r = push.apply(dl, arguments);
    for (var j = 0; j < arguments.length; j++) run(arguments[j]);
    return r;
  };
}
const GTAG_STUB = '(' + gtagStub.toString() + ')();';
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const GOOGLE_HIT_HOST = /^(googleads\.g\.doubleclick\.net|www\.googleadservices\.com|www\.google-analytics\.com)$/;

// A no-op gsap for book.html's pill nav (the real one comes from cdnjs).
const GSAP_STUB = '(function(){"use strict";var p;function f(){return p;}' +
  'p=new Proxy(f,{get:function(t,k){if(k===Symbol.toPrimitive)return function(){return 0;};if(k==="then")return undefined;return p;},apply:function(){return p;},construct:function(){return p;}});' +
  'window.gsap=p;})();';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'POST, OPTIONS'
};

// ---------------------------------------------------------------------------
// Harness per test
// ---------------------------------------------------------------------------

const DEFAULT_FUNNEL = {
  'send-link': (b) => ({ status: 200, body: { ok: true, sentTo: (b && (b.student_email || b.parent_email)) || '', toParent: !(b && b.student_email) } }),
  'quiz-lead': () => ({ status: 200, body: { ok: true, lead_ref: 'lr_e2e_0123456789abcdef', diagnostic_link_allowed: true } }),
  'quiz-lead/send-link': (b) => ({ status: 200, body: { ok: true, sentTo: (b && b.student_email) || 'parent', toParent: !(b && b.student_email) } })
};

const handles = new WeakMap();

async function newPerson(page) {
  const r = await page.request.get('/__e2e/seq');
  const seq = (await r.json()).seq;
  const last4 = String(1000 + (seq % 9000));
  return {
    name: 'Sam Rivera',
    email: 'sam.rivera.e2e' + seq + '@example.com',
    typed: '(917) 555-' + last4,
    e164: '+1917555' + last4,
    digits: '917555' + last4
  };
}

async function external(route, h) {
  const req = route.request();
  let u;
  try { u = new URL(req.url()); } catch (e) { return route.abort(); }
  if (u.hostname === 'app.ivypathacademy.com' && u.pathname.indexOf('/api/funnel/') === 0) {
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const key = u.pathname.slice('/api/funnel/'.length);
    let body = null;
    try { body = JSON.parse(req.postData() || 'null'); } catch (e) { body = null; }
    h.funnel.push({ path: key, body, at: Date.now() });
    const fn = h.funnelHandlers[key];
    const out = fn ? await fn(body, h) : { status: 404, body: { ok: false } };
    if (out.hangMs) {
      await new Promise((r) => setTimeout(r, out.hangMs));
      return route.fulfill({ status: 504, headers: CORS, body: '' }).catch(() => {});
    }
    return route.fulfill({
      status: out.status,
      headers: Object.assign({ 'content-type': 'application/json' }, CORS),
      body: JSON.stringify(out.body)
    }).catch(() => {});
  }
  if (u.hostname === 'www.googletagmanager.com') {
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: GTAG_STUB });
  }
  if (GOOGLE_HIT_HOST.test(u.hostname)) return route.fulfill({ status: 200, contentType: 'image/gif', body: GIF });
  if (u.hostname === 'connect.facebook.net') return route.fulfill({ status: 200, contentType: 'text/javascript', body: FBQ_STUB });
  if (u.hostname === 'fonts.googleapis.com') return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
  if (u.hostname === 'cdnjs.cloudflare.com' && /gsap/.test(u.pathname)) {
    return route.fulfill({ status: 200, contentType: 'text/javascript', body: GSAP_STUB });
  }
  if (u.hostname === 'unpkg.com') {
    return route.fulfill({ status: 200, contentType: /\.css$/.test(u.pathname) ? 'text/css' : 'text/javascript', body: '' });
  }
  return route.abort('blockedbyclient');
}

async function setup(page, opts) {
  opts = opts || {};
  const h = {
    gtag: [], fbq: [], ads: [],
    requests: [], responses: [], consoleText: [], pageErrors: [],
    funnel: [], site: [],
    funnelHandlers: Object.assign({}, DEFAULT_FUNNEL)
  };
  handles.set(page, h);
  h.person = await newPerson(page);
  await page.exposeBinding('__e2eRecord', (_src, kind, payload) => { if (Array.isArray(h[kind])) h[kind].push(payload); });
  await page.addInitScript(initScript, {
    today: opts.today === undefined ? DAY0 : opts.today,
    nowMin: opts.nowMin === undefined ? IN_WINDOW : opts.nowMin,
    flags: opts.flags || null
  });
  page.on('request', (r) => {
    h.requests.push({ url: r.url(), method: r.method(), type: r.resourceType(), post: r.postData() || '' });
    let p = '';
    try { p = new URL(r.url()).pathname; } catch (e) {}
    if (p === '/api/quiz-lead' && r.method() === 'POST') {
      try { h.site.push(JSON.parse(r.postData() || 'null')); } catch (e) { h.site.push(null); }
    }
  });
  page.on('response', (r) => { h.responses.push({ url: r.url(), status: r.status(), type: r.request().resourceType() }); });
  page.on('console', (m) => { h.consoleText.push(m.text()); });
  page.on('pageerror', (e) => { h.pageErrors.push({ url: page.url(), message: String((e && e.message) || e) }); });
  await page.route((url) => url.hostname !== '127.0.0.1', (route) => external(route, h));
  return h;
}

// No uncaught error on the quiz page, in any flow.
test.afterEach(async ({ page }) => {
  const h = handles.get(page);
  if (!h) return;
  const onQuiz = h.pageErrors.filter((e) => /\/shsat\/quiz|\/shsat-quiz\.html/.test(e.url));
  expect(onQuiz, 'uncaught errors on /shsat/quiz').toEqual([]);
});

// ---------------------------------------------------------------------------
// Driving the quiz
// ---------------------------------------------------------------------------

// Waits until no animation is running (the 0.32 s qIn entrance), so a scan
// never sees text mid-fade.
async function quiet(page) {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => null))));
}

async function ready(page, opts) {
  const needFbq = !(opts && opts.fbq === false);
  await page.waitForFunction((f) => window.IVP_QUIZ_READY === true && (!f || !!(window.fbq && window.fbq.callMethod)), needFbq, { timeout: 10000 });
}

async function openQuiz(page, query) {
  const resp = await page.goto('/shsat/quiz' + (query || ''));
  await ready(page);
  return resp;
}

async function settle(page) { await page.waitForTimeout(RENDER_GUARD_MS); }

async function atQuestion(page, n) {
  await expect(page.locator('#scrQuestion')).toBeVisible();
  await expect(page.locator('#qStep')).toHaveText('Question ' + n + ' of 6');
}

const chip = (page, code) => page.locator('#qChoices .choice-chip[data-v="' + code + '"]');

async function pick(page, n, code) {
  await atQuestion(page, n);
  await settle(page);
  await chip(page, code).click();
}

async function pickTargets(page, targets) {
  await atQuestion(page, 3);
  await settle(page);
  for (const t of targets) await chip(page, t).click();
  await page.locator('#qContinue').click();
}

async function answerAll(page, a) {
  await page.locator('#startBtn').click();
  await pick(page, 1, 'parent');
  await pick(page, 2, String(a.grade));
  await pickTargets(page, a.targets);
  await pick(page, 4, a.prep);
  await pick(page, 5, a.practice_test);
  await pick(page, 6, a.worry);
  await expect(page.locator('#scrGate')).toBeVisible();
}

// toHaveText alone passes on a hidden element; the copy has to be on screen.
async function shows(loc, text) {
  await expect(loc).toBeVisible();
  await expect(loc).toHaveText(text);
}

async function expectPressed(page, codes) {
  await expect(page.locator('#qChoices .choice-chip[aria-pressed="true"]')).toHaveCount(codes.length);
  for (const c of codes) await expect(chip(page, c)).toHaveAttribute('aria-pressed', 'true');
}

async function fillGate(page, p) {
  await page.locator('#gName').fill(p.name);
  await page.locator('#gPhone').fill(p.typed);
  await page.locator('#gEmail').fill(p.email);
  await page.locator('#gConsent').check();
}

async function submitGate(page) { await page.locator('#gateSubmit').click(); }

async function toResults(page, h, answers) {
  await answerAll(page, answers || PARENT8);
  await fillGate(page, h.person);
  await submitGate(page);
  await expect(page.locator('#scrResults')).toBeVisible();
}

// A fresh quiz in the same tab: new person, empty session, back to the intro.
async function restart(page, h) {
  h.person = await newPerson(page);
  await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) {} });
  await openQuiz(page);
}

async function quizState(page) {
  return page.evaluate(() => JSON.parse(sessionStorage.getItem('ivp_quiz_v1') || 'null'));
}

// tel:, sms: and external links: keep tracking.js and the controller's own
// handlers, but stop the navigation (headless has no dialer, and the app is stubbed).
async function blockNavigation(page) {
  await page.evaluate(() => {
    if (window.__e2eNoNav) return;
    window.__e2eNoNav = 1;
    document.addEventListener('click', (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (a && !/^\/(?!\/)/.test(a.getAttribute('href') || '')) e.preventDefault();
    });
  });
}

// ---------------------------------------------------------------------------
// State injection (copy sweep, axe, tap targets)
// ---------------------------------------------------------------------------

function makeState(answers, step, captured, extra) {
  const t = Date.now();
  return Object.assign({
    v: 1, quiz_id: FIXED_ID, started_at: t, step, answers, band: null,
    captured: !!captured, captured_at: captured ? t : null, backend: captured ? 'site' : null,
    lead_ref: null, lead_ref_at: null, diag_allowed: null,
    plan_emailed: captured ? true : null, hp: false, fired: {}
  }, extra || {});
}

function makeHandoff(answers, band, person) {
  return {
    v: 1, quiz_id: FIXED_ID, saved_at: Date.now(), captured: true,
    name: person.name, email: person.email, phone: person.e164,
    grade: answers.grade, targets: answers.targets.slice(), prep: answers.prep,
    practice_test: answers.practice_test, worry: answers.worry, band
  };
}

// Replaces this tab's quiz session and reloads. The page must already be on the origin.
async function inject(page, o) {
  await page.evaluate((x) => {
    sessionStorage.clear();
    if (x.hooks) sessionStorage.setItem('__e2e_hooks', JSON.stringify(x.hooks));
    if (x.state) sessionStorage.setItem('ivp_quiz_v1', JSON.stringify(x.state));
    if (x.handoff) sessionStorage.setItem('ivp_quiz_handoff', JSON.stringify(x.handoff));
  }, { hooks: o.hooks || null, state: o.state || null, handoff: o.handoff || null });
  await page.reload();
  await ready(page, { fbq: false });
}

// ---------------------------------------------------------------------------
// Recorded analytics and email
// ---------------------------------------------------------------------------

// send_to is routing, not a parameter: it is split off into sendTo.
function gaEvents(h, pathname) {
  return h.gtag
    .filter((e) => Array.isArray(e.args) && e.args[0] === 'event' && (!pathname || e.path === pathname))
    .map((e) => {
      const params = Object.assign({}, e.args[2] || {});
      const sendTo = params.send_to;
      delete params.send_to;
      return { name: e.args[1], params, sendTo };
    });
}
const QUIZ_EVENT = /^(quiz_|consultation_clicked$|diagnostic_)/;
const quizEvents = (h) => gaEvents(h, '/shsat/quiz').filter((e) => QUIZ_EVENT.test(e.name));
const quizEventNames = (h) => quizEvents(h).map((e) => e.name);
const adsConversions = (h) => h.gtag.filter((e) => Array.isArray(e.args) && e.args[0] === 'event' && e.args[1] === 'conversion');
const fbqTracks = (h) => h.fbq.filter((c) => /^track/.test(c.args[0]));

// Requests (as recorded by setup) that reach a Google Ads endpoint: the gtagStub
// model hosts, plus the other hosts real gtag.js uses for Ads.
function adsRequests(reqs) {
  return reqs.map((r) => r.url).filter((url) => {
    let u;
    try { u = new URL(url); } catch (e) { return false; }
    return /(^|\.)(doubleclick\.net|googleadservices\.com)$/.test(u.hostname) ||
      (/(^|\.)google\.com$/.test(u.hostname) && /^\/(pagead|ccm)\//.test(u.pathname));
  });
}
// GA4 hits from the gtagStub model for one event name.
function ga4Hits(reqs, name) {
  return reqs.map((r) => r.url).filter((url) => {
    let u;
    try { u = new URL(url); } catch (e) { return false; }
    return u.hostname === 'www.google-analytics.com' && u.searchParams.get('en') === name;
  });
}

async function emailsFor(page, email) {
  const r = await page.request.get('/__e2e/emails?email=' + encodeURIComponent(email));
  return (await r.json()).emails;
}
const isAlert = (e) => Array.isArray(e.body.to) && e.body.to.indexOf(OPS) !== -1;

// ---------------------------------------------------------------------------
// Checks shared by several flows
// ---------------------------------------------------------------------------

// 8.2 flow 18: exactly one screen in the accessibility tree.
const SCREEN_HEADINGS = [
  /heading "Get a clear SHSAT plan for your student in 2 minutes"/,
  /heading "Question \d of 6/,
  /heading "Where can we reach you\?"/,
  /heading "This page is written for parents"/,
  /heading "Your student.s SHSAT plan"/
];
async function expectOneScreen(page) {
  await expect(page.locator('#quizMain > section.screen:not([hidden])')).toHaveCount(1);
  const snap = await page.locator('#quizMain').ariaSnapshot();
  const found = SCREEN_HEADINGS.filter((re) => re.test(snap));
  expect(found.length, 'screens in the accessibility tree:\n' + snap).toBe(1);
}

// 8.2 flow 17: buttons and links outside running text are at least 44 px tall (chips 52).
async function smallTargets(page) {
  return page.evaluate(() => {
    const bad = [];
    const els = document.querySelectorAll('button, a[href], label.sendlink-consent');
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue; // not rendered
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden') continue;
      if (el.tagName === 'A' && cs.display === 'inline') continue; // a link inside a sentence
      const min = el.classList.contains('choice-chip') ? 52 : 44;
      if (r.height < min - 0.5) bad.push((el.id || el.className || el.tagName) + ' "' + (el.textContent || '').trim().slice(0, 40) + '" ' + r.height.toFixed(1) + 'px');
    }
    return bad;
  });
}

async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const out = [];
    if (doc.scrollWidth > doc.clientWidth + 1) out.push('page scrolls sideways: ' + doc.scrollWidth + ' > ' + doc.clientWidth);
    // Clipping: a visible element whose content is cut by overflow hidden or clip.
    document.querySelectorAll('#quizMain *, .top-bar *, .page-footer *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (el.closest('.sr-only, .sendlink-hp, [hidden]')) return;
      if (!/(hidden|clip)/.test(cs.overflowX + cs.overflowY)) return;
      if (el.classList.contains('book-progress')) return; // the progress track clips its own bar on purpose
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push('clipped: ' + (el.id || el.className));
    });
    return out;
  });
}

// ---------------------------------------------------------------------------
// Flow 1. Happy path
// ---------------------------------------------------------------------------

test.describe('flow 1: happy path', () => {
  test('grade 8, Phase 1, 2026-09-28: preview, errors, results, one alert and one plan copy, events once in order', async ({ page }) => {
    const h = await setup(page, { flags: { PLAN_COPY: true } });
    await openQuiz(page);
    await expect(page.locator('#introDisclosure')).toHaveText(ty("At the end, we'll ask for your name, email and mobile number. You'll see your plan right away, we'll email you a copy, and Vicente from IvyPath may text you to go over it."));
    await shows(page.locator('#introDate'), 'SHSAT registration opens Tuesday, October 6 and closes Friday, October 30. The school-day test is Wednesday, November 18.');
    await answerAll(page, PARENT8);

    // The gate: the preview first.
    await expect(page.locator('#gateSub')).toHaveText(ty("Your plan is ready. We'll show it right away and email you a copy."));
    await expect(page.locator('.plan-preview')).toHaveAttribute('aria-label', 'Plan preview');
    await expect(page.locator('#pvEyebrow')).toHaveText('About 7 weeks to the school-day test');
    await expect(page.locator('#pvBand')).toHaveText('Before November 18: begin with one timed practice test');
    await shows(page.locator('#pvLine'), 'Registration opens Tuesday, October 6 and closes Friday, October 30.');
    await expect(page.locator('#gPhoneHelp')).toHaveText('US mobile, for example (917) 555-0142. Vicente from IvyPath texts you himself, never before 8 AM or after 8:30 PM ET.');
    await expect(page.locator('#gEmailHelp')).toHaveText(ty("We'll email you a copy of this plan, and the diagnostic link if you ask for it."));
    await expect(page.locator('#gConsent')).not.toBeChecked();
    await expect(page.locator('#gateTexter')).toBeHidden(); // TEXTER has no role or photo until Vicente supplies them
    await expect(page.locator('#gPhone')).not.toHaveAttribute('placeholder', /./);
    await expect(page.locator('#gateForm [role="alert"]')).toHaveCount(1);

    // Then the validation errors, with nothing sent.
    await submitGate(page);
    await expect(page.locator('#gNameErr')).toHaveText('Please enter your name.');
    await shows(page.locator('#gPhoneErr'), 'Please enter a 10-digit US mobile number.');
    await expect(page.locator('#gEmailErr')).toHaveText('Please enter a valid email address.');
    await expect(page.locator('#gConsentErr')).toHaveText('Please check the box so we can follow up.');
    await expect(page.locator('#gName')).toBeFocused();
    await expect(page.locator('#gName')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#gPhone')).toHaveAttribute('aria-describedby', 'gPhoneErr gPhoneHelp');
    expect(h.site).toHaveLength(0);

    // Then success.
    await fillGate(page, h.person);
    await submitGate(page);
    await expect(page.locator('#scrResults')).toBeVisible();
    await expect(page.locator('#resTitle')).toBeFocused();
    await expect(page).toHaveTitle('Your plan · SHSAT plan for parents');
    const st = await quizState(page);
    expect(st.captured).toBe(true);
    expect(st.backend).toBe('site');

    // Results.
    await expect(page.locator('#resEyebrow')).toHaveText('About 7 weeks to the school-day test');
    await expect(page.locator('#resBand')).toHaveText('Before November 18: begin with one timed practice test');
    await expect(page.locator('#resSummary')).toHaveText(ty("Your student is in the right grade to take the SHSAT this fall. If your student hasn't taken a timed, full-length practice test yet, that's the first step, so the weeks that are left go where they're needed most."));
    await expect(page.locator('#resSchools')).toHaveText('Aiming for: Stuyvesant and Bronx Science. Fall 2026 is the first computer-adaptive SHSAT, so past cutoffs are only a rough guide.');
    const headings = await page.locator('#scrResults').locator('h1:visible, h2:visible').allInnerTexts();
    expect(headings.slice(0, 2).map(straight), '"What happens next" comes second').toEqual(["Your student's SHSAT plan", 'What happens next']);
    await shows(page.locator('#resTextNote'), 'Or wait for a text: Vicente from IvyPath may text you today to find a time.');
    await expect(page.locator('#resTexter')).toBeHidden();
    await expect(page.locator('#resCallLine')).toHaveText('Prefer to talk now? Call (929) 394-0349.');
    await expect(page.locator('#resCallLine a')).toHaveAttribute('href', 'tel:+19293940349');
    await expect(page.locator('#consultBtn')).toHaveAttribute('href', '/book.html');

    await expect(page.locator('#resWeekList > li')).toHaveCount(5);
    expect(await page.locator('#resWeekList > li > strong').allInnerTexts()).toEqual(['This week', 'Oct 6 to Oct 30', 'Weeks of Oct 5 to Nov 2', 'Week of Nov 9', 'Test dates']);
    expect((await page.locator('#resWeekList > li > span').allInnerTexts()).map(straight)).toEqual([
      'One timed, full-length practice test (100 questions in 180 minutes), then list the question types that were missed or took longest.',
      "Register for the SHSAT. Your student's school counselor can tell you how it works at their school.",
      'Most practice time on the math topics that take longest, plus one timed section each week.',
      'One last timed run early in the week, then light review.',
      'Wednesday, November 18 is the school-day test. Charter, private and homeschool students test on November 14, 15 or 21.'
    ]);
    await expect(page.locator('#resTakeawayList > li')).toHaveCount(3);
    expect(await page.locator('#resTakeawayList > li > h3').allTextContents()).toEqual(['1. The dates that matter', '2. Where to start', '3. Your biggest worry: math']);
    await expect(page.locator('#resTakeawayList .doe-line a')).toHaveAttribute('target', '_blank');
    await expect(page.locator('#diagForm')).toBeVisible();
    await expect(page.locator('#resTrust')).toBeVisible();
    await shows(page.locator('#resCopyStatus'), 'A copy of this plan is on its way to ' + h.person.email + '.');
    await expect(page.locator('#disclaimer')).toBeVisible();
    await expect(page.locator('#quizProgress')).toBeHidden();

    // The one POST.
    expect(h.site).toHaveLength(1);
    const body = h.site[0];
    expect(body).toMatchObject({
      quiz_id: st.quiz_id, test_type: 'SHSAT', parent_name: 'Sam Rivera', parent_email: h.person.email,
      phone: h.person.e164, student_grade: 8, consent: true, consent_version: 'quiz-2026-09-28',
      company_name: '', delivery: 'alert_and_copy',
      quiz: { version: 1, role: 'parent', targets: ['stuyvesant', 'bronx_science'], prep: 'self', practice_test: 'no', worry: 'math', band: 'final_weeks_baseline' }
    });
    expect(body.attribution).toMatchObject({ ivp_lp: '/shsat/quiz', v: 'parent' });

    // The stub received one alert and one plan copy.
    await expect.poll(async () => (await emailsFor(page, h.person.email)).length).toBe(2);
    const mail = await emailsFor(page, h.person.email);
    const alertMail = mail.filter(isAlert);
    const copyMail = mail.filter((e) => !isAlert(e));
    expect(alertMail).toHaveLength(1);
    expect(copyMail).toHaveLength(1);
    expect(alertMail[0].authorization).toBe('Bearer test');
    expect(alertMail[0].body.reply_to).toBe(h.person.email);
    expect(alertMail[0].body.subject).toContain('gr 8');
    expect(alertMail[0].body.subject).toContain('Stuyvesant, Bronx Science');
    expect(alertMail[0].body.html).toContain('sms:' + h.person.e164 + '?&amp;body=');
    expect(alertMail[0].body.text).toContain(st.quiz_id);
    expect(alertMail[0].body.text).toContain('self-declared parent');
    expect(copyMail[0].body.to).toEqual([h.person.email]);
    expect(copyMail[0].body.from).toContain('@noreply.ivypathacademy.com');
    expect(copyMail[0].body.text).toContain('Before November 18: begin with one timed practice test');
    expect(copyMail[0].body.text).not.toContain('Sam Rivera');
    expect(copyMail[0].body.text).toContain('https://www.ivypathacademy.com/book.html');

    // Events: once each, in order. ivypathTrackQuizLead gets the quiz_id.
    const expected = [
      ['quiz_started', { quiz: 'shsat_plan', quiz_version: 1 }],
      ['quiz_question_answered', { question_id: 'role', question_index: 1, answer: 'parent' }],
      ['quiz_question_answered', { question_id: 'grade', question_index: 2, answer: '8' }],
      ['quiz_question_answered', { question_id: 'targets', question_index: 3, answer: 'stuyvesant,bronx_science' }],
      ['quiz_question_answered', { question_id: 'prep', question_index: 4, answer: 'self' }],
      ['quiz_question_answered', { question_id: 'practice_test', question_index: 5, answer: 'no' }],
      ['quiz_question_answered', { question_id: 'worry', question_index: 6, answer: 'math' }],
      ['quiz_gate_viewed', { grade: 8 }],
      ['quiz_lead_captured', { grade: 8, band: 'final_weeks_baseline', backend: 'site' }],
      ['quiz_completed', { band: 'final_weeks_baseline', grade: 8, captured: true }]
    ];
    await expect.poll(() => quizEvents(h).length).toBe(expected.length);
    expect(quizEvents(h).map((e) => [e.name, e.params])).toEqual(expected);

    // GA4 only (6.2): every quiz event is addressed to GA4, so the answers, grade and
    // band never reach the Google Ads tag. The Ads tag did get the page-load hit, so
    // the routing model is live and this check is not empty.
    expect(quizEvents(h).filter((e) => e.sendTo !== GA4_ID).map((e) => e.name), 'quiz events not sent to GA4 alone').toEqual([]);
    await expect.poll(() => ga4Hits(h.requests, 'quiz_lead_captured').length).toBe(1);
    const adsHits = adsRequests(h.requests);
    expect(adsHits.some((u) => /[?&]en=page_view(&|$)/.test(u)), 'the Ads tag page hit at load').toBe(true);
    expect(adsHits.filter((u) => /[?&]en=(quiz_|consultation_clicked|diagnostic_)/.test(u)), 'quiz events at a Google Ads endpoint').toEqual([]);

    // The Pixel's automatic events are off before init (6.5), so a chip tap sends no
    // SubscribedButtonClick with the button text.
    const fq = h.fbq.filter((c) => c.path === '/shsat/quiz').map((c) => c.args);
    const autoOff = fq.findIndex((a) => a[0] === 'set' && a[1] === 'autoConfig' && a[2] === false && a[3] === PIXEL_ID);
    expect(autoOff, "fbq('set','autoConfig',false) is called").toBeGreaterThan(-1);
    expect(autoOff, 'autoConfig is off before init').toBeLessThan(fq.findIndex((a) => a[0] === 'init'));
    expect(fq.filter((a) => JSON.stringify(a).indexOf('SubscribedButtonClick') !== -1)).toEqual([]);

    expect(fbqTracks(h).filter((c) => c.path === '/shsat/quiz').map((c) => c.args)).toEqual([
      ['track', 'PageView'],
      ['track', 'ViewContent', { content_name: 'SHSAT Plan Landing' }],
      ['trackCustom', 'QuizStarted'],
      ['trackCustom', 'QuizLead']
    ]);
    expect(h.ads.filter((a) => a.name === 'ivypathTrackQuizLead').map((a) => a.args)).toEqual([[st.quiz_id]]);
  });
});

// ---------------------------------------------------------------------------
// Flow 2. Student exit and minor mode
// ---------------------------------------------------------------------------

test.describe('flow 2: student exit and minor mode', () => {
  test('no gate, no ad events after the exit, clean exit link, share fallbacks, back to Q1', async ({ page }) => {
    const h = await setup(page);
    await openQuiz(page, '?utm_source=google&utm_medium=cpc&utm_campaign=shsat_parent&gclid=E2E-GCLID-1&fbclid=E2E-FBCLID-1');
    await page.waitForTimeout(1700); // every tracking.js decorator pass (load, then 1.5 s) has run
    await page.locator('#startBtn').click();
    await atQuestion(page, 1);
    await settle(page);
    // The routing model is live: the Ads tag got its page-load hit before the tap.
    expect(adsRequests(h.requests).length, 'the Ads tag page hit at load').toBeGreaterThan(0);
    const r0 = h.requests.length;
    const g0tap = h.gtag.length;
    await chip(page, 'student').click();
    await expect(page.locator('#scrExit')).toBeVisible();

    // Minor mode starts on the tap: ad consent is denied before the answer event is
    // pushed, and that event goes to GA4 alone, with ad storage already denied.
    const tapped = h.gtag.slice(g0tap).map((e) => e.args);
    const deniedAt = tapped.findIndex((a) => a[0] === 'consent' && a[1] === 'update' && a[2] && a[2].ad_storage === 'denied' && a[2].ad_user_data === 'denied' && a[2].ad_personalization === 'denied');
    const answerAt = tapped.findIndex((a) => a[0] === 'event' && a[1] === 'quiz_question_answered' && a[2] && a[2].question_id === 'role');
    expect(deniedAt, 'ad consent denied on the tap').toBeGreaterThan(-1);
    expect(answerAt, 'the Q1 answer event').toBeGreaterThan(-1);
    expect(deniedAt, 'consent is denied before the answer event').toBeLessThan(answerAt);
    expect(tapped[answerAt][2]).toEqual({ send_to: GA4_ID, question_id: 'role', question_index: 1, answer: 'student' });
    await expect.poll(() => ga4Hits(h.requests.slice(r0), 'quiz_question_answered').length).toBe(1);
    expect(new URL(ga4Hits(h.requests.slice(r0), 'quiz_question_answered')[0]).searchParams.get('gcs')).toMatch(/^G10/);
    expect(adsRequests(h.requests.slice(r0)), 'Google Ads requests between the student tap and the exit screen').toEqual([]);
    await expect(page.locator('#exitTitle')).toBeFocused();
    await expect(page.locator('#scrGate')).toBeHidden();
    await expect(page.locator('#disclaimer')).toBeVisible();
    await expectOneScreen(page);
    expect(await page.evaluate(() => sessionStorage.getItem('ivp_minor'))).toBe('1');
    await expect.poll(() => quizEventNames(h)).toContain('quiz_student_exit');

    // The exit link: utm only, v=student, no click ids, no first touch, no ref.
    const checkExitHref = async () => {
      const u = new URL(await page.locator('#exitDiag').getAttribute('href'));
      expect(u.origin + u.pathname).toBe(DIAG_URL);
      expect(u.searchParams.get('v')).toBe('student');
      expect(u.searchParams.get('ivp_lp')).toBe('/shsat/quiz');
      expect(u.searchParams.get('utm_source')).toBe('google');
      expect(u.searchParams.get('utm_medium')).toBe('cpc');
      for (const k of ['gclid', 'fbclid', 'wbraid', 'gbraid', 'ref', 'first_landing', 'first_referrer']) {
        expect(u.searchParams.has(k), k + ' on the exit link').toBe(false);
      }
    };
    await checkExitHref();

    // No Meta event and no Ads conversion after the exit, including a tel: tap and the diagnostic button.
    await blockNavigation(page);
    await page.locator('.top-phone').click();
    await page.locator('#exitDiag').click();
    await checkExitHref();
    await expect.poll(() => gaEvents(h, '/shsat/quiz').map((e) => e.name)).toContain('phone_click'); // GA4 analytics continue
    await expect.poll(() => quizEventNames(h)).toContain('diagnostic_cta_click');
    await page.waitForTimeout(400);
    expect(adsConversions(h), 'Ads conversion calls').toEqual([]);
    // tracking.js's own phone_click and cta_click go to GA4 alone in minor mode.
    expect(adsRequests(h.requests.slice(r0)), 'Google Ads requests after the student tap').toEqual([]);
    expect(gaEvents(h, '/shsat/quiz').filter((e) => /^(phone_click|cta_click)$/.test(e.name)).map((e) => e.sendTo)).toEqual([GA4_ID, GA4_ID]);
    const revoke = h.fbq.findIndex((c) => c.args[0] === 'consent' && c.args[1] === 'revoke');
    expect(revoke, 'the Pixel is revoked').toBeGreaterThan(-1);
    expect(h.fbq.slice(revoke + 1).filter((c) => /^track/.test(c.args[0])).map((c) => c.args)).toEqual([]);
    expect(h.gtag.some((e) => e.args[0] === 'consent' && e.args[1] === 'update' && e.args[2] && e.args[2].ad_storage === 'denied' && e.args[2].ad_user_data === 'denied' && e.args[2].ad_personalization === 'denied')).toBe(true);
    expect(quizEventNames(h)).not.toContain('quiz_gate_viewed');

    // Share: navigator.share fails, then the clipboard fails: the read-only input.
    const shareUrl = new URL(page.url()).origin + '/shsat/quiz?utm_source=student_share&utm_medium=quiz';
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: () => Promise.reject(new DOMException('blocked', 'NotAllowedError')) });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } });
    });
    await page.locator('#shareBtn').click();
    await expect(page.locator('#shareManual')).toBeVisible();
    await expect(page.locator('#shareUrl')).toHaveValue(shareUrl);
    await expect(page.locator('#shareUrl')).toBeFocused();
    expect(await page.evaluate(() => { const i = document.getElementById('shareUrl'); return i.selectionStart === 0 && i.selectionEnd === i.value.length; })).toBe(true);
    // Share fails, the clipboard works: "Link copied".
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } });
    });
    await page.locator('#shareBtn').click();
    await expect(page.locator('#shareStatus')).toBeVisible();
    await expect(page.locator('#shareStatus')).toHaveText('Link copied. Send it to a parent.');
    await expect.poll(() => quizEvents(h).filter((e) => e.name === 'quiz_share').map((e) => e.params.method)).toEqual(['share', 'manual', 'share', 'copy']);
    expect(shareUrl).not.toMatch(/ref=/);

    // Reload in minor mode: ad consent is denied before the tags configure, and the Pixel is revoked before init.
    const g0 = h.gtag.length;
    const f0 = h.fbq.length;
    await page.reload();
    await ready(page);
    await expect(page.locator('#scrExit')).toBeVisible();
    await expect.poll(() => h.fbq.length - f0).toBeGreaterThan(2);
    const g = h.gtag.slice(g0).map((e) => e.args);
    const consentAt = g.findIndex((a) => a[0] === 'consent' && a[1] === 'default' && a[2] && a[2].ad_storage === 'denied');
    const configAt = g.findIndex((a) => a[0] === 'config');
    expect(consentAt).toBeGreaterThan(-1);
    expect(consentAt).toBeLessThan(configAt);
    const f = h.fbq.slice(f0).map((c) => c.args);
    expect(f.findIndex((a) => a[0] === 'consent' && a[1] === 'revoke')).toBeLessThan(f.findIndex((a) => a[0] === 'init'));

    // "I'm a parent, go back" returns to Q1, with no answer kept.
    await page.locator('#exitBack').click();
    await atQuestion(page, 1);
    await expect(page.locator('#qTitle')).toBeFocused();
    await expectPressed(page, []);
  });

  test('a Back inside the 260 ms advance still leaves the tab in minor mode', async ({ page }) => {
    const h = await setup(page);
    await openQuiz(page);
    await page.locator('#startBtn').click();
    await atQuestion(page, 1);
    await settle(page);
    const r0 = h.requests.length;
    const f0 = h.fbq.length;
    // The student tap and Back in one task, well inside the advance delay.
    await page.evaluate(() => {
      document.querySelector('#qChoices .choice-chip[data-v="student"]').click();
      document.getElementById('qBack').click();
    });
    await expect(page.locator('#scrIntro')).toBeVisible();
    await page.waitForTimeout(400); // past the cancelled advance
    await expect(page.locator('#scrExit')).toBeHidden();
    expect(await page.evaluate(() => sessionStorage.getItem('ivp_minor'))).toBe('1');
    const g = h.gtag.map((e) => e.args);
    const deniedAt = g.findIndex((a) => a[0] === 'consent' && a[1] === 'update' && a[2] && a[2].ad_storage === 'denied');
    const answerAt = g.findIndex((a) => a[0] === 'event' && a[1] === 'quiz_question_answered' && a[2] && a[2].answer === 'student');
    expect(deniedAt, 'ad consent denied').toBeGreaterThan(-1);
    expect(deniedAt, 'before the answer event').toBeLessThan(answerAt);
    expect(h.fbq.slice(f0).map((c) => c.args)).toEqual([['consent', 'revoke']]);
    expect(adsRequests(h.requests.slice(r0)), 'Google Ads requests after the student tap').toEqual([]);

    // Start again as a parent in the same tab: still no Meta event and no Ads request.
    await page.locator('#startBtn').click();
    await pick(page, 1, 'parent');
    await atQuestion(page, 2);
    await page.waitForTimeout(400);
    expect(h.fbq.slice(f0).filter((c) => /^track/.test(c.args[0])).map((c) => c.args)).toEqual([]);
    expect(adsRequests(h.requests.slice(r0))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Flow 3. History
// ---------------------------------------------------------------------------

test.describe('flow 3: history', () => {
  test('UI Back and browser Back keep answers; one Back from the results leaves; forward never shows the gate', async ({ page }) => {
    const h = await setup(page);
    await page.goto('/privacy.html');
    await openQuiz(page);
    await page.locator('#startBtn').click();
    await pick(page, 1, 'parent');
    await pick(page, 2, '8');
    await pickTargets(page, ['stuyvesant']);
    await atQuestion(page, 4);

    // UI Back keeps the answer.
    await settle(page);
    await page.locator('#qBack').click();
    await atQuestion(page, 3);
    await expectPressed(page, ['stuyvesant']);
    await settle(page);
    await page.locator('#qContinue').click();
    await atQuestion(page, 4);

    // Browser Back from Q4 shows Q3, then Q2, with the answers kept and the URL unchanged.
    await page.goBack();
    await atQuestion(page, 3);
    await expectPressed(page, ['stuyvesant']);
    await expect(page).toHaveURL(/\/shsat\/quiz$/);
    await page.goBack();
    await atQuestion(page, 2);
    await expectPressed(page, ['8']);

    // Choosing the same answer again advances.
    await pick(page, 2, '8');
    await atQuestion(page, 3);
    await expectPressed(page, ['stuyvesant']);
    await settle(page);
    await page.locator('#qContinue').click();
    await pick(page, 4, 'self');
    await pick(page, 5, 'no');
    await pick(page, 6, 'math');
    await expect(page.locator('#scrGate')).toBeVisible();
    await fillGate(page, h.person);
    await submitGate(page);
    await expect(page.locator('#scrResults')).toBeVisible();

    // One Back leaves /shsat/quiz.
    await page.goBack();
    await expect(page).toHaveURL(/\/privacy\.html$/);
    // Forward shows the results, and so does the stale quiz entry beyond it: never the gate.
    await page.goForward();
    await expect(page).toHaveURL(/\/shsat\/quiz$/);
    await ready(page, { fbq: false });
    await expect(page.locator('#scrResults')).toBeVisible();
    await page.goForward().catch(() => null);
    await expect(page.locator('#scrResults')).toBeVisible();
    await expect(page.locator('#scrGate')).toBeHidden();
    expect(h.site).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Flow 4. Reload
// ---------------------------------------------------------------------------

test.describe('flow 4: reload', () => {
  test('mid-quiz reload resumes at the same step; a results reload re-renders without events or email', async ({ page }) => {
    const h = await setup(page);
    await openQuiz(page);
    await page.locator('#startBtn').click();
    await pick(page, 1, 'parent');
    await pick(page, 2, '8');
    await pickTargets(page, ['brooklyn_tech']);
    await atQuestion(page, 4);
    const id = (await quizState(page)).quiz_id;

    await page.reload();
    await ready(page);
    await atQuestion(page, 4);
    await expect(page.locator('#qTitle')).toBeFocused();
    expect((await quizState(page)).quiz_id).toBe(id);
    await settle(page);
    await page.locator('#qBack').click();
    await atQuestion(page, 3);
    await expectPressed(page, ['brooklyn_tech']);
    await settle(page);
    await page.locator('#qContinue').click();
    await pick(page, 4, 'none');
    await pick(page, 5, 'once');
    await pick(page, 6, 'timing');
    await fillGate(page, h.person);
    await submitGate(page);
    await expect(page.locator('#scrResults')).toBeVisible();
    await expect(page.locator('#resBand')).toHaveText('Before November 18: work on what the practice test showed');
    await expect.poll(async () => (await emailsFor(page, h.person.email)).length).toBe(1); // PLAN_COPY off: the alert only
    await expect.poll(() => quizEventNames(h)).toContain('quiz_completed');
    expect(quizEventNames(h).filter((n) => n === 'quiz_started')).toHaveLength(1);

    const g0 = h.gtag.length;
    const f0 = h.fbq.length;
    const a0 = h.ads.length;
    await page.reload();
    await ready(page);
    await expect(page.locator('#scrResults')).toBeVisible();
    await expect(page.locator('#resBand')).toHaveText('Before November 18: work on what the practice test showed');
    await expect(page.locator('#resTextNote')).toBeVisible();
    await page.waitForTimeout(600);
    const again = gaEvents({ gtag: h.gtag.slice(g0) }, '/shsat/quiz').filter((e) => QUIZ_EVENT.test(e.name));
    expect(again, 'no quiz event fires again').toEqual([]);
    expect(h.fbq.slice(f0).filter((c) => c.args[0] === 'trackCustom').map((c) => c.args)).toEqual([]);
    expect(h.ads.slice(a0)).toEqual([]);
    expect(h.site).toHaveLength(1);
    expect(await emailsFor(page, h.person.email)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Flow 5. Gate errors
// ---------------------------------------------------------------------------

test.describe('flow 5: gate errors', () => {
  test('@nycstudents.net and @nycstudent.net are blocked by the guard, with nothing sent', async ({ page }) => {
    const h = await setup(page);
    await openQuiz(page);
    await answerAll(page, PARENT8);
    await fillGate(page, h.person);
    for (const email of ['sam.student@nycstudents.net', 'sam.student@nycstudent.net']) {
      await page.locator('#gEmail').fill(email);
      await submitGate(page);
      await shows(page.locator('#gateAlert'), SCHOOL_MSG);
      await expect(page.locator('#scrGate')).toBeVisible();
    }
    await page.waitForTimeout(300);
    expect(h.site, 'no request is sent').toHaveLength(0);
    // A personal address then goes through.
    await page.locator('#gEmail').fill(h.person.email);
    await submitGate(page);
    await expect(page.locator('#scrResults')).toBeVisible();
    expect(h.site).toHaveLength(1);
  });

  test('a 5xx gives the retry message; a second gives "Show my plan anyway", focused, and a link-variant plan', async ({ page }, testInfo) => {
    const h = await setup(page);
    let calls = 0;
    await page.route('**/api/quiz-lead', (route) => { calls++; return route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' }); });
    await openQuiz(page);
    await answerAll(page, PARENT8);
    await fillGate(page, h.person);

    await submitGate(page);
    await expect(page.locator('#gateAlert')).toHaveText(SAVE_FAILED);
    await expect(page.locator('#gateSubmit')).toBeFocused();
    await expect(page.locator('#gateSubmit')).toHaveText('Show my plan');
    await expect(page.locator('#gateSubmit')).not.toHaveAttribute('aria-disabled', /./);
    await expect(page.locator('#gateRescue')).toBeHidden();
    await expect(page.locator('#gName')).toHaveValue('Sam Rivera');
    await expect.poll(() => quizEvents(h).filter((e) => e.name === 'quiz_lead_failed').map((e) => e.params)).toEqual([{ status: 500, backend: 'site', attempt: 1 }]);

    await submitGate(page);
    await expect(page.locator('#gateAlert')).toHaveText(SAVE_FAILED);
    await expect(page.locator('#showAnyway')).toBeVisible();
    await expect(page.locator('#showAnyway')).toBeFocused();
    const smsBody = encodeURIComponent('Hi, I just did the SHSAT plan on your site. My student is in 8th grade. Please text me back.');
    if (testInfo.project.name !== DESKTOP) {
      await expect(page.locator('#rescueSmsLink')).toBeVisible();
      await expect(page.locator('#rescueSmsLink')).toHaveAttribute('href', 'sms:+19293940349?&body=' + smsBody);
      await expect(page.locator('#rescueCall')).toBeHidden();
    } else {
      await shows(page.locator('#rescueCall'), 'Or call or text (929) 394-0349.');
      await expect(page.locator('#rescueSms')).toBeHidden();
    }
    expect(calls).toBe(2);

    await page.locator('#showAnyway').click();
    await expect(page.locator('#scrResults')).toBeVisible();
    const st = await quizState(page);
    expect(st.captured).toBe(false);
    await expect(page.locator('#resTextNote')).toBeHidden();
    await expect(page.locator('#resCopyStatus')).toHaveText('');
    await expect(page.locator('#diagLink')).toBeVisible();
    await expect(page.locator('#diagForm')).toBeHidden();
    await expect.poll(() => quizEvents(h).filter((e) => e.name === 'quiz_completed').map((e) => e.params.captured)).toEqual([false]);
    expect(quizEventNames(h)).not.toContain('quiz_lead_captured');
    expect(h.ads).toEqual([]);
  });

  test('a 429 gives "Show my plan anyway" at once', async ({ page }) => {
    const h = await setup(page);
    await page.route('**/api/quiz-lead', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ ok: false, error: TOO_MANY }) }));
    await openQuiz(page);
    await answerAll(page, PARENT8);
    await fillGate(page, h.person);
    await submitGate(page);
    await shows(page.locator('#gateAlert'), TOO_MANY);
    await expect(page.locator('#showAnyway')).toBeVisible();
    await expect(page.locator('#showAnyway')).toBeFocused();
    expect(quizEventNames(h)).not.toContain('quiz_lead_failed');
  });
});

// ---------------------------------------------------------------------------
// Flow 6. Grades
// ---------------------------------------------------------------------------

test.describe('flow 6: grades', () => {
  test('grade 9 line, grade 5 early start with no diagnostic, grades 6 and 7 with no week plan', async ({ page }) => {
    test.setTimeout(150000);
    const h = await setup(page);
    await openQuiz(page);

    // Grade 9: the diagnostic block shows the grade 9 line.
    await toResults(page, h, Object.assign({}, PARENT8, { grade: 9 }));
    await expect(page.locator('#resDiag')).toBeVisible();
    await shows(page.locator('#diagG9'), 'For 9th graders, ask about the diagnostic on your free consultation.');
    await expect(page.locator('#diagForm')).toBeHidden();
    await expect(page.locator('#diagBody')).toBeHidden();
    await expect(page.locator('#resWeekList > li')).toHaveCount(5);

    // Grade 5: no diagnostic block, the early_start copy, and "Your biggest worry" with no label.
    await restart(page, h);
    await toResults(page, h, Object.assign({}, PARENT8, { grade: 5, worry: 'timing' }));
    await expect(page.locator('#resDiag')).toBeHidden();
    await expect(page.locator('#resEyebrow')).toHaveText('SHSAT plan for parents');
    await expect(page.locator('#resBand')).toHaveText('Early years: everyday reading and math');
    await expect(page.locator('#resSummary')).toHaveText(ty("Your student is still a few years away from the SHSAT. The most useful work now is everyday reading and math. There's no need for test prep yet."));
    expect(await page.locator('#resTakeawayList > li > h3').allTextContents()).toEqual(['1. When your student takes the SHSAT', '2. Where to start', '3. Your biggest worry']);
    await expect(page.locator('#resTakeawayList > li').nth(2).locator('p').first()).toHaveText(ty("It's early, and that helps. For now, reading for fun and everyday math matter more than test prep. When your student reaches 6th or 7th grade, a free 15-minute consultation can help you decide when to start."));
    await expect(page.locator('#resWeek')).toBeHidden();
    await expect(page.locator('#resSchools')).toHaveText('Aiming for: Stuyvesant and Bronx Science.');

    // Grade 6: foundation. Grade 7: full_year. No week plan for either.
    await restart(page, h);
    await toResults(page, h, Object.assign({}, PARENT8, { grade: 6 }));
    await expect(page.locator('#resBand')).toHaveText('Fall 2028: strong reading and math basics');
    await expect(page.locator('#resWeek')).toBeHidden();
    await expect(page.locator('#diagForm')).toBeVisible();

    await restart(page, h);
    await toResults(page, h, Object.assign({}, PARENT8, { grade: 7 }));
    await expect(page.locator('#resBand')).toHaveText('Fall 2027: a steady year of practice');
    await expect(page.locator('#resWeek')).toBeHidden();
    await expect(page.locator('#resTakeawayList > li')).toHaveCount(3);
  });
});

// ---------------------------------------------------------------------------
// Flow 7. Dates and times
// ---------------------------------------------------------------------------

test.describe('flow 7: dates and times', () => {
  test('2026-10-06 gives T1_REG_OPEN', async ({ page }) => {
    const h = await setup(page, { today: '2026-10-06' });
    await openQuiz(page);
    await shows(page.locator('#introDate'), 'SHSAT registration is open until Friday, October 30. The school-day test is Wednesday, November 18.');
    await answerAll(page, PARENT8);
    await shows(page.locator('#pvLine'), 'Registration closes Friday, October 30.');
    await fillGate(page, h.person);
    await submitGate(page);
    await expect(page.locator('#scrResults')).toBeVisible();
    await expect(page.locator('#resTakeawayList > li').first().locator('p').first()).toHaveText(ty("Registration is open now and closes Friday, October 30. The school-day test is Wednesday, November 18. The weekend dates, November 14, 15 and 21, are for charter, private and homeschool students. This week, ask your student's school counselor how registration works at their school."));
    expect(await page.locator('#resWeekList > li > strong').allInnerTexts()).toEqual(['This week', 'By Fri, Oct 30', 'Weeks of Oct 12 to Nov 2', 'Week of Nov 9', 'Test dates']);
  });

  test('2026-10-31 gives T1_REG_CLOSED and the conditional summary', async ({ page }) => {
    const h = await setup(page, { today: '2026-10-31' });
    await openQuiz(page);
    await shows(page.locator('#introDate'), 'The school-day SHSAT is Wednesday, November 18, the first year of the computer-adaptive format.');
    await toResults(page, h);
    await expect(page.locator('#resSummary')).toHaveText(ty("If your student registered by October 30, the test is this fall. If your student hasn't taken a timed, full-length practice test yet, that's the first step, so the weeks that are left go where they're needed most."));
    await expect(page.locator('#resTakeawayList > li').first().locator('p').first()).toHaveText(ty("Registration closed on Friday, October 30. The school-day test is Wednesday, November 18, and the weekend dates, November 14, 15 and 21, are for charter, private and homeschool students. If your student isn't registered, ask the school counselor right away about options."));
    await expect(page.locator('#resEyebrow')).toHaveText('About 2 weeks to the school-day test');
  });

  test('2026-11-19 with grade 8 gives after_test, with no takeaways and no week plan', async ({ page }) => {
    const h = await setup(page, { today: '2026-11-19' });
    await openQuiz(page);
    await expect(page.locator('#introDate')).toBeHidden();
    await toResults(page, h);
    await expect(page.locator('#resBand')).toHaveText('After the fall 2026 test');
    await expect(page.locator('#resSummary')).toHaveText('The fall 2026 SHSAT dates have passed. If your student took the test, a free 15-minute consultation can help you think through what comes next.');
    await expect(page.locator('#resEyebrow')).toHaveText('SHSAT plan for parents');
    await expect(page.locator('#resTakeaways')).toBeHidden();
    await expect(page.locator('#resTakeawayList > li')).toHaveCount(0);
    await expect(page.locator('#resWeek')).toBeHidden();
  });

  test('at 22:00 the text note says "tomorrow morning" and the call line "after 9 AM ET"', async ({ page }) => {
    const h = await setup(page, { nowMin: 22 * 60 });
    await openQuiz(page);
    await toResults(page, h);
    await shows(page.locator('#resTextNote'), 'Or wait for a text: Vicente from IvyPath may text you tomorrow morning to find a time.');
    await shows(page.locator('#resCallLine'), 'Prefer to talk? Call (929) 394-0349 after 9 AM ET.');
    const mail = (await emailsFor(page, h.person.email)).filter(isAlert);
    expect(mail).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Flow 8. Diagnostic send (Phase 1)
// ---------------------------------------------------------------------------

test.describe('flow 8: diagnostic send', () => {
  test('posts to send-link as the parent, shows sentTo and focuses it', async ({ page }) => {
    const h = await setup(page);
    await openQuiz(page);
    await toResults(page, h);
    await page.locator('#dStudent').fill('alex.e2e@example.org');
    await page.locator('#diagSubmit').click();
    await expect(page.locator('#diagSuccess')).toBeVisible();
    await shows(page.locator('#diagSuccess'), 'Link sent to alex.e2e@example.org. It works for 14 days, and the report still comes to you when your student finishes.');
    await expect(page.locator('#diagSuccess')).toBeFocused();
    await expect(page.locator('#diagForm')).toBeHidden();
    expect(h.funnel.map((f) => f.path)).toEqual(['send-link']);
    const b = h.funnel[0].body;
    expect(b).toMatchObject({ test_type: 'SHSAT', parent_email: h.person.email, student_email: 'alex.e2e@example.org', student_grade: 8, consent: true, company_name: '' });
    expect(b.attribution).toMatchObject({ v: 'parent', ivp_lp: '/shsat/quiz' });
    expect(JSON.stringify(b)).not.toContain('Sam Rivera');
    expect(JSON.stringify(b)).not.toContain(h.person.digits);
    await expect.poll(() => quizEvents(h).filter((e) => e.name === 'diagnostic_link_sent').map((e) => e.params)).toEqual([{ exam: 'SHSAT', source: 'shsat_quiz' }]);
    expect(h.fbq.some((c) => c.args[0] === 'trackCustom' && c.args[1] === 'DiagnosticLinkSent')).toBe(true);
  });

  test('a 400 shows the error and the fallback link', async ({ page }) => {
    const h = await setup(page);
    h.funnelHandlers['send-link'] = () => ({ status: 400, body: { ok: false, error: 'Please use a personal or parent email.' } });
    await openQuiz(page);
    await toResults(page, h);
    await page.locator('#diagSubmit').click();
    await shows(page.locator('#diagAlert'), 'Please use a personal or parent email.');
    await expect(page.locator('#diagFallback')).toBeVisible();
    const u = new URL(await page.locator('#diagFallback a').getAttribute('href'));
    expect(u.origin + u.pathname).toBe(DIAG_URL);
    expect(u.searchParams.get('ivp_lp')).toBe('/shsat/quiz');
    await expect(page.locator('#diagSuccess')).toBeHidden();
    expect(h.funnel[0].body.student_email).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Flow 9. Phase 2 (flags overridden)
// ---------------------------------------------------------------------------

test.describe('flow 9: Phase 2', () => {
  const PHASE2 = { QUIZ_BACKEND: 'platform', PLAN_COPY: true };

  test('a platform 200 stores lead_ref, fires copy_only, and the diagnostic posts to quiz-lead/send-link', async ({ page }) => {
    const h = await setup(page, { flags: PHASE2 });
    await openQuiz(page);
    await answerAll(page, PARENT8);
    await expect(page.locator('head link[rel="preconnect"][href="https://app.ivypathacademy.com"]')).toHaveCount(1);
    await fillGate(page, h.person);
    await submitGate(page);
    await expect(page.locator('#scrResults')).toBeVisible();
    const st = await quizState(page);
    expect(st.backend).toBe('platform');
    expect(st.lead_ref).toBe('lr_e2e_0123456789abcdef');
    expect(typeof st.lead_ref_at).toBe('number');
    expect(st.diag_allowed).toBe(true);
    expect(h.funnel.map((f) => f.path)).toEqual(['quiz-lead']);
    expect(h.funnel[0].body).toMatchObject({ quiz_id: st.quiz_id, phone: h.person.e164, attribution: { v: 'parent' } });

    await expect.poll(() => h.site.length).toBe(1);
    expect(h.site[0].delivery).toBe('copy_only');
    await shows(page.locator('#resCopyStatus'), 'A copy of this plan is on its way to ' + h.person.email + '.');
    const mail = await emailsFor(page, h.person.email);
    expect(mail.filter(isAlert), 'no site alert in Phase 2').toHaveLength(0);
    expect(mail).toHaveLength(1);
    await expect.poll(() => quizEvents(h).filter((e) => e.name === 'quiz_lead_captured').map((e) => e.params.backend)).toEqual(['platform']);

    await page.locator('#diagSubmit').click();
    await expect(page.locator('#diagSuccess')).toBeVisible();
    expect(h.funnel.map((f) => f.path)).toEqual(['quiz-lead', 'quiz-lead/send-link']);
    expect(h.funnel[1].body).toEqual({ lead_ref: 'lr_e2e_0123456789abcdef', student_email: '', company_name: '' });
  });

  test('an expired-token 400 on quiz-lead/send-link retries silently through send-link', async ({ page }) => {
    const h = await setup(page, { flags: PHASE2 });
    h.funnelHandlers['quiz-lead/send-link'] = () => ({ status: 400, body: { ok: false, error: 'expired', field: 'lead_ref' } });
    await openQuiz(page);
    await toResults(page, h);
    await page.locator('#diagSubmit').click();
    await expect(page.locator('#diagSuccess')).toBeVisible();
    await expect(page.locator('#diagAlert')).toHaveText('');
    expect(h.funnel.map((f) => f.path)).toEqual(['quiz-lead', 'quiz-lead/send-link', 'send-link']);
    expect(h.funnel[2].body).toMatchObject({ parent_email: h.person.email, student_grade: 8, attribution: { v: 'parent', ivp_lp: '/shsat/quiz' } });
  });

  test('a platform abort (the route hangs 16 s) falls back to /api/quiz-lead as site_fallback', async ({ page }) => {
    test.setTimeout(90000);
    const h = await setup(page, { flags: PHASE2 });
    h.funnelHandlers['quiz-lead'] = () => ({ hangMs: 16000 });
    await openQuiz(page);
    await answerAll(page, PARENT8);
    await fillGate(page, h.person);
    await submitGate(page);
    await expect(page.locator('#gateSubmit')).toHaveText('Still saving…', { timeout: 8000 });
    await expect(page.locator('#scrResults')).toBeVisible({ timeout: 25000 });
    expect(h.site).toHaveLength(1);
    expect(h.site[0]).toMatchObject({ delivery: 'alert_and_copy', fallback_reason: 'platform_timeout', attribution: { v: 'parent' } });
    const st = await quizState(page);
    expect(st.backend).toBe('site_fallback');
    expect(st.lead_ref).toBe(null);
    await expect.poll(async () => (await emailsFor(page, h.person.email)).filter(isAlert).length).toBe(1);
    const alertMail = (await emailsFor(page, h.person.email)).filter(isAlert)[0];
    expect(alertMail.body.text).toContain('site_fallback');
    expect(alertMail.body.text).toContain('platform_timeout');
    await expect.poll(() => quizEvents(h).filter((e) => /^quiz_lead_/.test(e.name)).map((e) => [e.name, e.params])).toEqual([
      ['quiz_lead_failed', { status: 'timeout', backend: 'platform', attempt: 1 }],
      ['quiz_lead_captured', { grade: 8, band: 'final_weeks_baseline', backend: 'site_fallback' }]
    ]);
  });

  test('a 400 without field falls back', async ({ page }) => {
    const h = await setup(page, { flags: PHASE2 });
    h.funnelHandlers['quiz-lead'] = () => ({ status: 400, body: { ok: false, error: 'Please check your entries and try again.' } });
    await openQuiz(page);
    await toResults(page, h);
    expect(h.site).toHaveLength(1);
    expect(h.site[0]).toMatchObject({ delivery: 'alert_and_copy', fallback_reason: 'platform_400' });
    expect((await quizState(page)).backend).toBe('site_fallback');
  });

  test('a 400 with field "phone" does not fall back', async ({ page }) => {
    const h = await setup(page, { flags: PHASE2 });
    h.funnelHandlers['quiz-lead'] = () => ({ status: 400, body: { ok: false, error: 'Please check your entries and try again.', field: 'phone' } });
    await openQuiz(page);
    await answerAll(page, PARENT8);
    await fillGate(page, h.person);
    await submitGate(page);
    await shows(page.locator('#gPhoneErr'), 'Please check your entries and try again.');
    await expect(page.locator('#gPhone')).toBeFocused();
    await expect(page.locator('#gPhone')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#scrGate')).toBeVisible();
    await page.waitForTimeout(300);
    expect(h.site, 'no fallback POST').toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Flow 10. Booking handoff
// ---------------------------------------------------------------------------

async function stubBookingApis(page, rec) {
  await page.route('**/api/availability**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ busy: [] }) }));
  await page.route('**/api/book-consultation', async (route) => {
    const body = JSON.parse(route.request().postData() || 'null');
    rec.push(body);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, email: body.email, date: body.date, time: body.time }) });
  });
}

async function bookFirstSlot(page) {
  await page.locator('#contactContinueBtn').click();
  await expect(page.locator('#calendarWidget')).toBeVisible();
  for (let i = 0; i < 2; i++) {
    if (await page.locator('#calGrid .calendar-day.available').count()) break;
    await page.locator('#calNext').click();
  }
  await page.locator('#calGrid .calendar-day.available').first().click();
  await page.locator('#calSlots .time-slot').first().click();
  await page.locator('#confirmBtn').click();
}

async function expectPrefilled(page, p) {
  await expect(page.locator('#leadName')).toHaveValue(p.name);
  await expect(page.locator('#leadEmail')).toHaveValue(p.email);
  await expect(page.locator('#leadPhone')).toHaveValue(p.typed);
  await expect(page.locator('#quizHandoffNote')).toBeVisible();
  await expect(page.locator('.book-hero-subtitle')).toHaveText(ty("A free 15-minute call about your student's SHSAT plan, with a tutor who went to Stuyvesant."));
}

test.describe('flow 10: booking handoff', () => {
  test('the consultation button prefills book.html; the booking POST carries quiz; the key is removed on success', async ({ page }) => {
    const h = await setup(page);
    const bookings = [];
    await stubBookingApis(page, bookings);
    await openQuiz(page);
    await toResults(page, h);
    const st = await quizState(page);
    await page.locator('#consultBtn').click();
    await page.waitForURL(/\/book\.html$/);
    await expectPrefilled(page, h.person);
    await expect(page.locator('#leadPhoneHint')).toHaveText('Mobile, so we can reach you if anything changes.');
    await expect(page.locator('img[src*="parent-text-1370"]')).toBeHidden();
    const clicked = gaEvents(h, '/shsat/quiz');
    expect(clicked.filter((e) => e.name === 'consultation_clicked').map((e) => e.params)).toEqual([{ source: 'shsat_quiz', band: 'final_weeks_baseline' }]);
    expect(clicked.some((e) => e.name === 'cta_click' && e.params.cta_type === 'consultation')).toBe(true);

    await bookFirstSlot(page);
    await page.waitForURL(/\/thank-you\.html\?/);
    expect(bookings).toHaveLength(1);
    expect(bookings[0].quiz).toEqual({
      version: 1, quiz_id: st.quiz_id, grade: 8, targets: ['stuyvesant', 'bronx_science'],
      prep: 'self', practice_test: 'no', worry: 'math', band: 'final_weeks_baseline'
    });
    expect(bookings[0]).toMatchObject({ name: 'Sam Rivera', email: h.person.email, phone: h.person.typed, ref: '' });
    expect(await page.evaluate(() => sessionStorage.getItem('ivp_quiz_handoff'))).toBe(null);
    expect(new URL(page.url()).search).not.toMatch(/ref=|email|phone|name/);
    // The booking still converts on PR #38's label.
    await expect.poll(() => adsConversions(h).filter((e) => e.path === '/thank-you.html').map((e) => e.args[2].send_to)).toEqual([BOOKING_SEND_TO]);
  });

  test('"Not you? Clear" empties the fields, restores the page and focuses #leadName', async ({ page }) => {
    const h = await setup(page);
    await stubBookingApis(page, []);
    await openQuiz(page);
    await toResults(page, h);
    await page.locator('#consultBtn').click();
    await page.waitForURL(/\/book\.html$/);
    await expectPrefilled(page, h.person);
    await page.locator('#quizHandoffClear').click();
    await expect(page.locator('#leadName')).toBeFocused();
    await expect(page.locator('#leadName')).toHaveValue('');
    await expect(page.locator('#leadEmail')).toHaveValue('');
    await expect(page.locator('#leadPhone')).toHaveValue('');
    await expect(page.locator('#quizHandoffNote')).toHaveCount(0);
    await expect(page.locator('.book-hero-subtitle')).toHaveText("A 15-minute, no-pressure call to discuss your child's academic goals and learn how IvyPath can help.");
    await expect(page.locator('img[src*="parent-text-1370"]')).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('ivp_quiz_handoff'))).toBe(null);
    expect(await page.evaluate(() => window.__ivpQuizHandoff())).toBe(null);
  });

  test('after "Show my plan anyway" the prefill still works', async ({ page }) => {
    const h = await setup(page);
    await stubBookingApis(page, []);
    await page.route('**/api/quiz-lead', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"ok":false}' }));
    await openQuiz(page);
    await answerAll(page, PARENT8);
    await fillGate(page, h.person);
    await submitGate(page);
    await expect(page.locator('#gateAlert')).toHaveText(SAVE_FAILED);
    await submitGate(page);
    await page.locator('#showAnyway').click();
    await expect(page.locator('#scrResults')).toBeVisible();
    await page.locator('#consultBtn').click();
    await page.waitForURL(/\/book\.html$/);
    await expectPrefilled(page, h.person);
  });
});

// ---------------------------------------------------------------------------
// Flow 11. Privacy sweep
// ---------------------------------------------------------------------------

test.describe('flow 11: privacy sweep', () => {
  test('no URL, dataLayer entry, fbq argument or console line carries the name, email or phone; QuizLead has no parameters; no ref=', async ({ page }) => {
    const h = await setup(page, { flags: { PLAN_COPY: true } });
    await stubBookingApis(page, []);
    await openQuiz(page, '?utm_source=google&utm_medium=cpc&utm_campaign=shsat_parent&utm_term=shsat%20prep&gclid=E2E-GCLID-2');
    await toResults(page, h);
    await blockNavigation(page);
    await page.locator('#diagSubmit').click();
    await expect(page.locator('#diagSuccess')).toBeVisible();
    await page.locator('#resCallLine a').click(); // a tel: tap (navigation blocked)
    const hrefs = await page.evaluate(() => Array.from(document.querySelectorAll('a[href]')).map((a) => a.href));
    const st = await quizState(page);
    await page.locator('#consultBtn').click();
    await page.waitForURL(/\/book\.html$/);
    await page.locator('#contactContinueBtn').click();
    await expect(page.locator('#calendarWidget')).toBeVisible();
    await page.waitForTimeout(400);

    const p = h.person;
    const needles = [
      p.email, encodeURIComponent(p.email), p.e164, encodeURIComponent(p.e164), p.digits, p.typed, encodeURIComponent(p.typed),
      p.name, encodeURIComponent(p.name), p.name.replace(' ', '+'), '555-' + p.digits.slice(-4)
    ].map((s) => s.toLowerCase());
    const leaks = (where, s) => needles.filter((n) => String(s).toLowerCase().indexOf(n) !== -1).map((n) => where + ': ' + n);
    const found = [];
    for (const r of h.requests) found.push(...leaks('request URL ' + r.url, r.url));
    for (const e of h.gtag) found.push(...leaks('dataLayer ' + e.path, JSON.stringify(e.args)));
    for (const c of h.fbq) found.push(...leaks('fbq ' + c.path, JSON.stringify(c.args)));
    for (const c of h.ads) found.push(...leaks('ads ' + c.path, JSON.stringify(c.args)));
    for (const t of h.consoleText) found.push(...leaks('console', t));
    found.push(...leaks('ivp_quiz_v1', JSON.stringify(st)));
    expect(found).toEqual([]);

    const quizLead = h.fbq.filter((c) => c.args[0] === 'trackCustom' && c.args[1] === 'QuizLead');
    expect(quizLead).toHaveLength(1);
    expect(quizLead[0].args).toEqual(['trackCustom', 'QuizLead']);

    const refs = hrefs.concat(h.requests.map((r) => r.url)).filter((u) => /[?&]ref=/.test(u));
    expect(refs, 'URLs carrying ref=').toEqual([]);
    const userData = ['em', 'ph', 'fn', 'ln', 'user_data', 'email', 'phone_number'];
    expect(adsConversions(h).filter((e) => e.args[2] && Object.keys(e.args[2]).some((k) => userData.indexOf(k) !== -1))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Flow 12. Paths
// ---------------------------------------------------------------------------

test.describe('flow 12: paths', () => {
  test('/shsat/quiz and /shsat/quiz/ are 200 and noindex; every subresource is 200 and root-absolute; no sticky bar', async ({ page }) => {
    const h = await setup(page);
    for (const path of ['/shsat/quiz', '/shsat/quiz/', '/shsat-quiz.html']) {
      const r = await page.request.get(path);
      expect(r.status(), path).toBe(200);
      expect(r.headers()['x-robots-tag'], path).toBe('noindex');
    }
    for (const path of ['/docs/specs/2026-09-27-shsat-quiz-design.md', '/tests/e2e/shsat-quiz.spec.js', '/playwright.config.js', '/api/_quiz-alert.js']) {
      expect((await page.request.get(path)).status(), path + ' is not served').toBe(404);
    }

    for (const path of ['/shsat/quiz', '/shsat/quiz/']) {
      h.requests.length = 0;
      h.responses.length = 0;
      await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) {} }).catch(() => {});
      const resp = await page.goto(path);
      await ready(page);
      expect(resp.headers()['x-robots-tag']).toBe('noindex');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
      if (path === '/shsat/quiz') {
        await toResults(page, h);
        await page.waitForLoadState('networkidle');
        h.person = await newPerson(page);
      }
      const local = h.responses.filter((r) => new URL(r.url).hostname === '127.0.0.1');
      const bad = local.filter((r) => r.status !== 200 && !/\/api\/quiz-lead$/.test(r.url));
      expect(bad, 'subresources that are not 200 on ' + path).toEqual([]);
      const under = h.requests.filter((r) => new URL(r.url).pathname.indexOf('/shsat/') === 0 && r.type !== 'document');
      expect(under.map((r) => r.url), 'requests under /shsat/ on ' + path).toEqual([]);
      expect(h.requests.some((r) => /sticky-cta/.test(r.url))).toBe(false);
      await expect(page.locator('.sticky-cta, #stickyCta, [class*="sticky-cta"]')).toHaveCount(0);
    }
  });

  test('/shsat-quiz.html is normalized to /shsat/quiz, and ivp_lp on the app links is /shsat/quiz', async ({ page }) => {
    await setup(page);
    await page.goto('/shsat-quiz.html?utm_source=google&utm_medium=cpc');
    await ready(page);
    expect(await page.evaluate(() => location.pathname + location.search)).toBe('/shsat/quiz?utm_source=google&utm_medium=cpc');
    for (const sel of ['#exitDiag', '#diagFallback a', '#diagLink a']) {
      const u = new URL(await page.locator(sel).getAttribute('href'));
      expect(u.searchParams.getAll('ivp_lp'), sel).toEqual(['/shsat/quiz']);
      expect(u.searchParams.get('first_landing'), sel).toBe('/shsat/quiz');
    }
    expect((await page.evaluate(() => window.ivpAttribution())).first_landing).toBe('/shsat/quiz');
  });
});

// ---------------------------------------------------------------------------
// Flow 13. /shsat regression
// ---------------------------------------------------------------------------

// The base is /shsat as it was before this PR: the parent of the commit that
// added the quiz link (tests/e2e/server.js baseRef), or HEAD while uncommitted.
// A later, intentional /shsat change will differ from that base too: move the
// base with E2E_BASE_REF=<commit> or retire this flow then.
test.describe('flow 13: /shsat regression', () => {
  test('the only DOM difference is the new .hero-alt-link paragraph, and the send-link form posts the same body', async ({ browser, page }, testInfo) => {
    test.skip(testInfo.project.name !== DESKTOP, 'viewport-independent: runs once, on desktop');
    const baseResp = await page.request.get('/__e2e/base?file=shsat-diagnostic.html');
    expect(baseResp.status()).toBe(200);
    const baseHtml = await baseResp.text();
    testInfo.annotations.push({ type: 'base ref', description: baseResp.headers()['x-e2e-base-ref'] });

    // (a) The parsed DOM, scripts off, so nothing runs and both pages are stable.
    const ctx = await browser.newContext({ javaScriptEnabled: false, baseURL: BASE });
    const noJs = await ctx.newPage();
    await noJs.route((url) => url.hostname !== '127.0.0.1', (r) => r.abort());
    await noJs.goto('/shsat');
    const current = await noJs.evaluate(() => {
      const links = Array.from(document.querySelectorAll('p.hero-alt-link')).filter((p) => p.querySelector('a.js-quiz-cta'));
      if (links.length !== 1) return { error: 'expected one quiz link paragraph, found ' + links.length };
      const p = links[0];
      const a = p.querySelector('a');
      const info = { href: a.getAttribute('href'), text: p.textContent.replace(/\s+/g, ' ').trim(), cls: p.className };
      const prev = p.previousSibling;
      if (prev && prev.nodeType === 3 && !prev.textContent.trim()) prev.remove();
      p.remove();
      return { info, html: document.documentElement.outerHTML };
    });
    expect(current.error).toBeUndefined();
    expect(current.info).toEqual({ href: '/shsat/quiz', text: 'Not sure where to start? Get a free 2-minute SHSAT plan →', cls: 'hero-alt-link fade-in delay-3' });
    await noJs.route('**/shsat', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: baseHtml }));
    await noJs.goto('/shsat');
    const base = await noJs.evaluate(() => document.documentElement.outerHTML);
    expect(current.html === base, 'DOM of /shsat minus the new paragraph equals the base DOM').toBe(true);
    await ctx.close();

    // (b) The send-link form posts the same body before and after.
    const postOnce = async (useBase) => {
      const p = await browser.newPage({ baseURL: BASE });
      let body = null;
      await p.route((url) => url.hostname !== '127.0.0.1', async (route) => {
        const u = new URL(route.request().url());
        if (u.hostname === 'app.ivypathacademy.com' && u.pathname === '/api/funnel/send-link') {
          if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
          body = JSON.parse(route.request().postData() || 'null');
          return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, CORS), body: JSON.stringify({ ok: true, sentTo: 'parent.e2e@example.com' }) });
        }
        if (u.hostname === 'connect.facebook.net' || u.hostname === 'www.googletagmanager.com') return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
        if (u.hostname === 'cdnjs.cloudflare.com' && /gsap/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: GSAP_STUB });
        return route.abort('blockedbyclient');
      });
      if (useBase) await p.route('**/shsat', (r) => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: baseHtml }));
      await p.goto('/shsat?utm_source=google&utm_medium=cpc&gclid=E2E-GCLID-3');
      await p.locator('#sl-parent').fill('parent.e2e@example.com');
      await p.locator('#sl-student').fill('alex.e2e@example.org');
      await p.locator('#sl-grade').selectOption('8');
      await p.locator('#sl-heard').selectOption('google');
      await p.locator('#sendLinkForm input[name="consent"]').check();
      await p.locator('#sendLinkSubmit').click();
      await expect(p.locator('#sendLinkSuccess')).toBeVisible();
      await p.close();
      return body;
    };
    const after = await postOnce(false);
    const before = await postOnce(true);
    expect(after).not.toBe(null);
    expect(after).toEqual(before);
  });
});

// ---------------------------------------------------------------------------
// Flow 14. Copy sweep (2.11)
// ---------------------------------------------------------------------------

test.describe('flow 14: copy sweep', () => {
  test('every screen at every grade, date and time variant, the emails and the new book.html strings pass 2.11', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== DESKTOP, 'viewport-independent: runs once, on desktop');
    test.setTimeout(240000);
    const h = await setup(page, { flags: { PLAN_COPY: true } });
    const problems = [];
    const lint = (where, text, opts) => {
      for (const p of lintText(text, opts)) problems.push(where + ': ' + p.rule + ' ("' + p.match + '")');
    };
    const sweepScreen = async (where) => {
      const s = await page.evaluate(() => ({
        title: document.title,
        visible: document.body.innerText,
        metas: Array.from(document.querySelectorAll('meta[name="description"], meta[property^="og:"]')).map((m) => m.content),
        alts: Array.from(document.querySelectorAll('img[alt]')).map((i) => i.alt).filter(Boolean),
        labels: Array.from(document.querySelectorAll('[aria-label]')).map((e) => e.getAttribute('aria-label')),
        noscript: Array.from(document.querySelectorAll('noscript')).map((n) => n.textContent.replace(/<[^>]+>/g, ' ')),
        takeaways: Array.from(document.querySelectorAll('#resTakeawayList > li > p:first-of-type')).map((p) => p.textContent)
      }));
      lint(where + ' <title>', s.title);
      lint(where + ' visible text', s.visible);
      s.metas.forEach((m) => lint(where + ' meta', m));
      s.alts.forEach((a) => lint(where + ' alt', a));
      s.labels.forEach((a) => lint(where + ' aria-label', a));
      s.noscript.forEach((n) => lint(where + ' noscript', n));
      s.takeaways.forEach((b) => {
        for (const p of lintTakeawayBody(b)) problems.push(where + ' takeaway: ' + p.rule);
      });
    };

    await openQuiz(page);
    // Every static string on the page, hidden or not (scripts and styles excluded).
    const allStatic = await page.evaluate(() => {
      const c = document.body.cloneNode(true);
      c.querySelectorAll('script, style, template, noscript').forEach((n) => n.remove()); // noscript is linted on its own, tags stripped
      return c.textContent;
    });
    lint('static page text', allStatic);

    const DATES = ['2026-09-28', '2026-10-06', '2026-10-31', '2026-11-18', '2026-11-19'];
    const TIMES = [420, 500, 600, 750, 900, 1080, 1320];
    const WORRIES = ['timing', 'math', 'ela', 'adaptive', 'consistency', 'where_stands', 'process'];
    const TARGETS = [['not_sure'], ['stuyvesant'], ['stuyvesant', 'bronx_science', 'brooklyn_tech'], ['stuyvesant', 'bronx_science', 'brooklyn_tech', 'brooklyn_latin', 'staten_island_tech', 'queens_science_york', 'american_studies_lehman', 'hsmse_ccny']];
    const PREP = [['no', 'self'], ['once', 'none'], ['multiple', 'tutor'], ['unsure', 'group'], ['once', 'group']];
    let n = 0;

    // Questions and the exit screen do not depend on the date.
    for (let q = 1; q <= 6; q++) {
      await inject(page, { state: makeState({ role: 'parent', grade: 8, targets: ['stuyvesant'], prep: 'self', practice_test: 'no', worry: 'math' }, 'q' + q) });
      await expect(page.locator('#qStep')).toHaveText('Question ' + q + ' of 6');
      await sweepScreen('Q' + q);
    }
    await inject(page, { state: makeState({ role: 'student' }, 'exit') });
    await expect(page.locator('#scrExit')).toBeVisible();
    await sweepScreen('exit');

    for (const today of DATES) {
      await inject(page, { hooks: { today } });
      await expect(page.locator('#scrIntro')).toBeVisible();
      await sweepScreen('intro ' + today);
      for (const grade of [5, 6, 7, 8, 9]) {
        const combos = grade >= 8 ? PREP : [PREP[n % PREP.length]];
        for (const [practice, prep] of combos) {
          n++;
          const answers = { role: 'parent', grade, targets: TARGETS[n % TARGETS.length], prep, practice_test: practice, worry: WORRIES[n % WORRIES.length] };
          const band = Q.bandFor(answers, today);
          const flags = { PLAN_COPY: n % 2 === 0, TEXT_FROM_NUMBER: n % 3 === 0 ? '+19293940349' : null };
          const hooks = { today, nowMin: TIMES[n % TIMES.length], flags };
          const where = [today, 'gr' + grade, band, practice, prep, answers.worry, 'min ' + hooks.nowMin].join(' ');
          await inject(page, { hooks, state: makeState(answers, 'gate') });
          await expect(page.locator('#scrGate')).toBeVisible();
          await sweepScreen('gate ' + where);
          await inject(page, { hooks, state: makeState(answers, 'results', true, { plan_emailed: n % 4 === 1 ? false : true }), handoff: makeHandoff(answers, band, h.person) });
          await expect(page.locator('#scrResults')).toBeVisible();
          await sweepScreen('results ' + where);
        }
      }
    }

    expect(n, 'gate and results variants swept (5 dates x 13 answer sets)').toBe(65);

    // Error and status states.
    await inject(page, { state: makeState(PARENT8, 'gate') });
    await submitGate(page);
    await expect(page.locator('#gNameErr')).not.toHaveText('');
    await sweepScreen('gate with errors');
    await page.route('**/api/quiz-lead', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' }));
    await fillGate(page, h.person);
    await submitGate(page);
    await expect(page.locator('#gateAlert')).toHaveText(SAVE_FAILED);
    await submitGate(page);
    await expect(page.locator('#showAnyway')).toBeVisible();
    await sweepScreen('gate rescue');
    await page.locator('#showAnyway').click();
    await expect(page.locator('#diagLink')).toBeVisible();
    await sweepScreen('results, link variant');
    await page.unroute('**/api/quiz-lead');

    h.funnelHandlers['send-link'] = () => ({ status: 500, body: { ok: false } });
    await inject(page, { state: makeState(PARENT8, 'results', true), handoff: makeHandoff(PARENT8, 'final_weeks_baseline', h.person) });
    await page.locator('#diagSubmit').click();
    await expect(page.locator('#diagFallback')).toBeVisible();
    await sweepScreen('results, diagnostic error');
    h.funnelHandlers['send-link'] = DEFAULT_FUNNEL['send-link'];
    await page.locator('#diagSubmit').click();
    await expect(page.locator('#diagSuccess')).toBeVisible();
    await sweepScreen('results, diagnostic sent');

    // The recorded alert and plan emails (a real submit through the harness).
    await page.evaluate(() => sessionStorage.clear());
    await openQuiz(page);
    await toResults(page, h, Object.assign({}, PARENT8, { worry: 'process' }));
    await expect.poll(async () => (await emailsFor(page, h.person.email)).length).toBe(2);
    for (const e of await emailsFor(page, h.person.email)) {
      const kind = isAlert(e) ? 'alert email' : 'plan email';
      lint(kind + ' subject', e.body.subject);
      lint(kind + ' text', e.body.text);
      lint(kind + ' html text', e.body.html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' '));
    }

    // The new book.html strings (not quiz files, so dashes and "!" are out of scope there).
    await stubBookingApis(page, []);
    await page.locator('#consultBtn').click();
    await page.waitForURL(/\/book\.html$/);
    await expect(page.locator('#quizHandoffNote')).toBeVisible();
    for (const sel of ['.book-hero-subtitle', '#quizHandoffNote', '#quizHandoffClear', '#leadPhoneHint']) {
      lint('book.html ' + sel, await page.locator(sel).innerText(), { quizOnly: false });
    }

    expect(problems, problems.slice(0, 40).join('\n')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Flow 15. Double tap
// ---------------------------------------------------------------------------

test.describe('flow 15: double tap', () => {
  test('a double click on a Q4 chip lands on Q5 unanswered', async ({ page }) => {
    await setup(page);
    await openQuiz(page);
    await page.locator('#startBtn').click();
    await pick(page, 1, 'parent');
    await pick(page, 2, '8');
    await pickTargets(page, ['stuyvesant']);
    await atQuestion(page, 4);
    await settle(page);
    await chip(page, 'self').dblclick();
    await atQuestion(page, 5);
    await page.waitForTimeout(600);
    await atQuestion(page, 5);
    await expectPressed(page, []);
    expect((await quizState(page)).answers.practice_test).toBeUndefined();
  });

  test('with reduced motion, a second click within 300 ms of the render does nothing', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await setup(page);
    await openQuiz(page);
    await page.locator('#startBtn').click();
    await pick(page, 1, 'parent');
    await pick(page, 2, '8');
    await pickTargets(page, ['stuyvesant']);
    await atQuestion(page, 4);
    await settle(page);
    // A pointer click (detail 1) on a Q5 chip as soon as Q5 renders.
    await page.evaluate(() => {
      const title = document.getElementById('qStep');
      const obs = new MutationObserver(() => {
        if (title.textContent !== 'Question 5 of 6') return;
        obs.disconnect();
        const c = document.querySelector('#qChoices .choice-chip[data-v="once"]');
        window.__e2eEarly = performance.now();
        c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      });
      obs.observe(title, { childList: true, characterData: true, subtree: true });
    });
    await chip(page, 'self').click();
    await atQuestion(page, 5);
    await page.waitForTimeout(700);
    await atQuestion(page, 5);
    await expectPressed(page, []);
    expect(await page.evaluate(() => typeof window.__e2eEarly)).toBe('number');
    // After the guard, a click answers normally.
    await chip(page, 'once').click();
    await atQuestion(page, 6);
  });
});

// ---------------------------------------------------------------------------
// Flow 16. Slow save
// ---------------------------------------------------------------------------

test.describe('flow 16: slow save', () => {
  test('with the site route delayed 10 s: "Still saving..." at 5 s, one alert, one captured result', async ({ page }) => {
    test.setTimeout(90000);
    const h = await setup(page);
    await page.route('**/api/quiz-lead', async (route) => {
      await new Promise((r) => setTimeout(r, 10000));
      await route.continue();
    });
    await openQuiz(page);
    await answerAll(page, PARENT8);
    await fillGate(page, h.person);
    const t0 = Date.now();
    await submitGate(page);
    await expect(page.locator('#gateSubmit')).toHaveText('Saving…');
    await expect(page.locator('#gateSubmit')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.locator('#gateSubmit')).toBeFocused(); // aria-disabled, never disabled, so focus stays
    const labelAt = async (ms) => {
      await page.waitForTimeout(Math.max(0, t0 + ms - Date.now()));
      return page.locator('#gateSubmit').textContent();
    };
    expect(await labelAt(4500), 'at 4.5 s').toBe('Saving…');
    expect(await labelAt(5700), 'at 5.7 s').toBe('Still saving…');
    await page.locator('#gateSubmit').click({ force: true }); // an extra press while saving is ignored (aria-disabled, so force)
    await expect(page.locator('#scrResults')).toBeVisible({ timeout: 20000 });
    expect(h.site).toHaveLength(1);
    await expect.poll(async () => (await emailsFor(page, h.person.email)).filter(isAlert).length).toBe(1);
    await page.waitForTimeout(500);
    expect((await emailsFor(page, h.person.email)).filter(isAlert)).toHaveLength(1);
    expect(quizEventNames(h).filter((n) => n === 'quiz_lead_captured')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Flow 17. Tap targets at 320 px
// ---------------------------------------------------------------------------

test.describe('flow 17: tap targets', () => {
  test('at 320 px every button and every link outside running text is at least 44 px tall', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== SMALL, 'the 320 px project');
    const h = await setup(page);
    await openQuiz(page);
    const check = async (where) => expect(await smallTargets(page), where).toEqual([]);
    await check('intro');
    await inject(page, { state: makeState({ role: 'parent' }, 'q1') });
    await check('Q1');
    await inject(page, { state: makeState({ role: 'parent', grade: 8, targets: ['stuyvesant'] }, 'q3') });
    await check('Q3');
    await inject(page, { state: makeState({ role: 'student' }, 'exit') });
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    });
    await page.locator('#shareBtn').click();
    await expect(page.locator('#shareManual')).toBeVisible();
    await check('exit');
    await inject(page, { state: makeState(PARENT8, 'gate') });
    await submitGate(page);
    await check('gate with errors');
    await page.route('**/api/quiz-lead', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"ok":false}' }));
    await fillGate(page, h.person);
    await submitGate(page);
    await expect(page.locator('#gateAlert')).toHaveText(SAVE_FAILED);
    await submitGate(page);
    await expect(page.locator('#showAnyway')).toBeVisible();
    await check('gate rescue');
    await page.locator('#showAnyway').click();
    await expect(page.locator('#diagLink')).toBeVisible();
    await check('results, link variant');
    h.funnelHandlers['send-link'] = () => ({ status: 500, body: { ok: false } });
    await inject(page, { state: makeState(PARENT8, 'results', true), handoff: makeHandoff(PARENT8, 'final_weeks_baseline', h.person) });
    await page.locator('#diagSubmit').click();
    await expect(page.locator('#diagFallback')).toBeVisible();
    await check('results with the diagnostic form and fallback link');
  });
});

// ---------------------------------------------------------------------------
// Flow 18. One screen; flow 21. Focus
// ---------------------------------------------------------------------------

test.describe('flows 18 and 21: one screen and focus at every step', () => {
  test('exactly one screen in the accessibility tree, and focus on the new heading after each step', async ({ page }) => {
    const h = await setup(page);
    await openQuiz(page);
    await expectOneScreen(page);
    expect(await page.evaluate(() => document.activeElement === document.body), 'focus is not moved on first load').toBe(true);
    await expect(page).toHaveTitle('2-Minute SHSAT Plan for Parents | IvyPath Academy');
    await page.locator('#startBtn').click();
    const steps = [['parent'], ['8'], null, ['group'], ['multiple'], ['adaptive']];
    for (let n = 1; n <= 6; n++) {
      await atQuestion(page, n);
      await expect(page.locator('#qTitle')).toBeFocused();
      await expect(page.locator('#qTitle')).toHaveText('Question ' + n + ' of 6: ' + Q.QUESTIONS[n - 1].title);
      await expect(page).toHaveTitle('Question ' + n + ' of 6 · SHSAT plan for parents');
      await expect(page.locator('#qStep')).toHaveAttribute('aria-hidden', 'true');
      await expectOneScreen(page);
      await settle(page);
      if (n === 3) {
        await page.locator('#qContinue').click();
        await expect(page.locator('#qError')).toHaveText('Pick at least one school, or choose Not sure yet.');
        await chip(page, 'stuyvesant').click();
        await chip(page, 'not_sure').click();
        await expectPressed(page, ['not_sure']);
        await expect(page.locator('#quizStatus')).toHaveText('School picks cleared.');
        await chip(page, 'bronx_science').click();
        await expectPressed(page, ['bronx_science']);
        await expect(chip(page, 'bronx_science')).toBeFocused(); // toggles do not move focus
        await page.locator('#qContinue').click();
      } else {
        await chip(page, steps[n - 1][0]).click();
      }
    }
    await expect(page.locator('#scrGate')).toBeVisible();
    await expect(page.locator('#gateTitle')).toBeFocused();
    await expect(page).toHaveTitle('Last step · SHSAT plan for parents');
    await expectOneScreen(page);
    await fillGate(page, h.person);
    await submitGate(page);
    await expect(page.locator('#scrResults')).toBeVisible();
    await expect(page.locator('#resTitle')).toBeFocused();
    await expectOneScreen(page);
    await expect(page.locator('#resBand')).toHaveText('Before November 18: timed practice and review');
  });
});

// ---------------------------------------------------------------------------
// Flow 19. Forced colors
// ---------------------------------------------------------------------------

test.describe('flow 19: forced colors', () => {
  test('Q3 with picks and a revisited Q2 show the selection', async ({ page }, testInfo) => {
    await setup(page);
    await page.emulateMedia({ forcedColors: 'active' });
    await openQuiz(page);
    await page.locator('#startBtn').click();
    await pick(page, 1, 'parent');
    await pick(page, 2, '8');
    await atQuestion(page, 3);
    await settle(page);
    await chip(page, 'stuyvesant').click();
    await chip(page, 'brooklyn_latin').click();
    // Chromium forces author border colors to CanvasText, so the selected chip shows a 3 px
    // border against 1 px; the indicators opt out (forced-color-adjust: none) and use Highlight.
    const look = (code) => chip(page, code).evaluate((el) => {
      const probe = document.createElement('span');
      probe.style.forcedColorAdjust = 'none';
      probe.style.backgroundColor = 'Highlight';
      document.body.appendChild(probe);
      const highlight = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const mark = el.querySelector('.chip-check, .chip-radio');
      return {
        width: getComputedStyle(el).borderTopWidth,
        highlight,
        markBg: getComputedStyle(mark).backgroundColor,
        dotBg: getComputedStyle(mark, '::after').backgroundColor
      };
    });
    const on = await look('stuyvesant');
    const off = await look('bronx_science');
    expect(on.width).toBe('3px');
    expect(off.width).toBe('1px');
    expect(on.markBg, 'the selected check box is filled with Highlight').toBe(on.highlight);
    expect(off.markBg).not.toBe(off.highlight);
    await testInfo.attach('forced-colors-q3', { body: await page.screenshot(), contentType: 'image/png' });

    await settle(page);
    await page.locator('#qBack').click();
    await atQuestion(page, 2);
    const g = await look('8');
    expect(g.width).toBe('3px');
    expect(g.dotBg, 'the selected radio has a Highlight dot').toBe(g.highlight);
    const g7 = await look('7');
    expect(g7.width).toBe('1px');
    expect(g7.dotBg).not.toBe(g7.highlight);
    await testInfo.attach('forced-colors-q2-revisit', { body: await page.screenshot(), contentType: 'image/png' });
  });
});

// ---------------------------------------------------------------------------
// Flow 20. Reduced motion
// ---------------------------------------------------------------------------

test.describe('flow 20: reduced motion', () => {
  test('no animations run, and the results are fully visible at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const h = await setup(page);
    await openQuiz(page);
    const motion = () => page.evaluate(() => ({
      running: document.getAnimations().length,
      panel: getComputedStyle(document.getElementById('qPanel')).animationName,
      bar: getComputedStyle(document.querySelector('#quizProgress span')).transitionDuration,
      scroll: getComputedStyle(document.documentElement).scrollBehavior
    }));
    await page.locator('#startBtn').click();
    for (const [n, code] of [[1, 'parent'], [2, '8']]) {
      await atQuestion(page, n);
      expect(await motion()).toEqual({ running: 0, panel: 'none', bar: '0s', scroll: 'auto' });
      await settle(page);
      await chip(page, code).click();
    }
    await pickTargets(page, ['stuyvesant']);
    await pick(page, 4, 'tutor');
    await pick(page, 5, 'no');
    await pick(page, 6, 'ela');
    await fillGate(page, h.person);
    await submitGate(page);
    await expect(page.locator('#scrResults')).toBeVisible();
    const res = await page.evaluate(() => {
      const hidden = [];
      document.querySelectorAll('#scrResults *').forEach((el) => {
        if (el.closest('[hidden]')) return;
        if (getComputedStyle(el).opacity !== '1') hidden.push(el.id || el.className);
      });
      return { running: document.getAnimations().length, hidden };
    });
    expect(res).toEqual({ running: 0, hidden: [] });
  });
});

// ---------------------------------------------------------------------------
// Texter card without the photo (launch prerequisite: assets/vicente.jpg)
// ---------------------------------------------------------------------------

test.describe('texter card', () => {
  test('with TEXTER complete but no photo file, the card shows its line and hides the broken image', async ({ page }) => {
    const h = await setup(page, { flags: { TEXTER: { name: 'Vicente', role: 'E2E role line', photo: '/assets/vicente.jpg' } } });
    await openQuiz(page);
    await answerAll(page, PARENT8);
    await expect(page.locator('#gateTexter')).toBeVisible();
    await expect(page.locator('#gateTexter .texter-line')).toHaveText('Vicente, E2E role line, IvyPath Academy');
    await expect(page.locator('#gateTexter img')).toBeHidden();
    await fillGate(page, h.person);
    await submitGate(page);
    await expect(page.locator('#resTexter')).toBeVisible();
    await expect(page.locator('#resTexter .texter-line')).toHaveText('Vicente, E2E role line, IvyPath Academy');
    await expect(page.locator('#resTexter img')).toBeHidden();
  });
});

// ---------------------------------------------------------------------------
// 8.3 Accessibility: axe
// ---------------------------------------------------------------------------

test.describe('8.3 axe', () => {
  test('0 serious or critical violations on the intro, each question, the gate, each band and the student exit', async ({ page }) => {
    test.setTimeout(180000);
    const h = await setup(page);
    await openQuiz(page);
    const found = [];
    const scan = async (where) => {
      await quiet(page);
      const r = await new AxeBuilder({ page }).analyze();
      for (const v of r.violations) {
        if (v.impact !== 'serious' && v.impact !== 'critical') continue;
        found.push(where + ': ' + v.id + ' (' + v.impact + ') ' + v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | '));
      }
    };
    await scan('intro');
    for (let q = 1; q <= 6; q++) {
      await inject(page, { state: makeState(Object.assign({}, PARENT8), 'q' + q) });
      await scan('Q' + q);
    }
    await inject(page, { state: makeState(PARENT8, 'gate') });
    await scan('gate, empty');
    await submitGate(page);
    await expect(page.locator('#gNameErr')).not.toHaveText('');
    await scan('gate with errors');
    await page.locator('#gEmail').fill('sam@nycstudents.net');
    await page.locator('#gName').fill('Sam Rivera');
    await page.locator('#gPhone').fill(h.person.typed);
    await page.locator('#gConsent').check();
    await submitGate(page);
    await expect(page.locator('#gateAlert')).toHaveText(SCHOOL_MSG);
    await scan('gate with the school email message');
    const BANDS = [
      ['final_weeks_baseline', PARENT8, DAY0],
      ['final_weeks_focus', Object.assign({}, PARENT8, { practice_test: 'once', prep: 'none' }), DAY0],
      ['final_weeks_sharpen', Object.assign({}, PARENT8, { practice_test: 'multiple', prep: 'tutor' }), DAY0],
      ['full_year', Object.assign({}, PARENT8, { grade: 7 }), DAY0],
      ['foundation', Object.assign({}, PARENT8, { grade: 6 }), DAY0],
      ['early_start', Object.assign({}, PARENT8, { grade: 5 }), DAY0],
      ['after_test', Object.assign({}, PARENT8, { grade: 9 }), '2026-11-19']
    ];
    for (const [band, answers, today] of BANDS) {
      expect(Q.bandFor(answers, today)).toBe(band);
      await inject(page, { hooks: { today, nowMin: IN_WINDOW, flags: { PLAN_COPY: true } }, state: makeState(answers, 'results', true), handoff: makeHandoff(answers, band, h.person) });
      await expect(page.locator('#resBand')).toHaveText(Q.bandCopy(band, today).name);
      await scan('results ' + band);
    }
    await inject(page, { state: makeState({ role: 'student' }, 'exit') });
    await scan('student exit');
    expect(found, found.join('\n')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 8.3 Keyboard-only run
// ---------------------------------------------------------------------------

async function focusInfo(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body || el === document.documentElement) return { none: true };
    const cs = getComputedStyle(el);
    return {
      none: false,
      ring: el.matches(':focus-visible') && cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2,
      color: cs.outlineColor,
      desc: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ' "' + (el.textContent || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 40) + '"'
    };
  });
}

async function tabUntil(page, selector, opts) {
  const o = Object.assign({ shift: false, max: 40, seen: null }, opts || {});
  for (let i = 0; i < o.max; i++) {
    await page.keyboard.press(o.shift ? 'Shift+Tab' : 'Tab');
    const f = await focusInfo(page);
    if (f.none) continue; // focus left the document for a moment (past the last element)
    expect(f.ring, 'visible focus on ' + f.desc).toBe(true);
    if (o.seen) o.seen.push(f);
    if (await page.evaluate((s) => !!document.activeElement && document.activeElement.matches(s), selector)) return f;
  }
  throw new Error('Tab never reached ' + selector);
}

test.describe('8.3 keyboard-only run', () => {
  test('the whole flow with Tab, Shift+Tab, Enter and Space, with focus always visible', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== DESKTOP, 'keyboard run on the desktop project');
    const h = await setup(page);
    await openQuiz(page);
    await tabUntil(page, '.top-phone');
    await tabUntil(page, '#startBtn');
    await page.keyboard.press('Enter');
    await atQuestion(page, 1);
    await tabUntil(page, '.choice-chip[data-v="parent"]');
    await page.keyboard.press('Space');
    await atQuestion(page, 2);
    await tabUntil(page, '.choice-chip[data-v="8"]');
    await page.keyboard.press('Enter');
    await atQuestion(page, 3);
    await tabUntil(page, '.choice-chip[data-v="stuyvesant"]');
    await page.keyboard.press('Space');
    await expect(chip(page, 'stuyvesant')).toHaveAttribute('aria-pressed', 'true');
    await tabUntil(page, '#qContinue');
    await page.keyboard.press('Enter');
    await atQuestion(page, 4);
    // Shift+Tab reaches Back, and Back works from the keyboard.
    await tabUntil(page, '#qBack', { shift: true });
    await page.keyboard.press('Enter');
    await atQuestion(page, 3);
    await tabUntil(page, '#qContinue');
    await page.keyboard.press('Space');
    await atQuestion(page, 4);
    await tabUntil(page, '.choice-chip[data-v="self"]');
    await page.keyboard.press('Space');
    await atQuestion(page, 5);
    await tabUntil(page, '.choice-chip[data-v="no"]');
    await page.keyboard.press('Enter');
    await atQuestion(page, 6);
    await tabUntil(page, '.choice-chip[data-v="math"]');
    await page.keyboard.press('Space');
    await expect(page.locator('#scrGate')).toBeVisible();
    await tabUntil(page, '#gName');
    await page.keyboard.type(h.person.name);
    await tabUntil(page, '#gPhone');
    await page.keyboard.type(h.person.typed);
    await tabUntil(page, '#gEmail');
    await page.keyboard.type(h.person.email);
    await tabUntil(page, '#gConsent');
    await page.keyboard.press('Space');
    await expect(page.locator('#gConsent')).toBeChecked();
    await tabUntil(page, '#gateSubmit');
    await page.keyboard.press('Enter');
    await expect(page.locator('#scrResults')).toBeVisible();
    await expect(page.locator('#resTitle')).toBeFocused();

    // Through the dark "What happens next" block, the rest of the results and the footer.
    const seen = [];
    const consult = await tabUntil(page, '#consultBtn', { seen });
    expect(consult.color, 'cream focus ring on the dark block').toBe('rgb(253, 248, 240)');
    await tabUntil(page, '.reassurance a', { seen });
    await tabUntil(page, '#resCallLine a', { seen });
    await tabUntil(page, '#dStudent', { seen });
    await tabUntil(page, '#diagSubmit', { seen });
    await tabUntil(page, '#printBtn', { seen });
    const privacy = await tabUntil(page, '.site-footer a[href="/privacy.html"]', { seen });
    expect(privacy.color, 'cream focus ring in the footer').toBe('rgb(253, 248, 240)');
    await tabUntil(page, '.site-footer a[href="/terms.html"]', { seen });
    // Back up to the top bar.
    await tabUntil(page, '.top-phone', { shift: true, max: 60 });
    // The diagnostic form from the keyboard.
    await tabUntil(page, '#diagSubmit', { max: 60 });
    await page.keyboard.press('Enter');
    await expect(page.locator('#diagSuccess')).toBeFocused();
  });
});

// ---------------------------------------------------------------------------
// 8.3 Zoom, 320 px and text spacing; AC1
// ---------------------------------------------------------------------------

test.describe('8.3 zoom and text spacing', () => {
  test('nothing scrolls sideways or clips, on every screen', async ({ page }, testInfo) => {
    test.setTimeout(120000);
    const h = await setup(page);
    await openQuiz(page);
    const variant = testInfo.project.name === DESKTOP ? '200% zoom' : (testInfo.project.name === SMALL ? '320 px with WCAG 1.4.12 text spacing' : '390 px');
    if (testInfo.project.name === DESKTOP) await page.setViewportSize({ width: 640, height: 400 }); // 1280x800 at 200%
    const spacing = testInfo.project.name === SMALL;
    const applySpacing = async () => {
      if (!spacing) return;
      await page.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }' });
    };
    const check = async (where) => {
      await applySpacing();
      expect(await horizontalOverflow(page), variant + ', ' + where).toEqual([]);
    };
    await check('intro');
    await inject(page, { state: makeState({ role: 'parent', grade: 8, targets: ['hsmse_ccny', 'american_studies_lehman'] }, 'q3') });
    await check('Q3');
    await inject(page, { state: makeState(PARENT8, 'gate') });
    await submitGate(page);
    await check('gate with errors');
    await inject(page, { hooks: { flags: { PLAN_COPY: true } }, state: makeState(PARENT8, 'results', true), handoff: makeHandoff(PARENT8, 'final_weeks_baseline', Object.assign({}, h.person, { email: 'a.very.long.parent.address.for.wrapping.e2e@example-long-domain.com' })) });
    await check('results');
    await inject(page, { state: makeState({ role: 'student' }, 'exit') });
    await check('exit');
  });
});

// ---------------------------------------------------------------------------
// 8.3 Contrast, from the rendered colors
// ---------------------------------------------------------------------------

function parseRgb(s) {
  const m = /rgba?\(([^)]+)\)/.exec(s);
  if (!m) throw new Error('not a color: ' + s);
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
}
function over(fg, bg) {
  return { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 };
}
function lum(c) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function ratio(fgS, bgS) {
  const bg = parseRgb(bgS);
  const fg = over(parseRgb(fgS), bg);
  const a = lum(fg);
  const b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test.describe('8.3 contrast', () => {
  test('each pair in the 8.3 table, computed from the rendered page', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== DESKTOP, 'colors do not depend on the viewport');
    const h = await setup(page);
    await openQuiz(page);
    const css = (sel, prop, pseudo) => page.locator(sel).first().evaluate((el, a) => getComputedStyle(el, a[1] || null)[a[0]], [prop, pseudo]);
    const cream = await css('body', 'backgroundColor');
    const white = 'rgb(255, 255, 255)';
    const rows = [];
    const row = (name, fg, bg, min) => rows.push({ name, ratio: Math.round(ratio(fg, bg) * 100) / 100, min });

    row('#8F6B37 eyebrow on cream', await css('#scrIntro .eyebrow', 'color'), cream, 4.5);
    row('#8F6B37 on white', await css('#scrIntro .eyebrow', 'color'), white, 4.5);
    row('--muted on cream', await css('.intro-sub', 'color'), cream, 5.25);
    row('--muted on white', await css('.intro-sub', 'color'), white, 5.25);
    row('white on sage (primary button)', await css('#startBtn', 'color'), await css('#startBtn', 'backgroundColor'), 4.85);

    await inject(page, { state: makeState(PARENT8, 'q2') });
    const radioBorder = await css('#qChoices .chip-radio', 'borderTopColor');
    row('--muted indicator border on the chip', radioBorder, await css('#qChoices .choice-chip', 'backgroundColor'), 3);
    row('--muted indicator border on white', radioBorder, white, 3);
    await page.keyboard.press('Tab'); // from the question heading to the first chip, so :focus-visible applies
    await expect(chip(page, '5')).toBeFocused();
    row('--sage-deep focus ring on cream', await css('#qChoices .choice-chip[data-v="5"]', 'outlineColor'), cream, 3);

    await inject(page, { state: makeState(PARENT8, 'results', true), handoff: makeHandoff(PARENT8, 'final_weeks_baseline', h.person) });
    const forest = await css('.disclaimer-section', 'backgroundColor');
    row('cream at 0.7 on --forest-deep (disclaimer)', await css('.disclaimer-section p', 'color'), forest, 6.75);
    row('cream at 0.7 on --forest-deep (footer)', await css('.site-footer p', 'color'), await css('.site-footer', 'backgroundColor'), 6.75);
    await page.keyboard.press('Tab'); // from the results heading to the consultation button
    await expect(page.locator('#consultBtn')).toBeFocused();
    row('cream focus ring on --forest-deep', await css('#consultBtn', 'outlineColor'), await css('.next-step', 'backgroundColor'), 12.15);

    await testInfo.attach('contrast', { body: JSON.stringify(rows, null, 2), contentType: 'application/json' });
    const failing = rows.filter((r) => r.ratio < r.min);
    expect(failing, JSON.stringify(rows, null, 2)).toEqual([]);
  });
});
