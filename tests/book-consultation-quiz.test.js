/* The SHSAT plan answers in api/book-consultation.js (spec 7.3, 8.1, 2.11).
   Run: npm test   (node --test tests/*.test.js; no dependencies, no network)

   The handler runs against stubs. Module._load is hooked for requires made
   by the handler file only: 'uuid' and './_calendar' get in-process stubs
   (the calendar stub records every insert), and '../shsat-quiz-logic.js'
   can be made to throw, the way a missing file, a syntax error or a
   browser-only global would. global.fetch is replaced for the whole file:
   it records each call and answers in-process, so nothing reaches Resend,
   Google or the platform. RESEND_API_KEY is unset, so no email is built. */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const Q = require('../shsat-quiz-logic.js');
const { lintText } = require('./helpers/copy-lint.js');

const HANDLER = require.resolve('../api/book-consultation.js');
const t = (s) => s.replace(/'/g, '’');

const QUIZ_ID = '3b1f0c9e-6a0e-4f2d-9d6b-2f4f7b0c1a11';
const QUIZ = {
  version: 1, quiz_id: QUIZ_ID, grade: 8, targets: ['stuyvesant', 'bronx_science'],
  prep: 'self', practice_test: 'no', worry: 'timing', band: 'final_weeks_baseline'
};
const BASE_DESCRIPTION = 'Free 15-minute consultation with IvyPath Academy.\n\nStudent/Parent: Sam Rivera\nEmail: sam.rivera@example.com\nPhone: (917) 555-0142';
// Spec 7.3, word for word (the apostrophe is typographic, as in every quiz label).
const SPEC_BLOCK = t([
  "SHSAT PLAN (the parent's own answers, not a score):",
  '- Grade: 8th grade',
  '- Aiming for: Stuyvesant, Bronx Science',
  '- Prep now: Practicing on their own (books or free sites)',
  '- Timed practice test: Not yet',
  '- Biggest worry: Finishing all 100 questions in time',
  '- Plan shown: Before November 18: begin with one timed practice test'
].join('\n'));

// ---------------------------------------------------------------------------
// Module stubs (handler requires only)
// ---------------------------------------------------------------------------

let logicMode = 'real'; // 'real' | 'missing' | 'syntax' | 'browser'
let logicRequires = 0;
let inserts = [];

const calendarStub = {
  calendarClient() {
    return {
      events: {
        insert: async (args) => {
          inserts.push(args);
          return { data: { id: 'evt_test', hangoutLink: 'https://meet.google.com/aaa-bbbb-ccc', htmlLink: 'https://calendar.google.com/event?eid=test' } };
        }
      }
    };
  },
  busyBetween: async () => [],
  overlaps: () => false,
  etOffsetIso: () => '-04:00'
};

const realLoad = Module._load;
Module._load = function (request, parent) {
  if (parent && parent.filename === HANDLER) {
    if (request === 'uuid') return { v4: () => '00000000-0000-4000-8000-000000000000' };
    if (request === './_calendar') return calendarStub;
    if (request === '../shsat-quiz-logic.js') {
      logicRequires++;
      if (logicMode === 'missing') throw Object.assign(new Error("Cannot find module '../shsat-quiz-logic.js'"), { code: 'MODULE_NOT_FOUND' });
      if (logicMode === 'syntax') throw new SyntaxError('Unexpected token');
      if (logicMode === 'browser') throw new ReferenceError('window is not defined');
    }
  }
  return realLoad.apply(this, arguments);
};

// ---------------------------------------------------------------------------
// Network guard, env and console
// ---------------------------------------------------------------------------

const realFetch = global.fetch;
let fetches = [];
global.fetch = async function stubFetch(url, init) {
  fetches.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null });
  return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
};

const ENV_KEYS = ['RESEND_API_KEY', 'SITE_BOOKING_RELAY_SECRET', 'GOOGLE_SERVICE_ACCOUNT_KEY', 'GOOGLE_CALENDAR_SUBJECT'];
const savedEnv = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

