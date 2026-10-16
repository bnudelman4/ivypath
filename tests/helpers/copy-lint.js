/* Copy lint for the /shsat/quiz page (spec 2.11).

   Shared by the unit tests (tests/*.test.js) and the E2E copy sweep
   (tests/e2e/shsat-quiz.spec.js, 8.2 flow 14), so both apply one rule set.
   Test-only: tests/ is in .vercelignore and never served.

   lintText(text, opts) returns an array of { rule, match } (empty = clean).
     opts.quizOnly (default true): also ban em dashes, en dashes and "!".
       Those three are Vicente's style for this page, not an IvyPath brand
       rule, so pass false for strings outside the quiz files (book.html).
     opts.braces (default true): no rendered string may contain "{".
   The two exceptions are exact strings (spec 2.11). They are removed from
   the text before matching, so the same words anywhere else still fail. */
'use strict';

const BANNED = [
  ['kid', /\bkids?\b/i],
  ['cost, fee or price', /\b(costs?|fees?|prices?|pricing)\b/i],
  ['discount, cheap or affordable', /discount|cheap|affordable/i],
  ['course', /\bcourses?\b/i],
  ['class', /\bclass(es)?\b/i],
  ['teacher or instructor', /\b(teachers?|instructors?)\b/i],
  ['sales call', /sales call/i],
  ['guarantee', /guarantee/i],
  ['exact', /\bexact(ly)?\b/i],
  ['points', /\d+\s*points?\b/i],
  ['points away', /\bpoints?\s+(away|gain|higher|increase|more)\b/i],
  ['cutoffs', /\bcutoffs?\b/i],
  ['real number', /real number/i],
  ['readiness', /readiness/i],
  ['deficit wording', /\b(behind|not ready|struggl\w*|weak|weakness(es)?|falling)\b/i],
  ['score promise', /\b(raise|boost|jump|increase|improve)\w*\b.{0,40}\bscores?\b/i],
  ['score promise (reversed)', /\bscores?\b.{0,40}\b(raise|boost|jump|increase|improve)\w*/i],
  ['format replication', /(practice|practicing)[^.]{0,30}in the (new|computer-adaptive) format/i],
  ['set it up for you', /help you set (one|it) up/i],
  ['replicate', /replicat/i],
  ['aced', /\baced\b/i],
  ['ivy league', /ivy league/i],
  ['ref=', /\bref=/i],
  ['always', /\balways\b/i]
];

const QUIZ_ONLY = [
  ['em dash', /\u2014/],
  ['en dash', /\u2013/],
  ['exclamation mark', /!/]
];

const EXCEPTIONS = [
  'Results shown reflect the experiences of individual IvyPath students and are not a guarantee of any particular score or admissions outcome.',
  'Fall 2026 is the first computer-adaptive SHSAT, so past cutoffs are only a rough guide.'
];

function lintText(text, opts) {
  const o = Object.assign({ quizOnly: true, braces: true }, opts || {});
  let s = String(text == null ? '' : text);
  for (const ex of EXCEPTIONS) s = s.split(ex).join(' ');
  const out = [];
  const rules = o.quizOnly ? BANNED.concat(QUIZ_ONLY) : BANNED;
  for (const [rule, re] of rules) {
    const m = re.exec(s);
    if (m) out.push({ rule, match: m[0] });
  }
  if (o.braces && s.indexOf('{') !== -1) out.push({ rule: 'unrendered token', match: '{' });
  return out;
}

// Structural takeaway checks (2.6.6 and 2.11).
function lintTakeawayBody(body) {
  const out = [];
  if (/diagnostic/i.test(body)) out.push({ rule: 'takeaway names the diagnostic', match: 'diagnostic' });
  const mentions = String(body).match(/IvyPath|consultation/gi) || [];
  if (mentions.length > 1) out.push({ rule: 'more than one IvyPath or consultation mention', match: mentions.join(', ') });
  return out;
}

// Every string value reachable from an object (skips functions), with its path.
function collectStrings(value, path, out, seen) {
  out = out || [];
  seen = seen || new Set();
  path = path || '';
  if (typeof value === 'string') { out.push({ path, text: value }); return out; }
  if (!value || typeof value !== 'object' || seen.has(value)) return out;
  seen.add(value);
  for (const k of Object.keys(value)) collectStrings(value[k], path ? path + '.' + k : k, out, seen);
  return out;
}

module.exports = { BANNED, QUIZ_ONLY, EXCEPTIONS, lintText, lintTakeawayBody, collectStrings };
