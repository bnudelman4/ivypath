/* Server-only helpers for the /shsat/quiz lead function (spec 2.8, 2.9, 3.8).
   Spec: docs/specs/2026-09-27-shsat-quiz-design.md

   Files named api/_*.js are neither functions nor served, so the alert
   template and the test-lead heuristic never ship to visitors. Used by
   api/quiz-lead.js. Pure: builds strings only, never sends anything.

   - smsDraft: the first text Vicente sends by hand (2.8). Plain ASCII on
     purpose: a typographic apostrophe would force UCS-2 and cut an SMS
     segment from 160 characters to 70.
   - buildAlertEmail: the ops alert to Vicente (2.8). Everything user-supplied
     is HTML-escaped. It is also the Phase 1 consent record.
   - buildPlanEmail: the plan copy to the parent (2.9). It takes the quiz
     answers only, so no user-supplied text can reach it and the endpoint
     cannot relay a message.

   Every string here passes the copy lint in spec 2.11 (no em or en dashes,
   no "!", no "{"), which is why the HTML has no doctype, no class
   attributes and no style blocks: inline styles only. The file stays pure
   ASCII, like shsat-quiz-logic.js: typographic characters are \u escapes. */
'use strict';

const Q = require('../shsat-quiz-logic.js');

const DOT = '\u00b7';
const ty = (s) => String(s).replace(/'/g, '\u2019');

const ALERT_FROM = 'IvyPath Alerts <hello@noreply.ivypathacademy.com>';
const PLAN_FROM = 'IvyPath Academy <hello@noreply.ivypathacademy.com>';
// noreply.ivypathacademy.com has no MX, so replies go to the address privacy.html publishes.
const PLAN_REPLY_TO = 'info@ivypathacademy.com';
// A copy of the platform's OPS_ALERT_RECIPIENTS (src/lib/ops-diagnostic-alert.ts:35).
const DEFAULT_ALERT_TO = Object.freeze(['vicentexia@gmail.com', 'ivypathacademy@gmail.com']);
const SMS_MAX = 320;

const SITE = 'https://www.ivypathacademy.com';
const BOOK_URL = SITE + '/book.html';
const PRIVACY_URL = SITE + '/privacy.html';
const LANDING = '/shsat/quiz';
const CALL_TEL = '+19293940349';
const CALL_DISPLAY = '(929) 394-0349';

// ---------------------------------------------------------------------------
// SMS draft (2.8)
// ---------------------------------------------------------------------------

const WORRY_PHRASE = Object.freeze({
  timing: 'finishing on time',
  math: 'math',
  ela: 'reading and ELA',
  adaptive: 'the new computer-adaptive format',
  consistency: 'keeping prep consistent',
  where_stands: 'knowing where your student stands',
  process: 'registration and how offers work'
});

const ASK_WEEKS = 'Happy to go over the plan on a free 15-minute consultation. Would today or tomorrow work?';
const ASK_YEAR = 'Happy to go over a plan for the year on a free 15-minute consultation, whenever it suits you.';
const ASK_BY_BAND = Object.freeze({
  final_weeks_baseline: ASK_WEEKS,
  final_weeks_focus: ASK_WEEKS,
  final_weeks_sharpen: ASK_WEEKS,
  full_year: ASK_YEAR,
  foundation: ASK_YEAR,
  early_start: "Happy to answer any questions whenever it's useful. There's no rush.",
  after_test: 'Happy to talk through what comes next on a free 15-minute consultation, whenever it suits you.'
});

const SMS_OPEN = 'Hi, this is Vicente from IvyPath Academy. Thanks for requesting an SHSAT plan on ivypathacademy.com.';
const SMS_STOP = "Reply STOP and I won't text again.";
const NO_WORRY_BANDS = ['early_start', 'after_test'];

// Alert subject grade labels (2.8).
const GRADE_SUBJECT = Object.freeze({ 5: '5 or younger (early)', 6: '6', 7: '7', 8: '8', 9: '9 (first year)' });

function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

// Never echoes the value: it may be a parent's phone or email, and callers log errors.
function need(ok, what) {
  if (!ok) throw new TypeError('quiz-alert: invalid ' + what);
}

// It never guesses a first name ("Chen Li" would read "Hi Chen,"), and it makes sense to a parent
// who never saw the page. Over the limit, the worry sentence is dropped first. opts.max is for tests.
function smsDraft(opts) {
  const o = opts || {};
  need(typeof o.band === 'string' && hasOwn(ASK_BY_BAND, o.band), 'band');
  const ask = ASK_BY_BAND[o.band];
  const max = typeof o.max === 'number' && o.max > 0 ? o.max : SMS_MAX;
  if (NO_WORRY_BANDS.indexOf(o.band) === -1) {
    need(typeof o.worry === 'string' && hasOwn(WORRY_PHRASE, o.worry), 'worry');
    const full = [SMS_OPEN, 'You mentioned ' + WORRY_PHRASE[o.worry] + ' as the biggest worry.', ask, SMS_STOP].join(' ');
    if (full.length <= max) return full;
  }
  return [SMS_OPEN, ask, SMS_STOP].join(' ');
}

// ---------------------------------------------------------------------------
// Heuristics
// ---------------------------------------------------------------------------

// Mirrors looksLikeTestLead in ops-diagnostic-alert.ts:176 (the quiz collects no student name).
// It only adds a [TEST?] subject prefix: unanchored matching would drop a real "Demopoulos".
function looksLikeTestLead(l) {
  const x = l || {};
  const s = String(x.parent_email || '') + ' ' + String(x.parent_name || '');
  if (/test|example|ivypath|demo|asdf|qwer|e2e|transcriptsxia/i.test(s)) return true;
  let d = String(x.phone || '').replace(/\D/g, '');
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1); // E.164 input
  if (d && /^(\d)\1+$/.test(d)) return true;
  if (d === '1234567890') return true;
  return false;
}