let logs = [];
const savedConsole = {};
for (const k of ['log', 'info', 'warn', 'error']) {
  savedConsole[k] = console[k];
  console[k] = (...args) => { logs.push(args.map(String).join(' ')); };
}

test.beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  logicMode = 'real';
  logicRequires = 0;
  inserts = [];
  fetches = [];
  logs = [];
});

test.after(() => {
  Module._load = realLoad;
  global.fetch = realFetch;
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  for (const k of Object.keys(savedConsole)) console[k] = savedConsole[k];
});

function fresh() {
  delete require.cache[HANDLER];
  return require(HANDLER);
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    end() { return this; }
  };
}

function bookingBody(extra) {
  return Object.assign({
    name: 'Sam Rivera',
    email: 'sam.rivera@example.com',
    phone: '(917) 555-0142',
    date: '2026-10-05',
    time: '4:00 PM',
    ref: '',
    attribution: { utm_source: 'google', utm_campaign: 'shsat', gclid: 'test-click' }
  }, extra || {});
}

async function book(extra, handler) {
  const res = mockRes();
  await (handler || fresh())({ method: 'POST', headers: {}, body: bookingBody(extra) }, res);
  return res;
}

function lastEvent() {
  assert.equal(inserts.length, 1, 'exactly one calendar insert');
  return inserts[0].resource;
}

function privateProps(ev) {
  return (ev.extendedProperties && ev.extendedProperties.private) || {};
}

function assertBookedWithoutQuiz(res) {
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  const ev = lastEvent();
  assert.equal(ev.description, BASE_DESCRIPTION);
  const priv = privateProps(ev);
  for (const k of ['quiz_id', 'quiz_band', 'source']) assert.equal(priv[k], undefined, k);
  // The booking's own attribution is untouched.
  assert.equal(priv.utm_source, 'google');
  assert.equal(priv.gclid, 'yes');
}

// ---------------------------------------------------------------------------
// A valid quiz
// ---------------------------------------------------------------------------

test('a valid quiz renders the SHSAT PLAN block with parent-facing labels (7.3)', async () => {
  const res = await book({ quiz: QUIZ });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.ok, true);
  const ev = lastEvent();
  assert.equal(ev.description, BASE_DESCRIPTION + '\n\n' + SPEC_BLOCK);
  assert.equal(ev.summary, 'IvyPath Academy - Free Consultation');
});

test('the private extended properties carry quiz_id, quiz_band and source, beside the attribution', async () => {
  await book({ quiz: Object.assign({}, QUIZ, { quiz_id: QUIZ_ID.toUpperCase() }) });
  const priv = privateProps(lastEvent());
  assert.equal(priv.quiz_id, QUIZ_ID);
  assert.equal(priv.quiz_band, 'final_weeks_baseline');
  assert.equal(priv.source, 'shsat_quiz');
  assert.equal(priv.utm_source, 'google');
  assert.equal(priv.utm_campaign, 'shsat');
  assert.equal(priv.gclid, 'yes');
});

test('the description (also on the parent\'s invite) holds no internal code or id', async () => {
  await book({ quiz: QUIZ });
  const d = lastEvent().description;
  for (const code of [QUIZ_ID, 'final_weeks', 'bronx_science', 'shsat_quiz', 'timing', 'self', '"no"']) {
    assert.equal(d.indexOf(code), -1, code);
  }
});

test('"Not sure yet" stands alone, and schools follow the Q3 order', async () => {
  await book({ quiz: Object.assign({}, QUIZ, { targets: ['not_sure'] }) });
  assert.match(lastEvent().description, /\n- Aiming for: Not sure yet\n/);

  inserts = [];
  await book({ quiz: Object.assign({}, QUIZ, { targets: ['hsmse_ccny', 'stuyvesant', 'stuyvesant'] }) });
  assert.match(lastEvent().description, /\n- Aiming for: Stuyvesant, Math, Science & Engineering at City College\n/);
});

