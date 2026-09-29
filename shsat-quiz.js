/* SHSAT plan quiz controller for /shsat/quiz.
   Spec: docs/specs/2026-09-27-shsat-quiz-design.md (sections 2, 4, 5, 6 and 7.1).

   Runs after tracking.js, school-email-guard.js and shsat-quiz-logic.js (all
   deferred, in that order). The logic (bands, dates, copy, validation) lives
   in window.IVP_QUIZ; this file only renders screens, keeps state, talks to
   the network and fires analytics. It works without tracking.js (ad blockers
   drop it): every tracking call is guarded.

   Rules this file keeps:
   - One screen at a time; inactive screens carry the hidden attribute (4.1).
   - One history entry for the whole quiz; one Back from the results leaves (4.4).
   - Name, email and phone never go into a URL, an analytics parameter, the
     console or ivp_quiz_v1. They live only in ivp_quiz_handoff and the POST
     bodies (5.1).
   - All user text is rendered with textContent (4.6).
   - Nothing fires at parse time; every event follows a user action (6.2).
   Copy is written with a plain ' and rendered with the typographic U+2019 by
   ty(), as the logic file does. */
(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Flags (spec 5.5). Each flip is a one-line PR.
  // -------------------------------------------------------------------------

  var QUIZ_BACKEND = 'site';        // 'platform' after the Phase 2 smoke test (AC-P1 to AC-P8) passes
  var PLAN_COPY = false;            // true only after the 9.1 deploy gate shows a plan copy arriving
  var DIAG_GRADES = [6, 7, 8];      // add 9 only when the platform confirms item E
  var SHOW_VSL = false;             // D6: off until the narration and transcript are fixed
  var TEXT_FROM_NUMBER = null;      // E.164, once Vicente confirms the number his texts come from
  var TEXTER = { name: 'Vicente', role: null, photo: null }; // role and photo ('/assets/vicente.jpg') from Vicente (9.1)
  var ZH_TEXTS = false;             // 2.10
  var G9_NOTE = null;               // true once T1_G9_NOTE is verified on the DOE page
  var T3_PROCESS_VERIFIED = false;  // true once every sentence of T3_PROCESS is verified on the DOE page
  var PLATFORM_BASE = 'https://app.ivypathacademy.com';
  var PLATFORM_TIMEOUT_MS = 15000;
  var SITE_TIMEOUT_MS = 15000;

  var F = {
    QUIZ_BACKEND: QUIZ_BACKEND,
    PLAN_COPY: PLAN_COPY,
    DIAG_GRADES: DIAG_GRADES,
    SHOW_VSL: SHOW_VSL,
    TEXT_FROM_NUMBER: TEXT_FROM_NUMBER,
    TEXTER: TEXTER,
    ZH_TEXTS: ZH_TEXTS,
    G9_NOTE: G9_NOTE,
    T3_PROCESS_VERIFIED: T3_PROCESS_VERIFIED,
    PLATFORM_BASE: PLATFORM_BASE,
    PLATFORM_TIMEOUT_MS: PLATFORM_TIMEOUT_MS,
    SITE_TIMEOUT_MS: SITE_TIMEOUT_MS
  };

  // The E2E tests override flags through a window.__IVP_QUIZ_FLAGS init script (5.5).
  try {
    var over = window.__IVP_QUIZ_FLAGS;
    if (over && typeof over === 'object') {
      for (var fk in F) if (Object.prototype.hasOwnProperty.call(F, fk) && Object.prototype.hasOwnProperty.call(over, fk)) F[fk] = over[fk];
    }
  } catch (e) {}

  // -------------------------------------------------------------------------
  // Constants and copy (spec 2)
  // -------------------------------------------------------------------------

  var STATE_KEY = 'ivp_quiz_v1';
  var HANDOFF_KEY = 'ivp_quiz_handoff';
  var HOUR = 3600000;
  var UNCAPTURED_TTL = 2 * HOUR;
  var CAPTURED_TTL = 24 * HOUR;
  var LEAD_REF_TTL = 2 * HOUR;
  var ADVANCE_MS = 260;
  var RENDER_GUARD_MS = 300;
  var STILL_SAVING_MS = 5000;
  var COPY_ONLY_TIMEOUT_MS = 10000;
  var SEND_LINK_TIMEOUT_MS = 15000;
  var COLLAPSE_WAIT_MS = 500;
  var MAX_BODY_BYTES = 4000;        // the server limit is 4 KB
  var SITE_URL = '/api/quiz-lead';
  var DIAG_APP_URL = 'https://app.ivypathacademy.com/free-diagnostic-shsat/';
  var IVP_SMS = '+19293940349';
  var IN_APP_UA = /FBAN|FBAV|Instagram|GSA\//;
  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gclid', 'fbclid', 'ref'];
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  var SITE_FIELDS = ['parent_name', 'phone', 'parent_email', 'consent'];
  var PLATFORM_FIELDS = ['parent_name', 'phone', 'parent_email'];

  var COPY = {
    pageTitle: '2-Minute SHSAT Plan for Parents | IvyPath Academy',
    titleTail: ' \u00b7 SHSAT plan for parents',
    titleGate: 'Last step',
    titleResults: 'Your plan',
    titleExit: 'This page is written for parents',
    disclosure: "At the end, we'll ask for your name, email and mobile number. You'll see your plan right away, and Vicente from IvyPath may text you to go over it.",
    disclosureCopy: "At the end, we'll ask for your name, email and mobile number. You'll see your plan right away, we'll email you a copy, and Vicente from IvyPath may text you to go over it.",
    q3Error: 'Pick at least one school, or choose Not sure yet.',
    q3Cleared: 'School picks cleared.',
    gateSub: "Your plan is ready. We'll show it right away.",
    gateSubCopy: "Your plan is ready. We'll show it right away and email you a copy.",
    phoneHelp: 'US mobile, for example (917) 555-0142. Vicente from IvyPath texts you himself, never before 8 AM or after 8:30 PM ET.',
    phoneHelpFrom: 'US mobile, for example (917) 555-0142. Vicente from IvyPath texts from {number}, never before 8 AM or after 8:30 PM ET.',
    emailHelp: "So we can reach you if a text doesn't get through, and to send the diagnostic link if you ask for it.",
    emailHelpCopy: "We'll email you a copy of this plan, and the diagnostic link if you ask for it.",
    submit: 'Show my plan',
    saving: 'Saving\u2026',
    stillSaving: 'Still saving\u2026',
    savingStatus: 'Saving your answers.',
    saveFailed: "We couldn't save that just now. Please try again. If it keeps happening, call or text (929) 394-0349.",
    tooMany: 'Too many tries in a short time. Please call or text (929) 394-0349.',
    smsBody: 'Hi, I just did the SHSAT plan on your site. My student is in {grade}. Please text me back.',
    copySending: 'Emailing a copy to {address}\u2026',
    copySent: 'A copy of this plan is on its way to {address}.',
    copyFailed: "We couldn't email your copy just now. You can save or print it below.",
    textNote: 'Or wait for a text: Vicente from IvyPath may text you {when} to find a time.',
    textFrom: ' Texts come from {number}, so you may want to save it.',
    callNow: ['Prefer to talk now? ', 'Call (929) 394-0349', '.'],
    callLater: ['Prefer to talk? ', 'Call (929) 394-0349', ' after 9 AM ET.'],
    doeLine: ['Official dates and how to register: ', "the DOE's specialized high schools page", ' (opens in a new tab).'],
    diagSubmit: 'Email the diagnostic link',
    diagSending: 'Sending\u2026',
    diagSent: 'Link sent to {address}. It works for 14 days, and the report still comes to you when your student finishes.',
    diagError: "We couldn't send the link just now. Please try again.",
    linkCopied: 'Link copied. Send it to a parent.',
    shareTitle: '2-minute SHSAT plan for parents'
  };

  function ty(s) { return String(s).replace(/'/g, '\u2019'); }

  // Substitutes after ty(), so an address with an apostrophe is shown as typed.
  function fill(template, key, value) {
    return ty(template).split('{' + key + '}').join(String(value));
  }

  // -------------------------------------------------------------------------
  // Small helpers
  // -------------------------------------------------------------------------

  var Q = null;
  var doc = document;
  function $(id) { return doc.getElementById(id); }
  function now() { return Date.now(); }
  function perfNow() {
    try { return window.performance && performance.now ? performance.now() : Date.now(); } catch (e) { return Date.now(); }
  }
  function has(list, v) {
    for (var i = 0; i < list.length; i++) if (list[i] === v) return true;
    return false;
  }
  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function today() { return Q.todayNY(); }
  function nowMin() { return Q.nowMinutesNY(); }

  function storeGet(key) {
    try {
      var raw = window.sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function storeSet(key, value) {
    try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  function historyState() {
    try { return window.history.state; } catch (e) { return null; }
  }
  function inQuizEntry() {
    var s = historyState();
    return !!(s && s.quiz === 1);
  }
  function pushHistory(step) {
    try { window.history.pushState({ quiz: 1, step: step }, ''); } catch (e) {}
  }
  function replaceHistory(value) {
    try { window.history.replaceState(value, ''); } catch (e) {}
  }

  // #quizStatus (polite). Cleared first, so the same words are announced again.
  var announceTimer = null;
  function announce(text) {
    var el = $('quizStatus');
    if (!el) return;
    clearTimeout(announceTimer);
    el.textContent = '';
    announceTimer = setTimeout(function () { el.textContent = text; }, 60);
  }

  // A role="alert" element: shown (the guard may have set display none), then written.
  // Identical text is cleared first so it is announced again.
  function setAlert(el, text) {
    if (!el) return;
    el.style.display = '';
    if (el.textContent === text && text) {
      el.textContent = '';
      setTimeout(function () { el.textContent = text; }, 60);
    } else {
      el.textContent = text;
    }
  }

  function focusEl(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (x) {} }
  }

  // -------------------------------------------------------------------------
  // Analytics (spec 6.2). No parameter ever holds PII.
  // -------------------------------------------------------------------------

  var minorFlag = false;

  function noTrack() {
    try { return window.__ivpNoTrack === 1 || doc.cookie.indexOf('ivp_notrack=1') > -1; } catch (e) { return false; }
  }
  function isMinor() {
    if (minorFlag) return true;
    try { return window.sessionStorage.getItem('ivp_minor') === '1'; } catch (e) { return false; }
  }
  // GA4 only (6.2). gtag sends an event with no send_to to every configured tag,
  // the Google Ads tag included, and quiz events carry answers, grade and band.
  // tracking.js publishes the GA4 id; without it, nothing is sent.
  function ga(name, params) {
    if (noTrack()) return;
    try {
      var id = window.ivpGa4Id;
      if (!id || typeof window.gtag !== 'function') return;
      var p = { send_to: id };
      if (params) for (var k in params) if (hasOwn(params, k)) p[k] = params[k];
      window.gtag('event', name, p);
    } catch (e) {}
  }
  function meta(name, params) {
    if (noTrack() || isMinor()) return;
    try {
      if (typeof window.fbq !== 'function') return;
      if (params) window.fbq('trackCustom', name, params);
      else window.fbq('trackCustom', name);
    } catch (e) {}
  }
  function adsQuizLead(quizId) {
    if (noTrack() || isMinor()) return;
    try { if (typeof window.ivypathTrackQuizLead === 'function') window.ivypathTrackQuizLead(quizId); } catch (e) {}
  }

  // Minor mode (D2, 6.2). tracking.js owns it; this fallback does the same if it is missing.
  // Entered on the Q1 student tap, and again by renderExit for a reload on the exit screen.
  function enterMinorMode() {
    if (minorFlag) return;
    minorFlag = true;
    try {
      if (typeof window.ivpMinorMode === 'function') { window.ivpMinorMode(); return; }
    } catch (e) {}
    try { window.sessionStorage.setItem('ivp_minor', '1'); } catch (e) {}
    try {
      if (typeof window.gtag === 'function') window.gtag('consent', 'update', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    } catch (e) {}
    try { if (typeof window.fbq === 'function') window.fbq('consent', 'revoke'); } catch (e) {}
  }

  // -------------------------------------------------------------------------
  // State (spec 5.1) and the booking handoff (7.1)
  // -------------------------------------------------------------------------

  var state = null;
  var memHandoff = null; // used when sessionStorage is blocked

  function newState() {
    return {
      v: 1, quiz_id: Q.newQuizId(), started_at: now(), step: 'q1',
      answers: {}, band: null,
      captured: false, captured_at: null, backend: null,
      lead_ref: null, lead_ref_at: null, diag_allowed: null,
      plan_emailed: null, hp: false, fired: {}
    };
  }

  function saveState() { if (state) storeSet(STATE_KEY, state); }

  function loadState() {
    var s = storeGet(STATE_KEY);
    if (!s || typeof s !== 'object' || s.v !== 1 || !Q.isUuid(s.quiz_id) || typeof s.started_at !== 'number') return null;
    if (!s.answers || typeof s.answers !== 'object' || Array.isArray(s.answers)) s.answers = {};
    if (!s.fired || typeof s.fired !== 'object') s.fired = {};
    var t = now();
    if (s.captured === true) return typeof s.captured_at === 'number' && t - s.captured_at < CAPTURED_TTL ? s : null;
    s.captured = false;
    return t - s.started_at < UNCAPTURED_TTL ? s : null;
  }

  function fireOnce(key, fn) {
    if (!state || state.fired[key]) return;
    state.fired[key] = true;
    saveState();
    try { fn(); } catch (e) {}
  }

  function writeHandoff(f) {
    var a = state.answers;
    var h = {
      v: 1, quiz_id: state.quiz_id, saved_at: now(), captured: false,
      name: f.name, email: f.email, phone: f.phone,
      grade: a.grade, targets: a.targets.slice(), prep: a.prep, practice_test: a.practice_test,
      worry: a.worry, band: state.band
    };
    memHandoff = h;
    storeSet(HANDOFF_KEY, h);
  }

  function markHandoffCaptured() {
    var h = storeGet(HANDOFF_KEY);
    if (h && state && h.quiz_id === state.quiz_id) {
      h.captured = true;
      storeSet(HANDOFF_KEY, h);
    }
    if (memHandoff) memHandoff.captured = true;
  }

  function readHandoff() {
    var h = storeGet(HANDOFF_KEY) || memHandoff;
    if (!h || typeof h !== 'object' || h.v !== 1 || !state || h.quiz_id !== state.quiz_id) return null;
    if (typeof h.saved_at !== 'number' || now() - h.saved_at >= CAPTURED_TTL) return null;
    return h;
  }

  // -------------------------------------------------------------------------
  // Attribution (spec 6.1)
  // -------------------------------------------------------------------------

  function firstTouch() {
    try { return typeof window.ivpAttribution === 'function' ? (window.ivpAttribution() || {}) : {}; } catch (e) { return {}; }
  }

  function quizAttribution() {
    var out = {};
    var params = null;
    try { params = new URLSearchParams(window.location.search); } catch (e) {}
    var ft = firstTouch();
    for (var i = 0; i < ATTR_KEYS.length; i++) {
      var k = ATTR_KEYS[i];
      var v = params ? params.get(k) : null;
      if (!v && typeof ft[k] === 'string') v = ft[k];
      if (typeof v === 'string' && v) out[k] = v.slice(0, 200);
    }
    out.ivp_lp = '/shsat/quiz';
    try {
      if (doc.referrer) {
        var ru = new URL(doc.referrer);
        out.referrer = /^https?:$/.test(ru.protocol) ? ru.origin : (ru.hostname ? ru.protocol + '//' + ru.hostname : 'unknown');
      }
    } catch (e) {}
    if (typeof ft.first_landing === 'string' && ft.first_landing) out.first_landing = ft.first_landing.slice(0, 200);
    if (typeof ft.first_referrer === 'string' && ft.first_referrer) out.first_referrer = ft.first_referrer.slice(0, 200);
    out.v = 'parent';
    return out;
  }

  function byteLength(s) {
    try { return unescape(encodeURIComponent(s)).length; } catch (e) { return s.length * 3; }
  }

  // Keeps the POST under the server's 4 KB limit by trimming attribution only.
  function fitBody(body) {
    if (byteLength(JSON.stringify(body)) <= MAX_BODY_BYTES) return body;
    var a = body.attribution || {};
    for (var k in a) if (hasOwn(a, k) && typeof a[k] === 'string') a[k] = a[k].slice(0, 80);
    if (byteLength(JSON.stringify(body)) <= MAX_BODY_BYTES) return body;
    body.attribution = { ivp_lp: '/shsat/quiz', v: 'parent' };
    return body;
  }

  // -------------------------------------------------------------------------
  // Network (spec 5.3, 5.4)
  // -------------------------------------------------------------------------

  // Resolves { status, body } or { status: 0, kind: 'network' | 'timeout', body: null }. Never rejects.
  function postJSON(url, body, timeoutMs) {
    return new Promise(function (resolve) {
      var settled = false;
      var ctrl = null;
      try { ctrl = typeof AbortController === 'function' ? new AbortController() : null; } catch (e) {}
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        try { if (ctrl) ctrl.abort(); } catch (e) {}
        resolve({ status: 0, kind: 'timeout', body: null });
      }, timeoutMs);
      function finish(result) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      }
      try {
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: ctrl ? ctrl.signal : undefined
        }).then(function (r) {
          return r.text().then(function (text) {
            var parsed = null;
            try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = null; }
            finish({ status: r.status, body: parsed && typeof parsed === 'object' ? parsed : null });
          }, function () { finish({ status: r.status, body: null }); });
        }, function () {
          finish({ status: 0, kind: 'network', body: null });
        });
      } catch (e) {
        finish({ status: 0, kind: 'network', body: null });
      }
    });
  }

  function statusLabel(r) { return r.status ? r.status : r.kind; }

  function fieldOf(r, allowed) {
    return r.body && typeof r.body.field === 'string' && has(allowed, r.body.field) ? r.body.field : null;
  }

  function errorOf(r) {
    return r.body && typeof r.body.error === 'string' && r.body.error ? r.body.error : '';
  }

  // Outcomes: ok | field | rate | fail
  function saveToSite(body, backend) {
    return postJSON(SITE_URL, body, F.SITE_TIMEOUT_MS).then(function (r) {
      if (r.status === 200 && r.body && r.body.ok === true) {
        return { kind: 'ok', backend: backend, planEmailed: r.body.plan_emailed === true, leadRef: null, diagAllowed: null };
      }
      var field = fieldOf(r, SITE_FIELDS);
      if (r.status === 400 && field) return { kind: 'field', field: field, error: errorOf(r) };
      if (r.status === 429) return { kind: 'rate', error: errorOf(r) };
      return { kind: 'fail', status: statusLabel(r), backend: 'site' };
    });
  }

  // D4: only a 200, a 429 and a 400 on a parent-fixable field are final. Everything else falls back.
  function saveToPlatform(body, attempt) {
    return postJSON(F.PLATFORM_BASE + '/api/funnel/quiz-lead', body, F.PLATFORM_TIMEOUT_MS).then(function (r) {
      if (r.status === 200 && r.body && r.body.ok === true) {
        return {
          kind: 'ok',
          backend: 'platform',
          planEmailed: null,
          leadRef: typeof r.body.lead_ref === 'string' && r.body.lead_ref ? r.body.lead_ref : null,
          diagAllowed: typeof r.body.diagnostic_link_allowed === 'boolean' ? r.body.diagnostic_link_allowed : null
        };
      }
      var field = fieldOf(r, PLATFORM_FIELDS);
      if (r.status === 400 && field) return { kind: 'field', field: field, error: errorOf(r) };
      if (r.status === 429) return { kind: 'rate', error: errorOf(r) };
      ga('quiz_lead_failed', { status: statusLabel(r), backend: 'platform', attempt: attempt });
      var fb = JSON.parse(JSON.stringify(body));
      fb.delivery = F.PLAN_COPY ? 'alert_and_copy' : 'alert_only';
      fb.fallback_reason = 'platform_' + String(statusLabel(r));
      if (fb.attribution) fb.attribution.v = 'parent';
      return saveToSite(fb, 'site_fallback');
    });
  }

  // -------------------------------------------------------------------------
  // Steps and rendering (spec 4.1, 4.4, 4.5)
  // -------------------------------------------------------------------------

  var current = null;      // the rendered step
  var advancing = false;   // the 4.3 re-entry lock
  var advanceTimer = null;
  var renderedAt = 0;
  var collapsing = false;
  var collapseTimer = null;

  var SCREENS = { intro: 'scrIntro', question: 'scrQuestion', gate: 'scrGate', exit: 'scrExit', results: 'scrResults' };
  var HEADINGS = { intro: 'introTitle', question: 'qTitle', gate: 'gateTitle', exit: 'exitTitle', results: 'resTitle' };

  function qIndex(step) {
    var m = /^q([1-6])$/.exec(step || '');
    return m ? +m[1] : 0;
  }

  function screenOf(step) { return qIndex(step) ? 'question' : step; }

  function stepForQuestion(id) {
    for (var i = 0; i < Q.QUESTIONS.length; i++) if (Q.QUESTIONS[i].id === id) return 'q' + (i + 1);
    return 'q1';
  }

  function prevStep(step) {
    var n = qIndex(step);
    if (n === 1) return 'intro';
    if (n > 1) return 'q' + (n - 1);
    if (step === 'gate') return 'q6';
    if (step === 'exit') return 'q1';
    if (step === 'results') return 'gate';
    return 'intro';
  }

  // 2.7: a step that needs an answer the quiz does not have goes to the first unanswered question.
  function resolveStep(step) {
    if (!state || step === 'intro') return 'intro';
    var a = state.answers;
    var miss = Q.firstMissing(a);
    var missStep = miss ? stepForQuestion(miss) : null;
    if (step === 'exit') return a.role === 'student' ? 'exit' : (missStep || 'q1');
    var n = qIndex(step);
    if (n) {
      if (n > 1 && a.role === 'student') return 'q1';
      if (missStep && qIndex(missStep) < n) return missStep;
      return step;
    }
    if (step === 'gate' || step === 'results') {
      if (a.role !== 'parent') return missStep || 'q1';
      return missStep || step;
    }
    return 'intro';
  }

  function setTitle(step) {
    var n = qIndex(step);
    var t = COPY.pageTitle;
    if (n) t = 'Question ' + n + ' of 6' + COPY.titleTail;
    else if (step === 'gate') t = COPY.titleGate + COPY.titleTail;
    else if (step === 'results') t = COPY.titleResults + COPY.titleTail;
    else if (step === 'exit') t = COPY.titleExit + COPY.titleTail;
    doc.title = t;
  }

  function setProgress(step) {
    var bar = $('quizProgress');
    if (!bar) return;
    var n = qIndex(step);
    var w = n ? (n - 1) / 7 : (step === 'gate' ? 6 / 7 : 0);
    bar.hidden = step === 'results' || step === 'exit';
    bar.firstElementChild.style.width = (w * 100).toFixed(2) + '%';
  }

  // opts: { push, noHistory, initial }
  function go(step, opts) {
    opts = opts || {};
    clearTimeout(advanceTimer); // a Back or popstate during the 260 ms advance wins
    step = resolveStep(step);
    var screen = screenOf(step);
    for (var k in SCREENS) if (hasOwn(SCREENS, k)) $(SCREENS[k]).hidden = k !== screen;
    $('disclaimer').hidden = !(screen === 'results' || screen === 'exit');
    $('quizMain').className = 'quiz-shell' + (screen === 'results' ? ' is-results' : '');

    if (screen === 'intro') renderIntro();
    else if (screen === 'question') renderQuestion(qIndex(step));
    else if (screen === 'gate') renderGate();
    else if (screen === 'exit') renderExit();
    else if (screen === 'results') renderResults();

    current = step;
    if (state) {
      state.step = step;
      saveState();
    }
    if (opts.push) pushHistory(step);
    else if (!opts.noHistory && inQuizEntry()) replaceHistory({ quiz: 1, step: step });

    setProgress(step);
    setTitle(step);
    if (!opts.initial) {
      try { window.scrollTo(0, 0); } catch (e) {}
      focusEl($(HEADINGS[screen]));
    }
    advancing = false;
    renderedAt = perfNow();
  }

  // ---- Intro (2.2) --------------------------------------------------------

  function renderIntro() {
    $('introDisclosure').textContent = ty(F.PLAN_COPY ? COPY.disclosureCopy : COPY.disclosure);
    var line = '';
    try { line = Q.introDateLine(today()); } catch (e) { line = ''; }
    var el = $('introDate');
    el.textContent = line;
    el.hidden = !line;
  }

  function onStart() {
    if (!state || state.captured) {
      state = newState();
      saveState();
    }
    var push = !inQuizEntry();
    fireOnce('quiz_started', function () {
      ga('quiz_started', { quiz: 'shsat_plan', quiz_version: 1 });
      meta('QuizStarted');
    });
    go('q1', { push: push });
  }

  // ---- Questions (2.3, 4.3) -----------------------------------------------

  var SVG_NS = 'http://www.w3.org/2000/svg';

  function checkMark() {
    var svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');
    var path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', 'M3.5 8.5l3 3 6-7');
    svg.appendChild(path);
    return svg;
  }

  function answerCode(qid, raw) {
    if (qid === 'grade') return parseInt(raw, 10);
    return raw;
  }

  function isPressed(q, code) {
    var a = state.answers;
    if (q.multi) return Array.isArray(a.targets) && has(a.targets, code);
    return a[q.id] === code;
  }

  function renderQuestion(n) {
    var q = Q.QUESTIONS[n - 1];
    var label = 'Question ' + n + ' of 6';
    $('qStep').textContent = label;
    $('qTitleSr').textContent = label + ': ';
    $('qTitleText').textContent = q.title;

    var hint = $('qHint');
    hint.textContent = q.hint || '';
    hint.hidden = !q.hint;

    var list = $('qChoices');
    list.className = 'choice-list' + (q.multi ? ' is-multi' : '');
    list.setAttribute('aria-describedby', q.multi ? 'qHint' : (q.hint ? 'qHint qAutoHint' : 'qAutoHint'));
    while (list.firstChild) list.removeChild(list.firstChild);
    for (var i = 0; i < q.options.length; i++) {
      var o = q.options[i];
      var chip = doc.createElement('button');
      chip.type = 'button';
      chip.className = 'choice-chip';
      chip.setAttribute('data-v', String(o.code));
      chip.setAttribute('aria-pressed', isPressed(q, o.code) ? 'true' : 'false');
      var mark = doc.createElement('span');
      mark.className = q.multi ? 'chip-check' : 'chip-radio';
      mark.setAttribute('aria-hidden', 'true');
      if (q.multi) mark.appendChild(checkMark());
      var text = doc.createElement('span');
      text.className = 'chip-label';
      text.textContent = o.label;
      chip.appendChild(mark);
      chip.appendChild(text);
      list.appendChild(chip);
    }

    $('qError').textContent = '';
    $('qContinue').hidden = !q.multi;

    var panel = $('qPanel');
    panel.classList.remove('q-anim');
    void panel.offsetWidth; // restart qIn
    panel.classList.add('q-anim');
  }

  function answered(q, n, answer) {
    fireOnce('qa_' + q.id, function () {
      ga('quiz_question_answered', { question_id: q.id, question_index: n, answer: String(answer).slice(0, 100) });
    });
  }

  function tooSoon(e) {
    return e && e.detail > 0 && perfNow() - renderedAt < RENDER_GUARD_MS;
  }

  function nextAfter(n, code) {
    if (n === 1) return code === 'student' ? 'exit' : 'q2';
    if (n === 6) return 'gate';
    return 'q' + (n + 1);
  }

  function onChoiceClick(e) {
    var chip = e.target && e.target.closest ? e.target.closest('.choice-chip') : null;
    var n = qIndex(current);
    if (!chip || !n || !state) return;
    if (advancing || tooSoon(e)) return;
    var q = Q.QUESTIONS[n - 1];
    var code = answerCode(q.id, chip.getAttribute('data-v'));
    if (q.multi) {
      toggleTarget(code, chip.getAttribute('aria-pressed') !== 'true');
      return;
    }
    advancing = true;
    var chips = $('qChoices').querySelectorAll('.choice-chip');
    for (var i = 0; i < chips.length; i++) chips[i].setAttribute('aria-pressed', chips[i] === chip ? 'true' : 'false');
    state.answers[q.id] = code;
    saveState();
    // Minor mode first (D2, 6.2): ad consent is denied and the Pixel revoked before
    // the answer event goes out, and it holds if Back cancels the 260 ms advance.
    if (q.id === 'role' && code === 'student') enterMinorMode();
    answered(q, n, code);
    var renderedN = n;
    advanceTimer = setTimeout(function () { go(nextAfter(renderedN, code)); }, ADVANCE_MS);
  }

  // Q3: toggles in place, with no re-render, no qIn replay and no focus move.
  function toggleTarget(code, on) {
    var prev = Array.isArray(state.answers.targets) ? state.answers.targets : [];
    var picked = [];
    var cleared = false;
    if (code === 'not_sure') {
      if (on) {
        for (var i = 0; i < prev.length; i++) if (prev[i] !== 'not_sure') cleared = true;
        picked = ['not_sure'];
      }
    } else {
      for (var j = 0; j < prev.length; j++) if (prev[j] !== 'not_sure' && prev[j] !== code) picked.push(prev[j]);
      if (on) picked.push(code);
    }
    var ordered = [];
    for (var k = 0; k < Q.CODES.targets.length; k++) if (has(picked, Q.CODES.targets[k])) ordered.push(Q.CODES.targets[k]);
    state.answers.targets = ordered;
    saveState();
    var chips = $('qChoices').querySelectorAll('.choice-chip');
    for (var c = 0; c < chips.length; c++) chips[c].setAttribute('aria-pressed', has(ordered, chips[c].getAttribute('data-v')) ? 'true' : 'false');
    if (ordered.length) $('qError').textContent = '';
    if (cleared) announce(COPY.q3Cleared);
  }

  function onContinue(e) {
    if (current !== 'q3' || !state || advancing || tooSoon(e)) return;
    var t = state.answers.targets;
    if (!Array.isArray(t) || !t.length) {
      setAlert($('qError'), COPY.q3Error);
      return;
    }
    advancing = true;
    answered(Q.QUESTIONS[2], 3, t.join(','));
    go('q4');
  }

  function onQuestionBack() {
    if (!current) return;
    go(prevStep(current));
  }

  // ---- Student exit (2.4) -------------------------------------------------

  // Only the utm_* values travel with a known minor: no click ids, no first touch, no ref.
  function exitHref() {
    var a = quizAttribution();
    var parts = [];
    for (var i = 0; i < UTM_KEYS.length; i++) {
      if (a[UTM_KEYS[i]]) parts.push(UTM_KEYS[i] + '=' + encodeURIComponent(a[UTM_KEYS[i]]));
    }
    parts.push('ivp_lp=%2Fshsat%2Fquiz');
    parts.push('v=student');
    return DIAG_APP_URL + '?' + parts.join('&');
  }

  function renderExit() {
    enterMinorMode();
    fireOnce('quiz_student_exit', function () { ga('quiz_student_exit', {}); });
    $('exitDiag').setAttribute('href', exitHref());
    $('shareStatus').hidden = true;
    $('shareManual').hidden = true;
  }

  function shareUrl() {
    return window.location.origin + '/shsat/quiz?utm_source=student_share&utm_medium=quiz';
  }

  function shareManually(url) {
    var input = $('shareUrl');
    input.value = url;
    $('shareManual').hidden = false;
    ga('quiz_share', { method: 'manual' });
    focusEl(input);
    try { input.select(); } catch (e) {}
  }

  function shareByCopy(url) {
    var nav = window.navigator;
    if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      var p;
      try { p = nav.clipboard.writeText(url); } catch (e) { p = null; }
      if (p && typeof p.then === 'function') {
        p.then(function () {
          ga('quiz_share', { method: 'copy' });
          $('shareStatus').hidden = false;
          announce(COPY.linkCopied);
        }, function () { shareManually(url); });
        return;
      }
    }
    shareManually(url);
  }

  function onShare() {
    var url = shareUrl();
    var nav = window.navigator;
    if (typeof nav.share === 'function') {
      var p;
      try { p = nav.share({ title: COPY.shareTitle, url: url }); } catch (e) { p = null; }
      if (p && typeof p.then === 'function') {
        ga('quiz_share', { method: 'share' });
        p.then(null, function (err) {
          if (err && err.name === 'AbortError') return; // the sheet was closed on purpose
          shareByCopy(url);
        });
        return;
      }
    }
    shareByCopy(url);
  }

  function onExitBack() {
    if (!state) return;
    delete state.answers.role;
    saveState();
    go('q1');
  }

  // ---- Texter card (2.5, 2.6.4) -------------------------------------------

  function texterComplete() {
    var t = F.TEXTER;
    return !!(t && typeof t.name === 'string' && t.name && typeof t.role === 'string' && t.role &&
      typeof t.photo === 'string' && t.photo);
  }

  // Renders cleanly without the photo: a missing or broken image is hidden and the line stays.
  function fillTexter(el, show) {
    if (!el) return;
    if (!show || !texterComplete()) { el.hidden = true; return; }
    var img = el.querySelector('img');
    el.querySelector('.texter-line').textContent = F.TEXTER.name + ', ' + F.TEXTER.role + ', IvyPath Academy';
    if (img && !img.getAttribute('src')) {
      img.addEventListener('error', function () { img.hidden = true; });
      img.setAttribute('src', F.TEXTER.photo);
    }
    el.hidden = false;
  }

  // ---- Gate (2.5, 4.6) ----------------------------------------------------

  var FIELDS = {
    parent_name: { input: 'gName', err: 'gNameErr', help: null },
    phone: { input: 'gPhone', err: 'gPhoneErr', help: 'gPhoneHelp' },
    parent_email: { input: 'gEmail', err: 'gEmailErr', help: 'gEmailHelp' },
    consent: { input: 'gConsent', err: 'gConsentErr', help: null }
  };
  var FIELD_ORDER = ['parent_name', 'phone', 'parent_email', 'consent'];

  var saving = false;
  var failures = 0;
  var attempts = 0;
  var stillTimer = null;
  var preconnected = false;

  function setFieldError(key, msg) {
    var f = FIELDS[key];
    var input = $(f.input);
    $(f.err).textContent = msg;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', f.help ? f.err + ' ' + f.help : f.err);
  }

  function clearFieldError(key) {
    var f = FIELDS[key];
    var input = $(f.input);
    $(f.err).textContent = '';
    input.removeAttribute('aria-invalid');
    if (f.help) input.setAttribute('aria-describedby', f.help);
    else input.removeAttribute('aria-describedby');
  }

  function prefillGate() {
    var h = readHandoff();
    if (!h) return;
    if (!$('gName').value && typeof h.name === 'string') $('gName').value = h.name;
    if (!$('gPhone').value && typeof h.phone === 'string') $('gPhone').value = Q.formatUsPhone(h.phone);
    if (!$('gEmail').value && typeof h.email === 'string') $('gEmail').value = h.email;
  }

  function renderGate() {
    var a = state.answers;
    var t = today();
    state.band = Q.bandFor(a, t);
    var pv = Q.planPreview(a, t) || ['', '', ''];
    $('pvEyebrow').textContent = pv[0];
    $('pvBand').textContent = pv[1];
    $('pvLine').textContent = pv[2];
    $('pvLine').hidden = !pv[2];

    $('gateSub').textContent = ty(F.PLAN_COPY ? COPY.gateSubCopy : COPY.gateSub);
    $('gPhoneHelp').textContent = F.TEXT_FROM_NUMBER && Q.formatUsPhone(F.TEXT_FROM_NUMBER)
      ? fill(COPY.phoneHelpFrom, 'number', Q.formatUsPhone(F.TEXT_FROM_NUMBER))
      : ty(COPY.phoneHelp);
    $('gEmailHelp').textContent = ty(F.PLAN_COPY ? COPY.emailHelpCopy : COPY.emailHelp);
    $('gConsentText').textContent = Q.CONSENT_TEXT[Q.CONSENT_VERSION];
    fillTexter($('gateTexter'), true);
    prefillGate();
    if (failures >= 2) showRescue();

    fireOnce('quiz_gate_viewed', function () { ga('quiz_gate_viewed', { grade: a.grade }); });

    // 4.8 Phase 2 preconnect
    if (F.QUIZ_BACKEND === 'platform' && !preconnected) {
      preconnected = true;
      try {
        var link = doc.createElement('link');
        link.rel = 'preconnect';
        link.href = F.PLATFORM_BASE;
        link.crossOrigin = 'anonymous';
        doc.head.appendChild(link);
      } catch (e) {}
    }
  }

  function readGate() {
    var form = $('gateForm');
    var out = {
      name: Q.sanitizeName($('gName').value, 120),
      phone: Q.normalizeUsMobile($('gPhone').value),
      email: Q.normalizeEmail($('gEmail').value),
      consent: $('gConsent').checked === true,
      hp: '',
      errors: []
    };
    try {
      var hp = form.elements.ivp_hp_x;
      out.hp = hp && typeof hp.value === 'string' ? hp.value.slice(0, 200) : '';
    } catch (e) {}
    if (out.name.length < 2) out.errors.push(['parent_name', Q.ERRORS.name]);
    if (!out.phone) out.errors.push(['phone', Q.ERRORS.phone]);
    if (!Q.isValidEmail(out.email)) out.errors.push(['parent_email', Q.ERRORS.email]);
    else if (Q.isSchoolEmail(out.email)) out.errors.push(['parent_email', Q.ERRORS.school]); // if the guard did not load
    if (!out.consent) out.errors.push(['consent', Q.ERRORS.consent]);
    return out;
  }

  function buildBody(f) {
    var a = state.answers;
    return fitBody({
      quiz_id: state.quiz_id,
      test_type: 'SHSAT',
      parent_name: f.name,
      parent_email: f.email,
      phone: f.phone,
      student_grade: a.grade,
      consent: true,
      consent_version: Q.CONSENT_VERSION,
      quiz: {
        version: 1,
        role: 'parent',
        targets: a.targets.slice(),
        prep: a.prep,
        practice_test: a.practice_test,
        worry: a.worry,
        band: state.band
      },
      attribution: quizAttribution(),
      company_name: f.hp,
      delivery: F.PLAN_COPY ? 'alert_and_copy' : 'alert_only'
    });
  }

  function startSaving() {
    saving = true;
    attempts++;
    var btn = $('gateSubmit');
    btn.setAttribute('aria-disabled', 'true');
    btn.textContent = COPY.saving;
    announce(COPY.savingStatus);
    clearTimeout(stillTimer);
    stillTimer = setTimeout(function () { if (saving) btn.textContent = COPY.stillSaving; }, STILL_SAVING_MS);
  }

  function stopSaving() {
    saving = false;
    clearTimeout(stillTimer);
    var btn = $('gateSubmit');
    btn.removeAttribute('aria-disabled');
    btn.textContent = COPY.submit;
  }

  function showRescue() {
    var box = $('gateRescue');
    var wasHidden = box.hidden;
    var coarse = false;
    try { coarse = window.matchMedia('(pointer: coarse)').matches; } catch (e) {}
    var label = state && Q.LABELS.grade[state.answers.grade] ? Q.LABELS.grade[state.answers.grade] : '';
    $('rescueSmsLink').setAttribute('href', 'sms:' + IVP_SMS + '?&body=' +
      encodeURIComponent(COPY.smsBody.split('{grade}').join(label)));
    $('rescueSms').hidden = !coarse;
    $('rescueCall').hidden = coarse;
    box.hidden = false;
    return wasHidden;
  }

  function onGateSubmit(e) {
    e.preventDefault();
    if (saving || !state || current !== 'gate') return;
    var f = readGate();
    for (var i = 0; i < FIELD_ORDER.length; i++) clearFieldError(FIELD_ORDER[i]);
    if (f.errors.length) {
      for (var j = 0; j < f.errors.length; j++) setFieldError(f.errors[j][0], f.errors[j][1]);
      focusEl($(FIELDS[f.errors[0][0]].input));
      return;
    }
    var alertEl = $('gateAlert');
    alertEl.style.display = '';
    alertEl.textContent = '';

    state.band = Q.bandFor(state.answers, today());
    saveState();
    writeHandoff(f);
    var body = buildBody(f);
    startSaving();
    var attempt = attempts;
    var run = F.QUIZ_BACKEND === 'platform' ? saveToPlatform(body, attempt) : saveToSite(body, 'site');
    run.then(function (out) {
      stopSaving();
      handleOutcome(out, f, body, attempt);
    }, function () {
      stopSaving();
      handleOutcome({ kind: 'fail', status: 'error', backend: 'site' }, f, body, attempt);
    });
  }

  function handleOutcome(out, f, body, attempt) {
    var alertEl = $('gateAlert');
    if (out.kind === 'ok') {
      failures = 0;
      onCaptured(out, f, body);
      return;
    }
    if (out.kind === 'field') {
      failures = 0;
      var fallbackMsg = { parent_name: Q.ERRORS.name, phone: Q.ERRORS.phone, parent_email: Q.ERRORS.email, consent: Q.ERRORS.consent };
      setFieldError(out.field, out.error || fallbackMsg[out.field]);
      focusEl($(FIELDS[out.field].input));
      return;
    }
    if (out.kind === 'rate') {
      setAlert(alertEl, out.error || COPY.tooMany);
      showRescue();
      focusEl($('showAnyway'));
      return;
    }
    failures++;
    ga('quiz_lead_failed', { status: out.status, backend: out.backend || 'site', attempt: attempt });
    setAlert(alertEl, ty(COPY.saveFailed));
    if (failures >= 2) {
      showRescue();
      focusEl($('showAnyway'));
    }
    // First failure: focus stays on the submit button (it was never disabled).
  }

  function onCaptured(out, f, body) {
    state.captured = true;
    state.captured_at = now();
    state.backend = out.backend;
    state.lead_ref = out.leadRef || null;
    state.lead_ref_at = out.leadRef ? now() : null;
    state.diag_allowed = typeof out.diagAllowed === 'boolean' ? out.diagAllowed : null;
    state.plan_emailed = typeof out.planEmailed === 'boolean' ? out.planEmailed : null;
    state.hp = !!f.hp;
    saveState();
    markHandoffCaptured();

    if (!state.hp) {
      fireOnce('quiz_lead_captured', function () {
        ga('quiz_lead_captured', { grade: state.answers.grade, band: state.band, backend: state.backend });
        meta('QuizLead'); // no parameters: the band reveals the grade (6.2)
        adsQuizLead(state.quiz_id);
      });
    }

    // Phase 2: the plan copy goes through the site function, without holding up the results.
    if (out.backend === 'platform' && F.PLAN_COPY && !state.hp) {
      copyPending = true;
      var cb = JSON.parse(JSON.stringify(body));
      cb.delivery = 'copy_only';
      postJSON(SITE_URL, cb, COPY_ONLY_TIMEOUT_MS).then(function (r) {
        copyPending = false;
        state.plan_emailed = r.status === 200 && r.body && r.body.ok === true && r.body.plan_emailed === true;
        saveState();
        if (current === 'results') renderCopyStatus();
      });
    }

    collapseToResults();
  }

  // 4.4: collapse the quiz entry, so one Back from the results leaves the page.
  function collapseToResults() {
    if (inQuizEntry()) {
      collapsing = true;
      try { window.history.back(); } catch (e) { collapsing = false; }
      if (collapsing) {
        clearTimeout(collapseTimer);
        collapseTimer = setTimeout(finishCollapse, COLLAPSE_WAIT_MS);
        return;
      }
    }
    finishCollapse();
  }

  function finishCollapse() {
    clearTimeout(collapseTimer);
    collapsing = false;
    replaceHistory({ step: 'results' });
    go('results', { noHistory: true });
  }

  function onShowAnyway() {
    if (!state) return;
    go('results');
  }

  function onPopState(e) {
    var st = e ? e.state : null;
    if (collapsing) { finishCollapse(); return; }
    if (!state) {
      if (current !== 'intro') go('intro', { noHistory: true });
      return;
    }
    if (state.captured) {
      if (!st) replaceHistory({ step: 'results' });
      if (current !== 'results') go('results', { noHistory: true });
      return;
    }
    if (st && st.quiz === 1) {
      go(typeof st.step === 'string' ? st.step : 'q1', { noHistory: true });
      return;
    }
    // Back to the landing entry, before capture.
    if (!current || current === 'intro') return;
    if (current === 'q1') { go('intro', { noHistory: true }); return; }
    var prev = prevStep(current);
    pushHistory(prev);
    go(prev, { noHistory: true });
  }

  // ---- Results (2.6) ------------------------------------------------------

  var copyPending = false;
  var vslRendered = false;

  function renderCopyStatus() {
    var el = $('resCopyStatus');
    var h = readHandoff();
    var text = '';
    if (state.captured && F.PLAN_COPY && !state.hp && h && typeof h.email === 'string' && h.email) {
      if (state.plan_emailed === true) text = fill(COPY.copySent, 'address', h.email);
      else if (state.plan_emailed === false) text = fill(COPY.copyFailed, 'address', h.email);
      else if (copyPending) text = fill(COPY.copySending, 'address', h.email);
    }
    el.textContent = text;
  }

  function appendLinkLine(el, parts, href, opts) {
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(doc.createTextNode(ty(parts[0])));
    var a = doc.createElement('a');
    a.href = href;
    a.textContent = ty(parts[1]);
    if (opts && opts.newTab) { a.target = '_blank'; a.rel = 'noopener'; }
    el.appendChild(a);
    el.appendChild(doc.createTextNode(ty(parts[2])));
  }

  function renderNextStep() {
    var showNote = state.captured && !state.hp;
    var note = $('resTextNote');
    if (showNote) {
      var when = Q.textWindowState(nowMin()).parentPhrase;
      var s = fill(COPY.textNote, 'when', when);
      var from = F.TEXT_FROM_NUMBER ? Q.formatUsPhone(F.TEXT_FROM_NUMBER) : '';
      if (from) s += fill(COPY.textFrom, 'number', from);
      note.textContent = s;
    }
    note.hidden = !showNote;
    fillTexter($('resTexter'), showNote);
    var m = nowMin();
    appendLinkLine($('resCallLine'), m >= 540 && m < 1230 ? COPY.callNow : COPY.callLater, 'tel:' + IVP_SMS);
  }

  function renderWeekPlan(a, t) {
    var rows = Q.weekPlan(a, t);
    var list = $('resWeekList');
    while (list.firstChild) list.removeChild(list.firstChild);
    for (var i = 0; i < rows.length; i++) {
      var li = doc.createElement('li');
      var strong = doc.createElement('strong');
      strong.textContent = rows[i].label;
      var span = doc.createElement('span');
      span.textContent = rows[i].text;
      li.appendChild(strong);
      li.appendChild(span);
      list.appendChild(li);
    }
    $('resWeek').hidden = !rows.length;
  }

  function renderTakeaways(a, t) {
    var items = Q.takeawaysFor(a, t, { G9_NOTE: F.G9_NOTE, T3_PROCESS_VERIFIED: F.T3_PROCESS_VERIFIED === true });
    var list = $('resTakeawayList');
    while (list.firstChild) list.removeChild(list.firstChild);
    for (var i = 0; i < items.length; i++) {
      var li = doc.createElement('li');
      li.className = 'takeaway';
      var h3 = doc.createElement('h3');
      var num = doc.createElement('span');
      num.className = 'takeaway-n';
      num.textContent = String(i + 1);
      var dot = doc.createElement('span');
      dot.className = 'sr-only';
      dot.textContent = '. ';
      h3.appendChild(num);
      h3.appendChild(dot);
      h3.appendChild(doc.createTextNode(items[i].title));
      var p = doc.createElement('p');
      p.textContent = items[i].body;
      li.appendChild(h3);
      li.appendChild(p);
      if (/^T1_REG_/.test(items[i].id)) {
        var doe = doc.createElement('p');
        doe.className = 'doe-line';
        appendLinkLine(doe, COPY.doeLine, Q.DOE_SHS_URL, { newTab: true });
        li.appendChild(doe);
      }
      list.appendChild(li);
    }
    $('resTakeaways').hidden = !items.length;
  }

  function renderDiag(a) {
    var h = readHandoff();
    var kind = Q.diagnosticBlock(a.grade, {
      diagGrades: Array.isArray(F.DIAG_GRADES) ? F.DIAG_GRADES : DIAG_GRADES,
      leadRef: state.lead_ref,
      diagAllowed: state.diag_allowed,
      captured: state.captured === true,
      hasEmail: !!(h && typeof h.email === 'string' && h.email)
    });
    var sent = kind === 'form' && !!diagSentText;
    $('resDiag').hidden = kind === 'none';
    $('diagBody').hidden = kind === 'grade9';
    $('diagForm').hidden = kind !== 'form' || sent;
    $('diagG9').hidden = kind !== 'grade9';
    $('diagLink').hidden = kind !== 'link';
    $('diagSuccess').hidden = !sent;
    if (sent) $('diagSuccess').textContent = diagSentText;
    $('diagFallback').hidden = true;
  }

  function renderVsl() {
    if (!F.SHOW_VSL || vslRendered) return;
    var tpl = $('vslTpl');
    if (!tpl || !tpl.content) return;
    var frag = tpl.content.cloneNode(true);
    var tx = frag.querySelector('.vsl-transcript-text');
    if (!tx || !/\S/.test(tx.textContent || '')) return; // D6 (b): no corrected transcript, no video
    vslRendered = true;
    $('resVslSlot').appendChild(frag);
    var video = $('resVslSlot').querySelector('video');
    if (video) {
      video.addEventListener('play', function () {
        fireOnce('quiz_vsl_play', function () { ga('quiz_vsl_play', {}); });
      });
    }
  }

  function renderResults() {
    var a = state.answers;
    var t = today();
    var band = Q.bandFor(a, t);
    state.band = band;
    var copy = Q.bandCopy(band, t);
    $('resEyebrow').textContent = Q.eyebrowLine(band, t);
    $('resBand').textContent = copy.name;
    $('resSummary').textContent = copy.summary;
    renderCopyStatus();
    $('resSchools').textContent = Q.schoolsLine(a.targets, a.grade).join(' ');
    renderNextStep();
    renderWeekPlan(a, t);
    renderTakeaways(a, t);
    renderDiag(a);
    renderVsl();
    var ua = '';
    try { ua = window.navigator.userAgent || ''; } catch (e) {}
    $('resSave').hidden = IN_APP_UA.test(ua);
    fireOnce('quiz_completed', function () {
      ga('quiz_completed', { band: band, grade: a.grade, captured: state.captured === true });
    });
  }

  // ---- Diagnostic link (2.6.7, 5.3.2, 5.4) --------------------------------

  var diagSending = false;
  var diagSentText = ''; // keeps the success message across re-renders of the results

  function sendLinkPhase1(h, studentEmail) {
    return postJSON(F.PLATFORM_BASE + '/api/funnel/send-link', {
      test_type: 'SHSAT',
      parent_email: h.email,
      student_email: studentEmail,
      student_grade: state.answers.grade,
      consent: true,
      company_name: '',
      attribution: quizAttribution()
    }, SEND_LINK_TIMEOUT_MS);
  }

  function sendLinkByRef(studentEmail) {
    return postJSON(F.PLATFORM_BASE + '/api/funnel/quiz-lead/send-link', {
      lead_ref: state.lead_ref,
      student_email: studentEmail,
      company_name: ''
    }, SEND_LINK_TIMEOUT_MS);
  }

  function refExpired(r) {
    return r.status === 400 && r.body && (r.body.field === 'lead_ref' || r.body.error === 'expired');
  }

  function onDiagSubmit(e) {
    e.preventDefault();
    if (diagSending || !state) return;
    var input = $('dStudent');
    var alertEl = $('diagAlert');
    var h = readHandoff();
    alertEl.style.display = '';
    alertEl.textContent = '';
    input.removeAttribute('aria-invalid');
    $('diagFallback').hidden = true;

    var raw = input.value.replace(/^\s+|\s+$/g, '');
    var se = raw ? Q.normalizeEmail(raw) : '';
    var bad = se && !Q.isValidEmail(se) ? Q.ERRORS.email : (se && Q.isSchoolEmail(se) ? Q.ERRORS.school : '');
    if (bad) {
      input.setAttribute('aria-invalid', 'true');
      setAlert(alertEl, bad);
      focusEl(input);
      return;
    }
    if (!h || !h.email) {
      renderDiag(state.answers);
      return;
    }

    diagSending = true;
    var btn = $('diagSubmit');
    btn.setAttribute('aria-disabled', 'true');
    btn.textContent = COPY.diagSending;

    var useRef = !!(state.lead_ref && typeof state.lead_ref_at === 'number' && now() - state.lead_ref_at < LEAD_REF_TTL);
    var run = useRef
      ? sendLinkByRef(se).then(function (r) { return refExpired(r) ? sendLinkPhase1(h, se) : r; })
      : sendLinkPhase1(h, se);

    run.then(function (r) {
      diagSending = false;
      btn.removeAttribute('aria-disabled');
      btn.textContent = COPY.diagSubmit;
      if (r.status === 200 && r.body && r.body.ok === true) {
        var to = typeof r.body.sentTo === 'string' && r.body.sentTo ? r.body.sentTo : (se || h.email);
        var ok = $('diagSuccess');
        diagSentText = fill(COPY.diagSent, 'address', to);
        ok.textContent = diagSentText;
        $('diagForm').hidden = true;
        ok.hidden = false;
        focusEl(ok);
        ga('diagnostic_link_sent', { exam: 'SHSAT', source: 'shsat_quiz' });
        meta('DiagnosticLinkSent', { content_name: 'SHSAT Diagnostic Link Sent' });
        return;
      }
      setAlert(alertEl, errorOf(r) || ty(COPY.diagError));
      $('diagFallback').hidden = false;
    });
  }

  // -------------------------------------------------------------------------
  // Clicks tracked by the controller
  // -------------------------------------------------------------------------

  function bindTracking() {
    var ctas = doc.querySelectorAll('.js-diagnostic-cta');
    for (var i = 0; i < ctas.length; i++) {
      ctas[i].addEventListener('click', function () {
        if (this.id === 'exitDiag') this.setAttribute('href', exitHref()); // after any late decorator run
        ga('diagnostic_cta_click', { exam: 'SHSAT', source: 'shsat_quiz', placement: this.getAttribute('data-placement') || 'quiz' });
        meta('DiagnosticCTAClick', { content_name: 'SHSAT Diagnostic CTA Click' });
      });
    }
    $('consultBtn').addEventListener('click', function () {
      ga('consultation_clicked', { source: 'shsat_quiz', band: state && state.band ? state.band : '' });
    });
    $('rescueSmsLink').addEventListener('click', function () { ga('quiz_sms_fallback_clicked', {}); });
    $('printBtn').addEventListener('click', function () {
      ga('quiz_plan_saved', { band: state && state.band ? state.band : '' });
      try { window.print(); } catch (e) {}
    });
  }

  // -------------------------------------------------------------------------
  // Init
  // -------------------------------------------------------------------------

  function bind() {
    $('startBtn').addEventListener('click', onStart);
    $('qChoices').addEventListener('click', onChoiceClick);
    $('qContinue').addEventListener('click', onContinue);
    $('qBack').addEventListener('click', onQuestionBack);
    $('gateBack').addEventListener('click', function () { go('q6'); });
    $('exitBack').addEventListener('click', onExitBack);
    $('shareBtn').addEventListener('click', onShare);
    $('shareUrl').addEventListener('focus', function () { try { this.select(); } catch (e) {} });
    $('gateForm').addEventListener('submit', onGateSubmit);
    $('showAnyway').addEventListener('click', onShowAnyway);
    $('diagForm').addEventListener('submit', onDiagSubmit);

    // An error clears as soon as its field is edited.
    for (var i = 0; i < FIELD_ORDER.length; i++) {
      (function (key) {
        var input = $(FIELDS[key].input);
        var clear = function () { if (input.getAttribute('aria-invalid') === 'true' || $(FIELDS[key].err).textContent) clearFieldError(key); };
        input.addEventListener('input', clear);
        input.addEventListener('change', clear);
      })(FIELD_ORDER[i]);
    }
    $('dStudent').addEventListener('input', function () { this.removeAttribute('aria-invalid'); });

    window.addEventListener('popstate', onPopState);
    bindTracking();
  }

  function init() {
    Q = window.IVP_QUIZ;
    if (!Q || typeof Q.bandFor !== 'function') throw new Error('shsat-quiz-logic.js missing');
    bind();
    if (F.ZH_TEXTS === true) $('zhLine').hidden = false;
    renderIntro();

    state = loadState();
    if (state && state.captured) {
      go('results', { noHistory: true });
    } else if (state && typeof state.step === 'string' && state.step !== 'intro') {
      go(state.step);
    } else {
      go('intro', { initial: true, noHistory: true });
    }

    window.IVP_QUIZ_READY = true;
    if (window.__ivpEarlyStart === 1) {
      window.__ivpEarlyStart = 0;
      if (current === 'intro') onStart();
    }
  }

  try {
    init();
  } catch (err) {
    try { if (typeof window.__ivpQuizFail === 'function') window.__ivpQuizFail(); } catch (e) {}
  }
})();