function deviceFromUA(ua) {
  if (typeof ua !== 'string' || !ua) return 'other';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  return 'other';
}

// The gate's honeypot (ivp_hp_x) arrives as company_name.
function isHoneypot(v) {
  const hp = v && v.company_name !== undefined && v.company_name !== null ? v.company_name : '';
  return String(hp).trim() !== '';
}

// QUIZ_ALERT_TO split on commas, else the platform's two ops inboxes. Always a fresh array.
function alertRecipients(raw) {
  const list = typeof raw === 'string' ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return list.length ? list : DEFAULT_ALERT_TO.slice();
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

const ENTITY = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ENTITY[c]);
}

// RFC 3986 strict, so no mail client or phone trips on ' ( ) * or !.
function encodeStrict(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// iOS wants &body=, Android wants ?body=; ?&body= satisfies both (the platform's smsLink).
function smsLink(e164, body) {
  return 'sms:' + e164 + '?&body=' + encodeStrict(body);
}

function kv(pair) { return pair[0] + ': ' + pair[1]; }

const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const INK = '#1F2B23';
const MUTED = '#5C6B60';
const LINE = '#E4DECF';
const FOREST = '#1E4D38';
const FOREST_DEEP = '#16382A';
const CREAM = '#FDF8F0';
const GOLD = '#C5A572';
const GOLD_LABEL = '#8F6B37';

// ---------------------------------------------------------------------------
// Ops alert (2.8)
// ---------------------------------------------------------------------------

const PLAN_COPY_VALUES = ['yes', 'no', 'off'];
const ALERT_FOOTER = [
  ty("These are the parent's own answers, not a score."),
  'Keep this email: it is the consent record.',
  'If they reply STOP, confirm once and add the number to the texting opt-out list (quiz spec 5.7).'
];

function label(question, code) {
  const l = Q.LABELS[question];
  return l && hasOwn(l, code) ? l[code] : 'unknown';
}

function alertTable(rows, htmlValues) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;margin:0 0 18px">' +
    rows.map((r, i) => '<tr><td style="padding:3px 14px 3px 0;color:' + MUTED + ';vertical-align:top;white-space:nowrap">' + esc(r[0]) +
      '</td><td style="padding:3px 0;vertical-align:top">' + (htmlValues && htmlValues[i] !== undefined ? htmlValues[i] : esc(r[1])) + '</td></tr>').join('') +
    '</table>';
}

function alertHeading(s) {
  return '<p style="margin:0 0 6px;font-size:13px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:' + MUTED + '">' + esc(s) + '</p>';
}