test('a string grade from an older handoff still renders', async () => {
  await book({ quiz: Object.assign({}, QUIZ, { grade: '7', band: 'full_year' }) });
  const d = lastEvent().description;
  assert.match(d, /\n- Grade: 7th grade\n/);
  assert.match(d, /\n- Plan shown: Fall 2027: a steady year of practice$/);
});

test('every label combination in the calendar block passes the copy lint (2.11)', async () => {
  const handler = fresh();
  const variants = [];
  for (const g of Q.CODES.grade) variants.push({ grade: g });
  for (const p of Q.CODES.prep) variants.push({ prep: p });
  for (const p of Q.CODES.practice_test) variants.push({ practice_test: p });
  for (const w of Q.CODES.worry) variants.push({ worry: w });
  for (const b of Q.BANDS) variants.push({ band: b });
  variants.push({ targets: ['not_sure'] });
  variants.push({ targets: Q.CODES.targets.filter((c) => c !== 'not_sure') });
  for (const v of variants) {
    inserts = [];
    await book({ quiz: Object.assign({}, QUIZ, v) }, handler);
    const d = lastEvent().description;
    const block = d.slice(d.indexOf('SHSAT PLAN'));
    assert.ok(block.startsWith('SHSAT PLAN'), JSON.stringify(v));
    assert.equal(block.split('\n').length, 7, JSON.stringify(v));
    assert.deepEqual(lintText(block), [], JSON.stringify(v) + '\n' + block);
    assert.doesNotMatch(block, /undefined|null|\{/);
  }
});

// ---------------------------------------------------------------------------
// Invalid quiz data is dropped, never refused
// ---------------------------------------------------------------------------

test('unknown codes are dropped, line by line', async () => {
  const res = await book({
    quiz: {
      version: 1, quiz_id: QUIZ_ID, grade: 11, targets: ['stuyvesant', 'hogwarts', 'not_sure', 42],
      prep: 'bootcamp', practice_test: 'once', worry: '<script>alert(1)</script>', band: 'final_weeks_ready', extra: 'x'
    }
  });
  assert.equal(res.statusCode, 200);
  const ev = lastEvent();
  assert.equal(ev.description, BASE_DESCRIPTION + '\n\n' + t([
    "SHSAT PLAN (the parent's own answers, not a score):",
    '- Aiming for: Stuyvesant',
    '- Timed practice test: Yes, once'
  ].join('\n')));
  for (const junk of ['hogwarts', 'bootcamp', 'script', 'final_weeks_ready', 'Grade', 'Plan shown', 'undefined']) {
    assert.equal(ev.description.indexOf(junk), -1, junk);
  }
  const priv = privateProps(ev);
  assert.equal(priv.quiz_id, QUIZ_ID);
  assert.equal(priv.source, 'shsat_quiz');
  assert.equal(priv.quiz_band, undefined, 'an unknown band is not recorded');
});

test('a quiz object without a UUID quiz_id is ignored', async () => {
  for (const id of [undefined, '', 'abc', 42, QUIZ_ID + 'x', '3b1f0c9e6a0e4f2d9d6b2f4f7b0c1a11']) {
    inserts = [];
    assertBookedWithoutQuiz(await book({ quiz: Object.assign({}, QUIZ, { quiz_id: id }) }));
  }
});

test('the booking still returns 200 with junk quiz values', async () => {
  const throwing = {};
  Object.defineProperty(throwing, 'quiz_id', { enumerable: true, get() { throw new Error('boom'); } });
  const junk = [
    'final_weeks_baseline', 42, true, [], [QUIZ], {}, throwing,
    { quiz_id: QUIZ_ID, targets: 'stuyvesant', grade: { valueOf() { return 8; } } },
    { quiz_id: QUIZ_ID, targets: [null, {}, ['stuyvesant']], prep: ['self'], band: { toString() { return 'full_year'; } } }
  ];
  const handler = fresh();
  for (let i = 0; i < junk.length; i++) {
    inserts = [];
    const res = await book({ quiz: junk[i] }, handler);
    assert.equal(res.statusCode, 200, 'junk #' + i);
    assert.equal(res.body.ok, true, 'junk #' + i);
    assert.equal(lastEvent().description, BASE_DESCRIPTION, 'junk #' + i);
  }
  // A null-prototype object is still read field by field.
  inserts = [];
  const res = await book({ quiz: Object.assign(Object.create(null), { quiz_id: QUIZ_ID, grade: 8 }) }, handler);
  assert.equal(res.statusCode, 200);
  assert.equal(lastEvent().description, BASE_DESCRIPTION + '\n\n' + t("SHSAT PLAN (the parent's own answers, not a score):\n- Grade: 8th grade"));
});

test('the booking still returns 200 when the quiz logic cannot be loaded', async () => {
  for (const mode of ['missing', 'syntax', 'browser']) {
    logicMode = mode;
    logicRequires = 0;
    inserts = [];
    const res = await book({ quiz: QUIZ });
    assert.equal(logicRequires, 1, mode + ': the lazy require ran and threw');
    assertBookedWithoutQuiz(res);
  }
});

test('the quiz logic is required lazily, never at module load', async () => {
  logicMode = 'missing';
  const handler = fresh();
  assert.equal(logicRequires, 0);
  assertBookedWithoutQuiz(await book({}, handler));
  assert.equal(logicRequires, 0, 'a booking with no quiz never loads the logic');
});

// ---------------------------------------------------------------------------
// Scope: default type only; relay unchanged
// ---------------------------------------------------------------------------

test('the consulting type ignores quiz', async () => {
  const res = await book({ type: 'consulting-strategy', quiz: QUIZ });
  assert.equal(res.statusCode, 200);
  const ev = lastEvent();
  assert.ok(ev.description.startsWith('Free 30-minute college consulting strategy call.'));
  assert.doesNotMatch(ev.description, /SHSAT/);
  const priv = privateProps(ev);
  for (const k of ['quiz_id', 'quiz_band', 'source']) assert.equal(priv[k], undefined, k);
  assert.equal(logicRequires, 0, 'the consulting path never loads the quiz logic');
});

test('a booking refused for its own fields is still refused, quiz or not', async () => {
  const res = await book({ name: '', quiz: QUIZ });
  assert.equal(res.statusCode, 400);
  assert.equal(inserts.length, 0);
});

test('the platform relay body is unchanged by a quiz', async () => {
  process.env.SITE_BOOKING_RELAY_SECRET = 'test-secret';
  await book({ quiz: QUIZ });
  const relay = fetches.filter((f) => f.url === 'https://app.ivypathacademy.com/api/bookings/site');
  assert.equal(relay.length, 1);
  assert.equal(fetches.length, 1, 'no other network call');
  assert.deepEqual(Object.keys(relay[0].body).sort(), [
    'email', 'end', 'event_link', 'fbclid', 'gbraid', 'gclid', 'google_event_id', 'meet_link', 'name', 'page',
    'phone', 'ref', 'source', 'start', 'type', 'utm_campaign', 'utm_content', 'utm_medium', 'utm_source',
    'utm_term', 'wbraid'
  ]);
  assert.equal(relay[0].body.source, 'site');
  assert.equal(relay[0].body.type, 'consultation');
  assert.equal(JSON.stringify(relay[0].body).indexOf('SHSAT'), -1);
});

test('no network call and no answer in the logs', async () => {
  await book({ quiz: QUIZ });
  assert.equal(fetches.length, 0);
  const all = logs.join('\n');
  for (const s of ['Practicing on their own', 'Finishing all 100', QUIZ_ID]) assert.equal(all.indexOf(s), -1, s);
});
