/* Unit tests for api/_quiz-alert.js (spec 2.8, 2.9, 3.8, 2.11, 8.1).
   Run: npm test   (node --test tests/*.test.js; no dependencies, no network)

   The module only builds strings: nothing here sends mail or calls fetch.
   Expected copy is pasted from the spec with plain apostrophes and passed
   through t() where the rendered copy uses the typographic apostrophe. The
   SMS draft keeps plain ASCII apostrophes on purpose (GSM-7, see the module). */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Q = require('../shsat-quiz-logic.js');
const A = require('../api/_quiz-alert.js');
const { lintText } = require('./helpers/copy-lint.js');

const t = (s) => s.replace(/'/g, '’');
const DOT = '·';

const BANDS = ['final_weeks_baseline', 'final_weeks_focus', 'final_weeks_sharpen', 'full_year', 'foundation', 'early_start', 'after_test'];
const WORRIES = ['timing', 'math', 'ela', 'adaptive', 'consistency', 'where_stands', 'process'];
const GRADES = [5, 6, 7, 8, 9];
const PREPS = ['none', 'self', 'group', 'tutor'];
const PRACTICE = ['no', 'once', 'multiple', 'unsure'];
const PLAN_DATES = ['2026-09-28', '2026-10-06', '2026-10-30', '2026-10-31', '2026-11-10', '2026-11-18', '2026-11-19'];

// 12:30 PM ET (inside a window), 10:15 AM ET (between), 10:00 PM ET (after), 6:45 AM ET (before 8).
const AT_1230 = new Date('2026-09-28T16:30:00Z');
const AT_1015 = new Date('2026-09-28T14:15:00Z');
const AT_2200 = new Date('2026-09-29T02:00:00Z');
const AT_0645 = new Date('2026-09-28T10:45:00Z');

// A lead that does not look like a test lead (.invalid is a reserved TLD).
function lead(over) {
  const v = {
    quiz_id: '3b1f0c9e-6a0e-4f2d-9d6b-2f4f7b0c1a11',
    test_type: 'SHSAT',
    parent_name: 'Sam Rivera',
    parent_email: 'sam.rivera@family.invalid',
    phone: '+19175550142',
    student_grade: 8,
    consent: true,
    consent_version: 'quiz-2026-09-28',
    quiz: { version: 1, role: 'parent', targets: ['stuyvesant', 'bronx_science'], prep: 'self', practice_test: 'no', worry: 'timing', band: 'final_weeks_baseline' },
    attribution: {
      utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'shsat_parent_intent', utm_term: 'shsat prep',
      gclid: 'Cj0KCQjwTEST', ivp_lp: '/shsat/quiz', first_landing: '/shsat/quiz', first_referrer: 'google.com', v: 'parent'
    },
    company_name: '',
    delivery: 'alert_and_copy'
  };
  return Object.assign(v, over || {});
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const META = { receivedAt: AT_1230, ip: '203.0.113.7', userAgent: IPHONE_UA };

function answersFor(grade, prep, practice, worry, targets) {
  return { role: 'parent', grade, targets: targets || ['stuyvesant'], prep, practice_test: practice, worry };
}

function assertClean(label, s) {
  const hits = lintText(s);
  assert.deepEqual(hits, [], label + ': ' + JSON.stringify(hits));
}

// ---------------------------------------------------------------------------
// Module shape and constants
// ---------------------------------------------------------------------------

test('exports the 3.8 server helpers and the sender constants', () => {
  for (const f of ['smsDraft', 'looksLikeTestLead', 'deviceFromUA', 'buildAlertEmail', 'buildPlanEmail', 'isHoneypot', 'alertRecipients']) {
    assert.equal(typeof A[f], 'function', f);
  }
  assert.equal(A.ALERT_FROM, 'IvyPath Alerts <hello@noreply.ivypathacademy.com>');
  assert.equal(A.PLAN_FROM, 'IvyPath Academy <hello@noreply.ivypathacademy.com>');
  assert.equal(A.PLAN_REPLY_TO, 'info@ivypathacademy.com');
  // A copy of the platform's OPS_ALERT_RECIPIENTS (ops-diagnostic-alert.ts:35).
  assert.deepEqual([...A.DEFAULT_ALERT_TO], ['vicentexia@gmail.com', 'ivypathacademy@gmail.com']);
  assert.equal(A.SMS_MAX, 320);
});

test('WORRY_PHRASE and ASK_BY_BAND are the 2.8 tables, frozen', () => {
  assert.deepEqual({ ...A.WORRY_PHRASE }, {
    timing: 'finishing on time',
    math: 'math',
    ela: 'reading and ELA',
    adaptive: 'the new computer-adaptive format',
    consistency: 'keeping prep consistent',
    where_stands: 'knowing where your student stands',
    process: 'registration and how offers work'
  });
  const weeks = 'Happy to go over the plan on a free 15-minute consultation. Would today or tomorrow work?';
  const year = 'Happy to go over a plan for the year on a free 15-minute consultation, whenever it suits you.';
  assert.deepEqual({ ...A.ASK_BY_BAND }, {
    final_weeks_baseline: weeks,
    final_weeks_focus: weeks,
    final_weeks_sharpen: weeks,
    full_year: year,
    foundation: year,
    early_start: "Happy to answer any questions whenever it's useful. There's no rush.",
    after_test: 'Happy to talk through what comes next on a free 15-minute consultation, whenever it suits you.'
  });
  assert.ok(Object.isFrozen(A.WORRY_PHRASE) && Object.isFrozen(A.ASK_BY_BAND) && Object.isFrozen(A.DEFAULT_ALERT_TO));
});

test('the module is pure ASCII (the logic file convention)', () => {
  const src = require('node:fs').readFileSync(require.resolve('../api/_quiz-alert.js'), 'utf8');
  assert.ok(/^[\x00-\x7f]*$/.test(src), 'non-ASCII character in api/_quiz-alert.js');
});

// ---------------------------------------------------------------------------
// smsDraft (2.8)
// ---------------------------------------------------------------------------

test('smsDraft: the 2.8 template, word for word', () => {
  assert.equal(A.smsDraft({ band: 'final_weeks_baseline', worry: 'timing' }),
    'Hi, this is Vicente from IvyPath Academy. Thanks for requesting an SHSAT plan on ivypathacademy.com. ' +
    'You mentioned finishing on time as the biggest worry. ' +
    'Happy to go over the plan on a free 15-minute consultation. Would today or tomorrow work? ' +
    "Reply STOP and I won't text again.");
  assert.equal(A.smsDraft({ band: 'full_year', worry: 'where_stands' }),
    'Hi, this is Vicente from IvyPath Academy. Thanks for requesting an SHSAT plan on ivypathacademy.com. ' +
    'You mentioned knowing where your student stands as the biggest worry. ' +
    'Happy to go over a plan for the year on a free 15-minute consultation, whenever it suits you. ' +
    "Reply STOP and I won't text again.");
  assert.equal(A.smsDraft({ band: 'early_start', worry: 'math' }),
    'Hi, this is Vicente from IvyPath Academy. Thanks for requesting an SHSAT plan on ivypathacademy.com. ' +
    "Happy to answer any questions whenever it's useful. There's no rush. " +
    "Reply STOP and I won't text again.");
  assert.equal(A.smsDraft({ band: 'after_test', worry: 'process' }),
    'Hi, this is Vicente from IvyPath Academy. Thanks for requesting an SHSAT plan on ivypathacademy.com. ' +
    'Happy to talk through what comes next on a free 15-minute consultation, whenever it suits you. ' +
    "Reply STOP and I won't text again.");
});

test('smsDraft: every band and worry fits 320 characters, opens and closes right, passes the lint', () => {
  let longest = 0;
  for (const band of BANDS) for (const worry of WORRIES) {
    const s = A.smsDraft({ band, worry });
    longest = Math.max(longest, s.length);
    assert.ok(s.length <= 320, band + '/' + worry + ' is ' + s.length);
    assert.ok(s.startsWith('Hi, this is Vicente from IvyPath Academy.'), s);
    assert.ok(s.endsWith("Reply STOP and I won't text again."), s);
    const hasWorry = s.includes('You mentioned ' + A.WORRY_PHRASE[worry] + ' as the biggest worry.');
    assert.equal(hasWorry, band !== 'early_start' && band !== 'after_test', band + '/' + worry);
    assert.ok(!/  /.test(s), 'double space: ' + s);
    assert.ok(/^[\x20-\x7e]+$/.test(s), 'SMS must stay GSM-7 friendly ASCII: ' + s);
    assert.ok(!/Hi [A-Z][a-z]+,/.test(s), 'never guesses a first name');
    assertClean(band + '/' + worry, s);
  }
  assert.ok(longest > 280 && longest <= 300, 'longest combination is about 295 characters, got ' + longest);
});

test('smsDraft: the worry sentence is dropped first when a draft would go over the limit', () => {
  const full = A.smsDraft({ band: 'final_weeks_focus', worry: 'adaptive' });
  const short = A.smsDraft({ band: 'final_weeks_focus', worry: 'adaptive', max: full.length - 1 });
  assert.ok(!short.includes('You mentioned'));
  assert.ok(short.includes(A.ASK_BY_BAND.final_weeks_focus));
  assert.ok(short.endsWith("Reply STOP and I won't text again."));
  assert.equal(A.smsDraft({ band: 'final_weeks_focus', worry: 'adaptive', max: full.length }), full);
});

test('smsDraft: unknown band or worry throws', () => {
  assert.throws(() => A.smsDraft({ band: 'nope', worry: 'math' }), TypeError);
  assert.throws(() => A.smsDraft({ band: 'full_year', worry: 'nope' }), TypeError);
  assert.throws(() => A.smsDraft({}), TypeError);
  assert.throws(() => A.smsDraft(), TypeError);
  // The worry is not used for early_start and after_test, so it is not required there.
  assert.doesNotThrow(() => A.smsDraft({ band: 'early_start' }));
});

// ---------------------------------------------------------------------------
// looksLikeTestLead (mirrors ops-diagnostic-alert.ts:176) and deviceFromUA
// ---------------------------------------------------------------------------

test('looksLikeTestLead mirrors the platform heuristic', () => {
  const real = { parent_email: 'sam.rivera@gmail.com', parent_name: 'Sam Rivera', phone: '+19175550142' };
  assert.equal(A.looksLikeTestLead(real), false);
  const hits = [
    { parent_email: 'sam@example.com' },
    { parent_email: 'qa+test@gmail.com' },
    { parent_email: 'ops@ivypathacademy.com' },
    { parent_name: 'Demo Parent' },
    { parent_name: 'Asdf Asdf' },
    { parent_name: 'Qwer Ty' },
    { parent_email: 'e2e.run@gmail.com' },
    { parent_email: 'transcriptsxia@gmail.com' },
    { parent_name: 'TEST lead' },
    { phone: '+12222222222' },
    { phone: '2222222222' },
    { phone: '1234567890' },
    { phone: '+11234567890' }
  ];
  for (const h of hits) assert.equal(A.looksLikeTestLead(Object.assign({}, real, h)), true, JSON.stringify(h));
  // Unanchored on purpose, like the platform: a real "Demopoulos" matches, which is why it only prefixes.
  assert.equal(A.looksLikeTestLead(Object.assign({}, real, { parent_name: 'Ana Demopoulos' })), true);
  assert.equal(A.looksLikeTestLead({}), false);
  assert.equal(A.looksLikeTestLead(), false);
});

test('deviceFromUA: iPhone, Android, Mac, Windows or other', () => {
  assert.equal(A.deviceFromUA(IPHONE_UA), 'iPhone');
  assert.equal(A.deviceFromUA('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'), 'Android');
  assert.equal(A.deviceFromUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'), 'Mac');
  assert.equal(A.deviceFromUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'), 'Windows');
  assert.equal(A.deviceFromUA('Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/130.0'), 'other');
  assert.equal(A.deviceFromUA('Mozilla/5.0 (iPad; CPU OS 12_0 like Mac OS X)'), 'other');
  assert.equal(A.deviceFromUA(''), 'other');
  assert.equal(A.deviceFromUA(undefined), 'other');
  assert.equal(A.deviceFromUA(42), 'other');
});

test('isHoneypot: a non-blank company_name', () => {
  assert.equal(A.isHoneypot(lead()), false);
  assert.equal(A.isHoneypot(lead({ company_name: '   ' })), false);
  assert.equal(A.isHoneypot(lead({ company_name: 'Acme Corp' })), true);
  assert.equal(A.isHoneypot({}), false);
});

test('alertRecipients: QUIZ_ALERT_TO split on commas, else the platform defaults', () => {
  assert.deepEqual(A.alertRecipients(undefined), ['vicentexia@gmail.com', 'ivypathacademy@gmail.com']);
  assert.deepEqual(A.alertRecipients(''), ['vicentexia@gmail.com', 'ivypathacademy@gmail.com']);
  assert.deepEqual(A.alertRecipients(' , '), ['vicentexia@gmail.com', 'ivypathacademy@gmail.com']);
  assert.deepEqual(A.alertRecipients('a@x.invalid, b@y.invalid ,'), ['a@x.invalid', 'b@y.invalid']);
  // A fresh array each time, so a caller cannot change the defaults.
  const r = A.alertRecipients();
  r.push('z@z.invalid');
  assert.equal(A.alertRecipients().length, 2);
});

// ---------------------------------------------------------------------------
// buildAlertEmail (2.8)
// ---------------------------------------------------------------------------

test('buildAlertEmail: subject is the 2.8 template', () => {
  assert.equal(A.buildAlertEmail(lead(), META).subject,
    `Quiz lead ${DOT} Sam Rivera ${DOT} gr 8 ${DOT} Stuyvesant, Bronx Science ${DOT} text now`);
  const cases = [
    [{ student_grade: 5 }, { targets: ['not_sure'], band: 'early_start' }, AT_1015,
      `Quiz lead ${DOT} Sam Rivera ${DOT} gr 5 or younger (early) ${DOT} schools undecided ${DOT} text at 12:00 PM`],
    [{ student_grade: 9 }, { targets: ['brooklyn_tech', 'stuyvesant', 'hsmse_ccny'] }, AT_2200,
      `Quiz lead ${DOT} Sam Rivera ${DOT} gr 9 (first year) ${DOT} Stuyvesant, Brooklyn Tech ${DOT} text tomorrow 8:00 AM`],
    [{ student_grade: 6 }, { targets: ['staten_island_tech'], band: 'foundation' }, AT_0645,
      `Quiz lead ${DOT} Sam Rivera ${DOT} gr 6 ${DOT} Staten Island Tech ${DOT} text at 8:00 AM`],
    [{ student_grade: 7 }, { band: 'full_year' }, AT_1230,
      `Quiz lead ${DOT} Sam Rivera ${DOT} gr 7 ${DOT} Stuyvesant, Bronx Science ${DOT} text now`]
  ];
  for (const [top, quiz, at, subject] of cases) {
    const v = lead(top);
    v.quiz = Object.assign({}, v.quiz, quiz);
    assert.equal(A.buildAlertEmail(v, Object.assign({}, META, { receivedAt: at })).subject, subject);
  }
});

test('buildAlertEmail: [TEST?] and [HONEYPOT?] are subject prefixes, never a suppression', () => {
  const test1 = A.buildAlertEmail(lead({ parent_email: 'sam.rivera@example.com' }), META);
  assert.ok(test1.subject.startsWith('[TEST?] Quiz lead '), test1.subject);
  assert.ok(test1.html.includes('Sam Rivera') && test1.text.includes('Sam Rivera'));
  const hp = A.buildAlertEmail(lead({ company_name: 'Acme Corp' }), META);
  assert.ok(hp.subject.startsWith('[HONEYPOT?] Quiz lead '), hp.subject);
  const both = A.buildAlertEmail(lead({ company_name: 'Acme Corp', parent_email: 'sam@example.com' }), META);
  assert.ok(both.subject.startsWith('[HONEYPOT?] [TEST?] Quiz lead '), both.subject);
  const clean = A.buildAlertEmail(lead(), META);
  assert.ok(clean.subject.startsWith('Quiz lead '), clean.subject);
});

test('buildAlertEmail: first line, sms: and tel: links, and the draft', () => {
  const mail = A.buildAlertEmail(lead(), META);
  const draft = A.smsDraft({ band: 'final_weeks_baseline', worry: 'timing' });
  assert.ok(mail.text.startsWith('Sam Rivera (self-declared parent) finished the SHSAT plan. No diagnostic yet.\n'), mail.text.slice(0, 120));
  assert.ok(mail.html.includes('(self-declared parent) finished the SHSAT plan. No diagnostic yet.'));

  // Text part: raw links. HTML: the same links, attribute-escaped.
  const m = /sms:\+19175550142\?&body=(\S+)/.exec(mail.text);
  assert.ok(m, 'sms: link in the text part');
  assert.equal(decodeURIComponent(m[1]), draft);
  assert.ok(!/['()*!]/.test(m[1]), 'the body is strictly percent-encoded');
  assert.ok(mail.text.includes('tel:+19175550142'));
  assert.ok(mail.html.includes('href="sms:+19175550142?&amp;body=' + m[1] + '"'));
  assert.ok(mail.html.includes('href="tel:+19175550142"'));
  assert.ok(mail.html.includes('>Text (917) 555-0142 with this message</a>'));
  assert.ok(mail.html.includes('>Call (917) 555-0142</a>'));
  assert.ok(mail.text.includes('They agreed to texts and email. Call if they ask for a call.'));
  assert.ok(mail.html.includes('They agreed to texts and email. Call if they ask for a call.'));

  assert.ok(mail.text.includes('Draft text:\n' + draft + '\n'));
  assert.ok(mail.html.includes('Draft text:'));
  assert.ok(mail.html.includes('<blockquote'));
  assert.ok(mail.html.includes(draft.replace(/'/g, '&#39;')));
});

test('buildAlertEmail: the texting window line', () => {
  const cases = [
    [AT_1230, 'Received 12:30 PM ET. Inside a texting window: text now.'],
    [AT_1015, 'Received 10:15 AM ET. Next texting window: 12:00 PM today.'],
    [AT_2200, 'Received 10:00 PM ET. Next texting window: 8:00 AM tomorrow.'],
    [AT_0645, 'Received 6:45 AM ET. Next texting window: 8:00 AM today.'],
    [new Date('2026-09-28T18:00:00Z'), 'Received 2:00 PM ET. Next texting window: 5:30 PM today.']
  ];
  for (const [at, line] of cases) {
    const mail = A.buildAlertEmail(lead(), Object.assign({}, META, { receivedAt: at }));
    assert.ok(mail.text.includes('\n' + line + '\n'), line + '\n---\n' + mail.text);
    assert.ok(mail.html.includes(line), line);
  }
});

test('buildAlertEmail: the answers table', () => {
  const mail = A.buildAlertEmail(lead(), META);
  const rows = [
    ['Parent (as typed)', 'Sam Rivera'],
    ['Mobile', '(917) 555-0142'],
    ['Email', 'sam.rivera@family.invalid'],
    ['Grade', '8th grade'],
    ['Aiming for', 'Stuyvesant, Bronx Science'],
    ['Prep now', 'Practicing on their own (books or free sites)'],
    ['Practice test', 'Not yet'],
    ['Biggest worry', 'Finishing all 100 questions in time'],
    ['Plan shown', 'Before November 18: begin with one timed practice test'],
    ['Diagnostic link', 'not sent yet'],
    ['Plan copy emailed', 'yes']
  ];
  for (const [k, v] of rows) {
    assert.ok(mail.text.includes('\n' + k + ': ' + v + '\n'), k + ': ' + v);
    assert.ok(mail.html.includes('>' + k + '</td>'), 'html label ' + k);
  }
  assert.ok(mail.html.includes('href="mailto:sam.rivera@family.invalid"'));

  const undecided = lead({ student_grade: 9 });
  undecided.quiz = Object.assign({}, undecided.quiz, { targets: ['not_sure'], practice_test: 'unsure', worry: 'where_stands' });
  const u = A.buildAlertEmail(undecided, META).text;
  assert.ok(u.includes('\nAiming for: ' + t('Not sure yet') + '\n'));
  assert.ok(u.includes('\nGrade: 9th grade (first year of 9th)\n'));
  assert.ok(u.includes('\nPractice test: ' + t("I'm not sure") + '\n'));
  assert.ok(u.includes('\nBiggest worry: Not knowing where my student stands\n'));
});

test('buildAlertEmail: plan copy row is yes, no or off', () => {
  const row = (v, meta) => /\nPlan copy emailed: (\w+)\n/.exec(A.buildAlertEmail(v, Object.assign({}, META, meta)).text)[1];
  assert.equal(row(lead()), 'yes');
  assert.equal(row(lead({ delivery: 'alert_only' })), 'off');
  assert.equal(row(lead({ company_name: 'Acme Corp' })), 'no');
  assert.equal(row(lead(), { planCopy: 'no' }), 'no');
  assert.equal(row(lead({ delivery: 'alert_only' }), { planCopy: 'bogus' }), 'off');
});

test('buildAlertEmail: the consent record (version, text, time, IP, device)', () => {
  const mail = A.buildAlertEmail(lead(), META);
  const consent = Q.CONSENT_TEXT['quiz-2026-09-28'];
  for (const s of [
    '\nConsent version: quiz-2026-09-28\n',
    '\nConsent text: ' + consent + '\n',
    '\nAgreed at: 2026-09-28 12:30 PM ET (2026-09-28T16:30:00.000Z)\n',
    '\nIP: 203.0.113.7\n',
    '\nDevice: iPhone\n'
  ]) assert.ok(mail.text.includes(s), JSON.stringify(s));
  assert.ok(mail.html.includes('Consent record'));
  assert.ok(mail.html.includes(consent.replace(/'/g, '&#39;')));
  assert.ok(mail.html.includes('2026-09-28T16:30:00.000Z'));
  assert.ok(mail.html.includes('203.0.113.7'));
  // Unknown IP and device still render a value.
  const bare = A.buildAlertEmail(lead(), { receivedAt: AT_1230 }).text;
  assert.ok(bare.includes('\nIP: unknown\n') && bare.includes('\nDevice: other\n'));
});

test('buildAlertEmail: source block, quiz_id, backend and footer', () => {
  const mail = A.buildAlertEmail(lead(), META);
  for (const s of [
    '\nutm_source / utm_medium / utm_campaign / utm_term: google / cpc / shsat_parent_intent / shsat prep\n',
    '\ngclid: yes\n',
    '\nfirst_referrer: google.com\n',
    '\nfirst_landing: /shsat/quiz\n',
    '\nLanding page: /shsat/quiz\n',
    '\nquiz_id: 3b1f0c9e-6a0e-4f2d-9d6b-2f4f7b0c1a11\n',
    '\nbackend: site\n',
    t("\nThese are the parent's own answers, not a score.\n"),
    '\nKeep this email: it is the consent record.\n',
    '\nIf they reply STOP, confirm once and add the number to the texting opt-out list (quiz spec 5.7).'
  ]) assert.ok(mail.text.includes(s), JSON.stringify(s));
  assert.ok(!mail.text.includes('Cj0KCQjwTEST'), 'the gclid value itself is not shown');

  const bare = A.buildAlertEmail(lead({ attribution: {} }), META).text;
  assert.ok(bare.includes('\nutm_source / utm_medium / utm_campaign / utm_term: none / none / none / none\n'));
  assert.ok(bare.includes('\ngclid: no\n') && bare.includes('\nfirst_referrer: none\n') && bare.includes('\nfirst_landing: none\n'));
  assert.ok(bare.includes('\nLanding page: /shsat/quiz\n'));

  const fb = A.buildAlertEmail(lead({ fallback_reason: 'platform_503' }), META);
  assert.ok(fb.text.includes('\nbackend: site_fallback (reason platform_503)\n'));
  assert.ok(fb.html.includes('site_fallback (reason platform_503)'));
});

test('buildAlertEmail: everything user-supplied is HTML-escaped', () => {
  const v = lead({
    parent_name: '<script>alert(1)</script>Sam',
    parent_email: "o'neil@family.invalid",
    attribution: { utm_campaign: '"><img src=x onerror=alert(1)>', first_referrer: '<b>x</b>', gclid: 'x' }
  });
  const mail = A.buildAlertEmail(v, Object.assign({}, META, { ip: '<i>1.2.3.4</i>' }));
  assert.ok(!mail.html.includes('<script'), 'raw <script> in html');
  assert.ok(!mail.html.includes('<img'), 'raw <img> in html');
  assert.ok(!mail.html.includes('<b>x'), 'raw <b> in html');
  assert.ok(!mail.html.includes('<i>1.2'), 'raw <i> in html');
  assert.ok(mail.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;Sam'));
  assert.ok(mail.html.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(mail.html.includes('href="mailto:o&#39;neil@family.invalid"'));
  // The text part is plain text: no markup is added, and the value is shown as typed.
  assert.ok(mail.text.includes('<script>alert(1)</script>Sam'));
});

test('buildAlertEmail: html is a fragment with no doctype, class, style block, image or script', () => {
  const mail = A.buildAlertEmail(lead(), META);
  assert.ok(!/<!doctype/i.test(mail.html));
  assert.ok(!/\bclass=/i.test(mail.html));
  assert.ok(!/<style|<script|<img/i.test(mail.html));
  assert.ok(!/<[a-z]/i.test(mail.text), 'the text part has no markup');
});

test('buildAlertEmail: subject, html and text pass the 2.11 lint for every band, worry, grade and time', () => {
  for (const band of BANDS) for (const worry of WORRIES) for (const at of [AT_1230, AT_1015, AT_2200, AT_0645]) {
    const v = lead();
    v.quiz = Object.assign({}, v.quiz, { band, worry });
    const mail = A.buildAlertEmail(v, Object.assign({}, META, { receivedAt: at }));
    assertClean(band + '/' + worry + ' subject', mail.subject);
    assertClean(band + '/' + worry + ' html', mail.html);
    assertClean(band + '/' + worry + ' text', mail.text);
  }
  for (const g of GRADES) for (const d of ['alert_and_copy', 'alert_only']) for (const hp of ['', 'Acme']) {
    const v = lead({ student_grade: g, delivery: d, company_name: hp, fallback_reason: 'platform_network' });
    v.quiz = Object.assign({}, v.quiz, { targets: ['not_sure'], prep: 'tutor', practice_test: 'multiple', worry: 'process' });
    const mail = A.buildAlertEmail(v, META);
    assertClean('grade ' + g + ' subject', mail.subject);
    assertClean('grade ' + g + ' html', mail.html);
    assertClean('grade ' + g + ' text', mail.text);
  }
});

test('buildAlertEmail: invalid input throws rather than sending a broken alert', () => {
  assert.throws(() => A.buildAlertEmail(null, META), TypeError);
  const v = lead();
  v.quiz = Object.assign({}, v.quiz, { band: 'nope' });
  assert.throws(() => A.buildAlertEmail(v, META), TypeError);
  assert.throws(() => A.buildAlertEmail(lead({ phone: 'nope' }), META), TypeError);
});

// ---------------------------------------------------------------------------
// buildPlanEmail (2.9)
// ---------------------------------------------------------------------------

const PLAN_INTRO = t("Here's the SHSAT plan you asked for on ivypathacademy.com. It's built from your answers: a plan, not a score or a measurement.");
const NEXT_STEP = 'Next step: a free 15-minute consultation. Pick a time at https://www.ivypathacademy.com/book.html or call (929) 394-0349.';
const FOOTER = t("You're getting this email because you asked for your SHSAT plan on ivypathacademy.com. IvyPath Academy is operated by Perevalis Tutoring LLC, New York, NY. Privacy: https://www.ivypathacademy.com/privacy.html");
const DOE_LINE = t("Official dates and how to register: the DOE's specialized high schools page, ") + Q.DOE_SHS_URL;

// The plan text the screen shows, in 2.9 order, built from the logic functions.
function screenPlan(a, today, flags) {
  const band = Q.bandFor(a, today);
  const copy = Q.bandCopy(band, today);
  const parts = [PLAN_INTRO, Q.eyebrowLine(band, today), copy.name, copy.summary];
  const rows = Q.weekPlan(a, today);
  if (rows.length) {
    parts.push('Week by week');
    for (const r of rows) parts.push(r.label + ': ' + r.text);
  }
  const tks = Q.takeawaysFor(a, today, flags);
  if (tks.length) {
    parts.push('Three things to know');
    tks.forEach((k, i) => {
      parts.push((i + 1) + '. ' + k.title);
      parts.push(k.body);
      if (i === 0 && a.grade >= 8) parts.push(DOE_LINE);
    });
  }
  parts.push(NEXT_STEP, FOOTER);
  return parts;
}

test('buildPlanEmail: subject and the 2.9 text for the 2.6.5 example', () => {
  const a = answersFor(8, 'self', 'no', 'math');
  const mail = A.buildPlanEmail(a, '2026-09-28');
  assert.equal(mail.subject, t("Your student's SHSAT plan from IvyPath Academy"));
  assert.equal(mail.text, [
    PLAN_INTRO,
    '',
    'About 7 weeks to the school-day test',
    'Before November 18: begin with one timed practice test',
    t("Your student is in the right grade to take the SHSAT this fall. If your student hasn't taken a timed, full-length practice test yet, that's the first step, so the weeks that are left go where they're needed most."),
    '',
    'Week by week',
    'This week: One timed, full-length practice test (100 questions in 180 minutes), then list the question types that were missed or took longest.',
    t("Oct 6 to Oct 30: Register for the SHSAT. Your student's school counselor can tell you how it works at their school."),
    'Weeks of Oct 5 to Nov 2: Most practice time on the math topics that take longest, plus one timed section each week.',
    'Week of Nov 9: One last timed run early in the week, then light review.',
    'Test dates: Wednesday, November 18 is the school-day test. Charter, private and homeschool students test on November 14, 15 or 21.',
    '',
    'Three things to know',
    '',
    '1. The dates that matter',
    Q.TAKEAWAY_TEXT.T1_REG_SOON,
    DOE_LINE,
    '',
    '2. Where to start',
    Q.TAKEAWAY_TEXT.T2_BASELINE,
    '',
    '3. Your biggest worry: math',
    Q.TAKEAWAY_TEXT.T3_MATH,
    '',
    NEXT_STEP,
    '',
    FOOTER
  ].join('\n'));
});

test('buildPlanEmail: after_test has no week plan and no takeaways', () => {
  const mail = A.buildPlanEmail(answersFor(8, 'none', 'no', 'timing'), '2026-11-19');
  assert.ok(mail.text.includes('SHSAT plan for parents\nAfter the fall 2026 test\n'));
  assert.ok(!mail.text.includes('Week by week') && !mail.html.includes('Week by week'));
  assert.ok(!mail.text.includes('Three things to know') && !mail.html.includes('Three things to know'));
  assert.ok(mail.text.includes(NEXT_STEP));
});

test('buildPlanEmail: the plan text equals the on-screen functions, in order, for every combination', () => {
  let n = 0;
  for (const today of PLAN_DATES) for (const grade of GRADES) for (const prep of PREPS) for (const practice of PRACTICE) for (const worry of WORRIES) {
    const a = answersFor(grade, prep, practice, worry);
    const mail = A.buildPlanEmail(a, today);
    let at = -1;
    for (const part of screenPlan(a, today)) {
      const i = mail.text.indexOf(part, at + 1);
      assert.ok(i > at, `${today} g${grade} ${prep}/${practice}/${worry}: missing or out of order: ${part}`);
      at = i;
    }
    n++;
  }
  assert.equal(n, PLAN_DATES.length * 5 * 4 * 4 * 7);
});

test('buildPlanEmail: copy flags reach the takeaways', () => {
  const a = answersFor(9, 'none', 'no', 'process');
  const off = A.buildPlanEmail(a, '2026-10-06');
  assert.ok(off.text.includes(Q.TAKEAWAY_TEXT.T3_PROCESS_BASIC));
  assert.ok(!off.text.includes(Q.TAKEAWAY_TEXT.T1_G9_NOTE));
  const on = A.buildPlanEmail(a, '2026-10-06', { G9_NOTE: true, T3_PROCESS_VERIFIED: true });
  assert.ok(on.text.includes(Q.TAKEAWAY_TEXT.T3_PROCESS));
  assert.ok(on.text.includes(Q.TAKEAWAY_TEXT.T1_G9_NOTE));
});

test('buildPlanEmail: html carries the same plan, escaped, with bare links', () => {
  const a = answersFor(8, 'group', 'once', 'ela', ['stuyvesant', 'hsmse_ccny']);
  const mail = A.buildPlanEmail(a, '2026-10-06');
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const today = '2026-10-06';
  const band = Q.bandFor(a, today);
  const copy = Q.bandCopy(band, today);
  const pieces = [Q.eyebrowLine(band, today), copy.name, copy.summary];
  for (const r of Q.weekPlan(a, today)) pieces.push(r.label, r.text);
  for (const k of Q.takeawaysFor(a, today)) pieces.push(k.title, k.body);
  assert.ok(pieces.length > 10);
  for (const p of pieces) assert.ok(mail.html.includes(esc(p)), 'html missing: ' + p);
  assert.ok(mail.html.includes(esc(PLAN_INTRO)));
  assert.ok(mail.html.includes('Next step: a free 15-minute consultation. Pick a time at <a href="https://www.ivypathacademy.com/book.html"'));
  assert.ok(mail.html.includes(esc(t("You're getting this email because you asked for your SHSAT plan on ivypathacademy.com."))));
  assert.ok(mail.html.includes('href="https://www.ivypathacademy.com/book.html"'));
  assert.ok(mail.html.includes('href="tel:+19293940349"'));
  assert.ok(mail.html.includes('href="https://www.ivypathacademy.com/privacy.html"'));
  assert.ok(mail.html.includes('href="' + Q.DOE_SHS_URL + '"'));
  assert.ok(mail.html.includes('Three things to know') && mail.html.includes('Week by week'));
});

test('buildPlanEmail: no user-supplied string, and the book link is bare', () => {
  const a = Object.assign(answersFor(8, 'self', 'no', 'timing'), {
    parent_name: 'Sam Rivera', parent_email: 'sam.rivera@family.invalid', phone: '+19175550142', company_name: 'Acme Corp'
  });
  const mail = A.buildPlanEmail(a, '2026-09-28');
  for (const s of ['Sam', 'Rivera', 'sam.rivera', 'family.invalid', '9175550142', '555-0142', 'Acme']) {
    assert.ok(!mail.subject.includes(s) && !mail.html.includes(s) && !mail.text.includes(s), s);
  }
  for (const out of [mail.html, mail.text]) {
    assert.ok(!/book\.html[?#]/.test(out), 'book link carries parameters');
    assert.ok(!/\bref=|utm_|gclid|fbclid/i.test(out), 'attribution in the plan email');
  }
  assert.ok(mail.text.includes('https://www.ivypathacademy.com/book.html or call'));
});

test('buildPlanEmail: html has no doctype, class, style block, image or script', () => {
  const mail = A.buildPlanEmail(answersFor(7, 'none', 'no', 'timing'), '2026-09-28');
  assert.ok(!/<!doctype/i.test(mail.html));
  assert.ok(!/\bclass=/i.test(mail.html));
  assert.ok(!/<style|<script|<img/i.test(mail.html));
  assert.ok(!/<[a-z]/i.test(mail.text), 'the text part has no markup');
});

test('buildPlanEmail: subject, html and text pass the 2.11 lint for every combination and flag', () => {
  for (const flags of [undefined, { G9_NOTE: true, T3_PROCESS_VERIFIED: true }]) {
    for (const today of PLAN_DATES) for (const grade of GRADES) for (const prep of PREPS) for (const practice of PRACTICE) for (const worry of WORRIES) {
      const mail = A.buildPlanEmail(answersFor(grade, prep, practice, worry), today, flags);
      const label = `${today} g${grade} ${prep}/${practice}/${worry}`;
      assertClean(label + ' subject', mail.subject);
      assertClean(label + ' html', mail.html);
      assertClean(label + ' text', mail.text);
    }
  }
});

test('buildPlanEmail: a student or invalid answers throw', () => {
  assert.throws(() => A.buildPlanEmail({ role: 'student' }, '2026-09-28'), TypeError);
  assert.throws(() => A.buildPlanEmail(answersFor(8, 'self', 'no', 'nope'), '2026-09-28'), TypeError);
  assert.throws(() => A.buildPlanEmail(answersFor(8, 'self', 'no', 'timing'), '2026-9-28'), TypeError);
});