// value: the validated payload (validateQuizPayload(...).value).
// meta: { receivedAt: Date, ip, userAgent, planCopy: 'yes' | 'no' | 'off' }. planCopy defaults to
// 'no' for a honeypot hit, 'off' for alert_only (PLAN_COPY off on the page), else 'yes'.
function buildAlertEmail(value, meta) {
  need(value && typeof value === 'object', 'lead');
  const m = meta || {};
  const quiz = value.quiz && typeof value.quiz === 'object' ? value.quiz : {};
  need(Q.BANDS.indexOf(quiz.band) !== -1, 'band');
  const grade = Number(value.student_grade);
  need(hasOwn(GRADE_SUBJECT, grade), 'grade');
  const e164 = Q.normalizeUsMobile(value.phone);
  need(Boolean(e164), 'phone');

  const at = m.receivedAt instanceof Date && !isNaN(m.receivedAt.getTime()) ? m.receivedAt : new Date();
  const minutes = Q.nowMinutesNY(at);
  const win = Q.textWindowState(minutes);
  const hp = isHoneypot(value);
  const planCopy = PLAN_COPY_VALUES.indexOf(m.planCopy) !== -1 ? m.planCopy
    : (hp ? 'no' : (value.delivery === 'alert_only' ? 'off' : 'yes'));

  const name = String(value.parent_name || '');
  const email = String(value.parent_email || '');
  const phone = Q.formatUsPhone(e164);
  const draft = smsDraft({ band: quiz.band, worry: quiz.worry });
  const sms = smsLink(e164, draft);
  const schools = Q.schoolNames(quiz.targets);

  const clock = Q.formatClock(minutes);
  const windowLine = win.inWindow
    ? 'Received ' + clock + ' ET. Inside a texting window: text now.'
    : 'Received ' + clock + ' ET. Next texting window: ' + Q.formatClock(win.nextStartMin) + ' ' + (win.nextDay ? 'tomorrow' : 'today') + '.';

  const subject = (hp ? '[HONEYPOT?] ' : '') + (looksLikeTestLead(value) ? '[TEST?] ' : '') + [
    'Quiz lead',
    name.replace(/\s+/g, ' ').trim(),
    'gr ' + GRADE_SUBJECT[grade],
    schools.length ? schools.slice(0, 2).join(', ') : 'schools undecided',
    win.alertPhrase
  ].join(' ' + DOT + ' ');

  const line1 = ' (self-declared parent) finished the SHSAT plan. No diagnostic yet.';

  const answers = [
    ['Parent (as typed)', name],
    ['Mobile', phone],
    ['Email', email],
    ['Grade', label('grade', grade)],
    ['Aiming for', schools.length ? schools.join(', ') : label('targets', 'not_sure')],
    ['Prep now', label('prep', quiz.prep)],
    ['Practice test', label('practice_test', quiz.practice_test)],
    ['Biggest worry', label('worry', quiz.worry)],
    ['Plan shown', Q.BAND_NAMES[quiz.band]],
    ['Diagnostic link', 'not sent yet'],
    ['Plan copy emailed', planCopy]
  ];

  const version = String(value.consent_version || '');
  const consent = [
    ['Consent version', version],
    ['Consent text', hasOwn(Q.CONSENT_TEXT, version) ? Q.CONSENT_TEXT[version] : 'unknown version'],
    ['Agreed at', Q.todayNY(at) + ' ' + clock + ' ET (' + at.toISOString() + ')'],
    ['IP', typeof m.ip === 'string' && m.ip ? m.ip : 'unknown'],
    ['Device', deviceFromUA(m.userAgent)]
  ];

  const attr = value.attribution && typeof value.attribution === 'object' ? value.attribution : {};
  const a = (k) => (typeof attr[k] === 'string' && attr[k] ? attr[k] : 'none');
  const source = [
    ['utm_source / utm_medium / utm_campaign / utm_term', ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term'].map(a).join(' / ')],
    ['gclid', a('gclid') === 'none' ? 'no' : 'yes'],
    ['first_referrer', a('first_referrer')],
    ['first_landing', a('first_landing')],
    ['Landing page', LANDING]
  ];

  const ids = [
    ['quiz_id', String(value.quiz_id || '')],
    ['backend', value.fallback_reason ? 'site_fallback (reason ' + value.fallback_reason + ')' : 'site']
  ];

  const text = [
    name + line1,
    '',
    'Text ' + phone + ' with this message: ' + sms,
    'Call ' + phone + ': tel:' + e164,
    'They agreed to texts and email. Call if they ask for a call.',
    '',
    windowLine,
    '',
    'Draft text:',
    draft,
    '',
    ...answers.map(kv),
    '',
    'Consent record',
    ...consent.map(kv),
    '',
    'Source',
    ...source.map(kv),
    '',
    ...ids.map(kv),
    '',
    ...ALERT_FOOTER
  ].join('\n');

  const btn = 'color:#FFFFFF;background:' + FOREST + ';text-decoration:none;font-weight:600;padding:11px 16px;border-radius:6px;display:inline-block;margin:0 8px 8px 0';
  const btnCall = 'color:' + INK + ';background:' + GOLD + ';text-decoration:none;font-weight:600;padding:11px 16px;border-radius:6px;display:inline-block;margin:0 8px 8px 0';
  const small = 'margin:0 0 16px;font-size:13px;color:' + MUTED;
  const answerHtml = answers.map(() => undefined);
  answerHtml[2] = '<a href="mailto:' + esc(email) + '" style="color:' + FOREST + '">' + esc(email) + '</a>';

  const html = [
    '<div style="font-family:' + SANS + ';font-size:15px;line-height:1.55;color:' + INK + ';max-width:640px">',
    '<p style="margin:0 0 16px;font-size:17px"><strong>' + esc(name) + '</strong>' + esc(line1) + '</p>',
    '<p style="margin:0 0 4px"><a href="' + esc(sms) + '" style="' + btn + '">Text ' + esc(phone) + ' with this message</a>' +
      '<a href="' + esc('tel:' + e164) + '" style="' + btnCall + '">Call ' + esc(phone) + '</a></p>',
    '<p style="' + small + '">They agreed to texts and email. Call if they ask for a call.</p>',
    '<p style="margin:0 0 18px;font-weight:600">' + esc(windowLine) + '</p>',
    alertHeading('Draft text:'),
    '<blockquote style="margin:0 0 18px;padding:14px 16px;background:' + FOREST + ';color:' + CREAM + ';border-radius:10px;font-size:16px;line-height:1.5;-webkit-user-select:all;user-select:all">' + esc(draft) + '</blockquote>',
    alertTable(answers, answerHtml),
    alertHeading('Consent record'),
    alertTable(consent),
    alertHeading('Source'),
    alertTable(source),
    '<p style="' + small + '">' + ids.map((r) => esc(kv(r))).join('<br>') + '</p>',
    '<p style="margin:0;font-size:13px;color:' + MUTED + '">' + ALERT_FOOTER.map(esc).join('<br>') + '</p>',
    '</div>'
  ].join('\n');

  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Plan copy (2.9)
// ---------------------------------------------------------------------------

const PLAN_SUBJECT = ty("Your student's SHSAT plan from IvyPath Academy");
const PLAN_INTRO = ty("Here's the SHSAT plan you asked for on ivypathacademy.com. It's built from your answers: a plan, not a score or a measurement.");
const NEXT_STEP_TEXT = 'Next step: a free 15-minute consultation. Pick a time at ' + BOOK_URL + ' or call ' + CALL_DISPLAY + '.';
const PLAN_FOOTER_LEAD = ty("You're getting this email because you asked for your SHSAT plan on ivypathacademy.com. IvyPath Academy is operated by Perevalis Tutoring LLC, New York, NY. Privacy: ");
// The on-screen line under the grade 8 and 9 T1 body (2.6.6), without "(opens in a new tab)".
const DOE_LEAD = 'Official dates and how to register: ';
const DOE_NAME = ty("the DOE's specialized high schools page");

// answers: { role, grade, targets, prep, practice_test, worry }. today: 'YYYY-MM-DD' in New York.
// flags: { G9_NOTE, T3_PROCESS_VERIFIED }; the logic's launch defaults when omitted.
// Throws on invalid answers or a student (no plan), like the logic functions.
function buildPlanEmail(answers, today, flags) {
  const band = Q.bandFor(answers, today);
  need(band !== null, 'answers: a student gets no plan');
  const copy = Q.bandCopy(band, today);
  const eyebrow = Q.eyebrowLine(band, today);
  const rows = Q.weekPlan(answers, today);
  const takeaways = Q.takeawaysFor(answers, today, flags);
  const doeAfterFirst = Number(answers.grade) >= 8;

  const lines = [PLAN_INTRO, '', eyebrow, copy.name, copy.summary];
  if (rows.length) {
    lines.push('', 'Week by week');
    for (const r of rows) lines.push(r.label + ': ' + r.text);
  }
  if (takeaways.length) {
    lines.push('', 'Three things to know');
    takeaways.forEach((k, i) => {
      lines.push('', (i + 1) + '. ' + k.title, k.body);
      if (i === 0 && doeAfterFirst) lines.push(DOE_LEAD + DOE_NAME + ', ' + Q.DOE_SHS_URL);
    });
  }
  lines.push('', NEXT_STEP_TEXT, '', PLAN_FOOTER_LEAD + PRIVACY_URL);
  const text = lines.join('\n');

  const p = 'margin:0 0 16px';
  const h2 = 'margin:28px 0 12px;font-family:' + SERIF + ';font-size:20px;line-height:1.3;font-weight:600;color:' + INK;
  const h3 = 'margin:0 0 6px;font-family:' + SERIF + ';font-size:17px;line-height:1.35;font-weight:600;color:' + INK;
  const link = 'color:' + FOREST + ';text-decoration:underline';

  const body = [];
  body.push('<p style="' + p + ';color:' + MUTED + '">' + esc(PLAN_INTRO) + '</p>');
  body.push('<p style="margin:8px 0 6px;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:' + GOLD_LABEL + '">' + esc(eyebrow) + '</p>');
  body.push('<h1 style="margin:0 0 10px;font-family:' + SERIF + ';font-size:24px;line-height:1.25;font-weight:600;color:' + INK + '">' + esc(copy.name) + '</h1>');
  body.push('<p style="' + p + '">' + esc(copy.summary) + '</p>');
  if (rows.length) {
    body.push('<h2 style="' + h2 + '">Week by week</h2>');
    for (const r of rows) {
      body.push('<p style="margin:0 0 12px;padding-left:12px;border-left:2px solid ' + LINE + '"><strong style="color:' + INK + '">' + esc(r.label) + '</strong><br>' + esc(r.text) + '</p>');
    }
  }
  if (takeaways.length) {
    body.push('<h2 style="' + h2 + '">Three things to know</h2>');
    takeaways.forEach((k, i) => {
      body.push('<div style="margin:0 0 18px;padding-top:12px;border-top:2px solid ' + GOLD + '">');
      body.push('<h3 style="' + h3 + '"><span style="color:' + GOLD_LABEL + '">' + (i + 1) + '.</span> ' + esc(k.title) + '</h3>');
      body.push('<p style="margin:0">' + esc(k.body) + '</p>');
      if (i === 0 && doeAfterFirst) {
        body.push('<p style="margin:8px 0 0;font-size:14px">' + esc(DOE_LEAD) + '<a href="' + esc(Q.DOE_SHS_URL) + '" style="' + link + '">' + esc(DOE_NAME) + '</a>.</p>');
      }
      body.push('</div>');
    });
  }
  body.push('<p style="margin:24px 0 8px;padding:16px;background:' + CREAM + ';border:1px solid ' + LINE + ';border-radius:8px">' +
    'Next step: a free 15-minute consultation. Pick a time at <a href="' + esc(BOOK_URL) + '" style="' + link + '">' + esc(BOOK_URL) + '</a>' +
    ' or call <a href="tel:' + CALL_TEL + '" style="' + link + '">' + esc(CALL_DISPLAY) + '</a>.</p>');

  const html = [
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background:' + CREAM + '">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:' + CREAM + '"><tr><td align="center" style="padding:24px 12px">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border:1px solid ' + LINE + ';border-radius:12px">',
    '<tr><td style="background:' + FOREST_DEEP + ';padding:18px 28px;border-radius:12px 12px 0 0;font-family:' + SERIF + ';font-size:18px;font-weight:600;color:' + CREAM + '">IvyPath Academy</td></tr>',
    '<tr><td style="padding:28px 28px 12px;font-family:' + SANS + ';font-size:16px;line-height:1.6;color:' + INK + '">',
    body.join('\n'),
    '</td></tr>',
    '<tr><td style="padding:16px 28px 22px;border-top:1px solid ' + LINE + ';font-family:' + SANS + ';font-size:12px;line-height:1.6;color:' + MUTED + '">' +
      esc(PLAN_FOOTER_LEAD) + '<a href="' + esc(PRIVACY_URL) + '" style="color:' + MUTED + ';text-decoration:underline">' + esc(PRIVACY_URL) + '</a></td></tr>',
    '</table>',
    '</td></tr></table>',
    '</body></html>'
  ].join('\n');

  return { subject: PLAN_SUBJECT, html, text };
}

module.exports = {
  ALERT_FROM,
  PLAN_FROM,
  PLAN_REPLY_TO,
  DEFAULT_ALERT_TO,
  SMS_MAX,
  WORRY_PHRASE,
  ASK_BY_BAND,
  GRADE_SUBJECT,
  smsDraft,
  looksLikeTestLead,
  deviceFromUA,
  isHoneypot,
  alertRecipients,
  buildAlertEmail,
  buildPlanEmail
};
