/* Unit tests for shsat-quiz-logic.js (spec 3.x, 5.1, 5.2, 2.11, 8.1).
   Run: npm test   (node --test tests/*.test.js; no dependencies, no network)

   Expected copy below is pasted from the spec with plain apostrophes and passed
   through t(), because the rendered strings use the typographic apostrophe
   (U+2019), as the live page does (spec 2, conventions). */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const Q = require('../shsat-quiz-logic.js');
const { lintText, lintTakeawayBody, collectStrings } = require('./helpers/copy-lint.js');
const FIXTURES = require('./fixtures/quiz-payload.json');

const ROOT = path.join(__dirname, '..');
const t = (s) => s.replace(/'/g, '\u2019');

const ROLES = ['parent', 'student'];
const GRADES = [5, 6, 7, 8, 9];
const PREPS = ['none', 'self', 'group', 'tutor'];
const PRACTICE = ['no', 'once', 'multiple', 'unsure'];
const WORRIES = ['timing', 'math', 'ela', 'adaptive', 'consistency', 'where_stands', 'process'];
const SCHOOLS = ['stuyvesant', 'bronx_science', 'brooklyn_tech', 'brooklyn_latin', 'staten_island_tech',
  'queens_science_york', 'american_studies_lehman', 'hsmse_ccny'];
const BAND_DATES = ['2026-09-28', '2026-10-05', '2026-10-06', '2026-10-30', '2026-10-31', '2026-11-18', '2026-11-19'];
const ALL_DATES = BAND_DATES.concat(['2026-10-26', '2026-11-02', '2026-11-04', '2026-11-05', '2026-11-08',
  '2026-11-09', '2026-11-10', '2026-11-15', '2026-11-16', '2026-11-17', '2026-12-01']);
const FINAL = ['final_weeks_baseline', 'final_weeks_focus', 'final_weeks_sharpen'];

function parent(grade, prep, practice, worry, targets) {
  return { role: 'parent', grade, targets: targets || ['stuyvesant'], prep, practice_test: practice, worry: worry || 'timing' };
}
function* parentCombos() {
  for (const grade of GRADES) for (const prep of PREPS) for (const practice of PRACTICE) for (const worry of WORRIES) {
    yield parent(grade, prep, practice, worry);
  }
}

// ---------------------------------------------------------------------------
// Module shape
// ---------------------------------------------------------------------------

test('requires in node without browser globals and exports the 3.8 API', () => {
  const fns = ['todayNY', 'nowMinutesNY', 'bandFor', 'bandCopy', 'countdownLine', 'introDateLine',
    'registrationLine', 'weekPlan', 'takeawaysFor', 'schoolsLine', 'textWindowState', 'sanitizeName',
    'normalizeUsMobile', 'formatUsPhone', 'isSchoolEmail', 'validateQuizPayload'];
  for (const f of fns) assert.equal(typeof Q[f], 'function', f);
  const consts = ['QUESTIONS', 'CODES', 'LABELS', 'SCHOOL_SHORT', 'WORRY_SHORT', 'FOCUS', 'BANDS', 'DATES',
    'TEXT_WINDOWS', 'CONSENT_VERSION', 'CONSENT_TEXT'];
  for (const c of consts) assert.ok(Q[c] !== undefined, c);
});

test('UMD: in a browser-like context it sets window.IVP_QUIZ and reads no DOM at load', () => {
  const src = fs.readFileSync(path.join(ROOT, 'shsat-quiz-logic.js'), 'utf8');
  const sandbox = { window: { __IVP_QUIZ_TODAY: '2026-11-02', __IVP_QUIZ_NOW_MIN: 1320 } };
  vm.runInNewContext(src, sandbox);
  const api = sandbox.window.IVP_QUIZ;
  assert.ok(api, 'window.IVP_QUIZ is set');
  assert.equal(typeof api.bandFor, 'function');
  assert.equal(api.todayNY(), '2026-11-02');
  assert.equal(api.nowMinutesNY(), 1320);
});

test('exported constants are frozen', () => {
  assert.ok(Object.isFrozen(Q.QUESTIONS));
  assert.ok(Object.isFrozen(Q.QUESTIONS[0].options));
  assert.ok(Object.isFrozen(Q.CODES.targets));
  assert.ok(Object.isFrozen(Q.TEXT_WINDOWS));
  assert.ok(Object.isFrozen(Q.DATES));
});

// ---------------------------------------------------------------------------
// Constants (3.1, 2.3, 3.4, 3.7)
// ---------------------------------------------------------------------------

test('dates, consent version and consent text', () => {
  assert.deepEqual({ ...Q.DATES }, {
    REG_OPENS: '2026-10-06', REG_CLOSES: '2026-10-30', SCHOOL_DAY: '2026-11-18',
    AFTER_FROM: '2026-11-19', LAST_PREP_WEEK: '2026-11-09', TEST_WEEK: '2026-11-16'
  });
  assert.equal(Q.CONSENT_VERSION, 'quiz-2026-09-28');
  assert.deepEqual(Object.keys(Q.CONSENT_TEXT), ['quiz-2026-09-28']);
  assert.equal(Q.CONSENT_TEXT['quiz-2026-09-28'], t("IvyPath Academy (Perevalis Tutoring LLC) may text and email me about my student's SHSAT plan. Texts come from a person at IvyPath, not an automated system, and there will only be a few. Reply STOP to opt out. Message and data rates may apply. Agreeing isn't required to book a consultation or enroll."));
});

test('TEXT_WINDOWS is the 3.7 table', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(Q.TEXT_WINDOWS)), [[480, 540], [720, 810], [1050, 1230]]);
});

test('QUESTIONS match 2.3: ids, order, titles, hints, labels and codes', () => {
  const expected = [
    { id: 'role', title: "Who's filling this out?", hint: '', multi: false,
      options: [['parent', "I'm a parent or guardian"], ['student', "I'm a student"]] },
    { id: 'grade', title: 'What grade is your student in this school year?',
      hint: '8th graders and first-year 9th graders who live in NYC can take the SHSAT.', multi: false,
      options: [[5, '5th grade or younger'], [6, '6th grade'], [7, '7th grade'], [8, '8th grade'], [9, '9th grade (first year of 9th)']] },
    { id: 'targets', title: 'Which specialized high schools is your student aiming for?', hint: 'Pick all that apply.', multi: true,
      options: [['stuyvesant', 'Stuyvesant'], ['bronx_science', 'Bronx Science'], ['brooklyn_tech', 'Brooklyn Tech'],
        ['brooklyn_latin', 'Brooklyn Latin'], ['staten_island_tech', 'Staten Island Tech'],
        ['queens_science_york', 'Queens Science at York'], ['american_studies_lehman', 'American Studies at Lehman'],
        ['hsmse_ccny', 'Math, Science & Engineering at City College'], ['not_sure', 'Not sure yet']] },
    { id: 'prep', title: 'What SHSAT prep is your student doing now?', hint: '', multi: false,
      options: [['none', 'Nothing yet'], ['self', 'Practicing on their own (books or free sites)'],
        ['group', 'A group program or prep center'], ['tutor', 'A 1-on-1 tutor']] },
    { id: 'practice_test', title: 'Has your student taken a full-length, timed practice SHSAT?', hint: '', multi: false,
      options: [['no', 'Not yet'], ['once', 'Yes, once'], ['multiple', 'Yes, two or more'], ['unsure', "I'm not sure"]] },
    { id: 'worry', title: "What's your biggest worry about the SHSAT?", hint: 'Pick the one that matters most.', multi: false,
      options: [['timing', 'Finishing all 100 questions in time'], ['math', 'Math'], ['ela', 'Reading and ELA'],
        ['adaptive', 'The new computer-adaptive format'], ['consistency', 'Keeping prep consistent week to week'],
        ['where_stands', 'Not knowing where my student stands'], ['process', 'Understanding registration and how offers work']] }
  ];
  assert.equal(Q.QUESTIONS.length, 6);
  expected.forEach((e, i) => {
    const q = Q.QUESTIONS[i];
    assert.equal(q.id, e.id);
    assert.equal(q.n, i + 1);
    assert.equal(q.title, t(e.title));
    assert.equal(q.hint, e.hint);
    assert.equal(q.multi, e.multi);
    assert.deepEqual(q.options.map((o) => [o.code, o.label]), e.options.map(([c, l]) => [c, t(l)]));
  });
  assert.equal(Q.QUESTIONS[2].exclusive, 'not_sure');
});

test('CODES, LABELS, SCHOOL_SHORT, WORRY_SHORT, FOCUS and BANDS', () => {
  assert.deepEqual([...Q.CODES.role], ROLES);
  assert.deepEqual([...Q.CODES.grade], GRADES);
  assert.deepEqual([...Q.CODES.targets], SCHOOLS.concat('not_sure'));
  assert.deepEqual([...Q.CODES.prep], PREPS);
  assert.deepEqual([...Q.CODES.practice_test], PRACTICE);
  assert.deepEqual([...Q.CODES.worry], WORRIES);
  assert.deepEqual([...Q.BANDS], ['final_weeks_baseline', 'final_weeks_focus', 'final_weeks_sharpen', 'full_year', 'foundation', 'early_start', 'after_test']);
  assert.deepEqual([...Q.CODES.band], [...Q.BANDS]);
  assert.equal(Q.LABELS.grade[8], '8th grade');
  assert.equal(Q.LABELS.prep.self, 'Practicing on their own (books or free sites)');
  assert.equal(Q.LABELS.practice_test.no, 'Not yet');
  assert.equal(Q.LABELS.worry.timing, 'Finishing all 100 questions in time');
  assert.equal(Q.LABELS.targets.hsmse_ccny, 'Math, Science & Engineering at City College');
  assert.deepEqual(Object.keys(Q.SCHOOL_SHORT), SCHOOLS);
  assert.equal(Q.SCHOOL_SHORT.queens_science_york, 'Queens Science at York');
  assert.deepEqual({ ...Q.WORRY_SHORT }, {
    timing: 'finishing in time', math: 'math', ela: 'reading and ELA', adaptive: 'the new format',
    consistency: 'staying consistent', where_stands: 'knowing where things stand', process: 'registration and offers'
  });
  assert.deepEqual({ ...Q.FOCUS }, {
    timing: 'timed sets and pacing', math: 'the math topics that take longest',
    ela: 'longer reading passages and ELA questions', adaptive: 'timed practice on a computer at the new length',
    consistency: 'a fixed weekly schedule', where_stands: 'the question types the practice test shows need the most time',
    process: 'the question types that take longest'
  });
});

// ---------------------------------------------------------------------------
// todayNY / nowMinutesNY and the Playwright hooks (3.1)
// ---------------------------------------------------------------------------

test('todayNY and nowMinutesNY use New York time, across the DST change', () => {
  assert.equal(Q.todayNY(new Date('2026-09-28T03:59:00Z')), '2026-09-27'); // 23:59 EDT
  assert.equal(Q.todayNY(new Date('2026-09-28T04:00:00Z')), '2026-09-28'); // 00:00 EDT
  assert.equal(Q.nowMinutesNY(new Date('2026-09-28T04:00:00Z')), 0);
  assert.equal(Q.nowMinutesNY(new Date('2026-09-28T16:30:00Z')), 750); // 12:30 EDT
  // 2026-11-01 06:00Z is 01:00 EST (clocks fell back at 02:00 EDT)
  assert.equal(Q.todayNY(new Date('2026-11-02T04:30:00Z')), '2026-11-01'); // 23:30 EST
  assert.equal(Q.nowMinutesNY(new Date('2026-11-02T04:30:00Z')), 1410);
  assert.equal(Q.todayNY(Date.UTC(2026, 10, 18, 15, 0)), '2026-11-18');
  assert.match(Q.todayNY(), /^\d{4}-\d{2}-\d{2}$/);
  const m = Q.nowMinutesNY();
  assert.ok(Number.isInteger(m) && m >= 0 && m <= 1439);
});

test('test hooks replace today and minutes only when well formed and no date is passed', () => {
  try {
    globalThis.__IVP_QUIZ_TODAY = '2026-10-31';
    globalThis.__IVP_QUIZ_NOW_MIN = 1320;
    assert.equal(Q.todayNY(), '2026-10-31');
    assert.equal(Q.nowMinutesNY(), 1320);
    assert.equal(Q.todayNY(new Date('2026-09-28T16:00:00Z')), '2026-09-28');
    assert.equal(Q.nowMinutesNY(new Date('2026-09-28T16:00:00Z')), 720);
    for (const bad of ['tomorrow', '2026-1-5', '2026-10-31T00:00', 20261031]) {
      globalThis.__IVP_QUIZ_TODAY = bad;
      assert.notEqual(Q.todayNY(), bad);
      assert.match(Q.todayNY(), /^\d{4}-\d{2}-\d{2}$/);
    }
    for (const bad of [1440, -1, 12.5, '600', null]) {
      globalThis.__IVP_QUIZ_NOW_MIN = bad;
      const v = Q.nowMinutesNY();
      assert.ok(Number.isInteger(v) && v >= 0 && v <= 1439);
    }
    globalThis.__IVP_QUIZ_NOW_MIN = 0;
    assert.equal(Q.nowMinutesNY(), 0);
    globalThis.__IVP_QUIZ_NOW_MIN = 1439;
    assert.equal(Q.nowMinutesNY(), 1439);
  } finally {
    delete globalThis.__IVP_QUIZ_TODAY;
    delete globalThis.__IVP_QUIZ_NOW_MIN;
  }
});

// ---------------------------------------------------------------------------
// bandFor (3.2)
// ---------------------------------------------------------------------------

// Independent oracle for the 3.2 table.
function oracleBand(a, today) {
  if (a.role === 'student') return null;
  if (a.grade === 8 || a.grade === 9) {
    if (today >= '2026-11-19') return 'after_test';
    if (a.practice_test === 'no' || a.practice_test === 'unsure') return 'final_weeks_baseline';
    if (a.prep === 'none' || a.prep === 'self') return 'final_weeks_focus';
    return 'final_weeks_sharpen';
  }
  return { 7: 'full_year', 6: 'foundation', 5: 'early_start' }[a.grade];
}

test('bandFor: all 160 combinations at every test date match the 3.2 table', () => {
  let n = 0;
  for (const today of BAND_DATES) {
    for (const role of ROLES) for (const grade of GRADES) for (const prep of PREPS) for (const practice_test of PRACTICE) {
      const a = { role, grade, prep, practice_test, targets: ['not_sure'], worry: 'math' };
      const band = Q.bandFor(a, today);
      assert.equal(band, oracleBand(a, today), JSON.stringify({ a, today }));
      if (role === 'student') assert.equal(band, null);
      else assert.ok(Q.BANDS.includes(band));
      n++;
    }
  }
  assert.equal(n, 160 * BAND_DATES.length);
});

test('bandFor: rows of 3.2 by example', () => {
  assert.equal(Q.bandFor({ role: 'student' }, '2026-09-28'), null);
  assert.equal(Q.bandFor(parent(8, 'tutor', 'multiple'), '2026-11-19'), 'after_test');
  assert.equal(Q.bandFor(parent(9, 'none', 'no'), '2026-11-18'), 'final_weeks_baseline');
  assert.equal(Q.bandFor(parent(8, 'group', 'unsure'), '2026-09-28'), 'final_weeks_baseline');
  assert.equal(Q.bandFor(parent(8, 'self', 'once'), '2026-09-28'), 'final_weeks_focus');
  assert.equal(Q.bandFor(parent(9, 'none', 'multiple'), '2026-10-31'), 'final_weeks_focus');
  assert.equal(Q.bandFor(parent(8, 'group', 'once'), '2026-09-28'), 'final_weeks_sharpen');
  assert.equal(Q.bandFor(parent(8, 'tutor', 'multiple'), '2026-11-18'), 'final_weeks_sharpen');
  assert.equal(Q.bandFor(parent(7, 'tutor', 'multiple'), '2026-12-01'), 'full_year');
  assert.equal(Q.bandFor(parent(6, 'none', 'no'), '2026-09-28'), 'foundation');
  assert.equal(Q.bandFor(parent(5, 'none', 'no'), '2026-11-19'), 'early_start');
  assert.equal(Q.bandFor({ ...parent(8, 'self', 'no'), grade: '8' }, '2026-09-28'), 'final_weeks_baseline');
});

test('bandFor: targets and worry never change the band', () => {
  const a = parent(8, 'self', 'once');
  const base = Q.bandFor(a, '2026-10-01');
  for (const worry of WORRIES) {
    for (const targets of [['not_sure'], ['stuyvesant'], SCHOOLS]) {
      assert.equal(Q.bandFor({ ...a, worry, targets }, '2026-10-01'), base);
    }
  }
});

test('bandFor: invalid codes and dates throw', () => {
  const ok = parent(8, 'self', 'no');
  assert.throws(() => Q.bandFor({ ...ok, role: 'teacher' }, '2026-09-28'));
  assert.throws(() => Q.bandFor({ ...ok, role: undefined }, '2026-09-28'));
  assert.throws(() => Q.bandFor({ ...ok, grade: 4 }, '2026-09-28'));
  assert.throws(() => Q.bandFor({ ...ok, grade: 10 }, '2026-09-28'));
  assert.throws(() => Q.bandFor({ ...ok, grade: undefined }, '2026-09-28'));
  assert.throws(() => Q.bandFor({ ...ok, prep: 'classes' }, '2026-09-28'));
  assert.throws(() => Q.bandFor({ ...ok, practice_test: 'maybe' }, '2026-09-28'));
  assert.throws(() => Q.bandFor(ok, '2026-9-28'));
  assert.throws(() => Q.bandFor(ok));
  assert.throws(() => Q.bandFor(null, '2026-09-28'));
});

// ---------------------------------------------------------------------------
// bandCopy (2.6.3) and the B2 checks
// ---------------------------------------------------------------------------

const PREFIX_EARLY = "Your student is in the right grade to take the SHSAT this fall.";
const PREFIX_LATE = 'If your student registered by October 30, the test is this fall.';
const SUMMARY = {
  final_weeks_baseline: "If your student hasn't taken a timed, full-length practice test yet, that's the first step, so the weeks that are left go where they're needed most.",
  final_weeks_focus: "There's already a practice test to learn from, so the plan is to spend the remaining weeks on the question types that were missed or took longest, with timed practice at the new 100-question length.",
  final_weeks_sharpen: 'Your student already has structured prep, so the plan now is timed practice at the new 100-question length, on a computer, with extra time on the question types that still take longest.',
  full_year: 'Your student would take the SHSAT in fall 2027. A year out is a good time to start: enough time to build skills at a steady pace, without a rush at the end.',
  foundation: 'Your student would take the SHSAT in fall 2028. For now, the plan is strong reading and math basics, with a little practice to get familiar with the test.',
  early_start: "Your student is still a few years away from the SHSAT. The most useful work now is everyday reading and math. There's no need for test prep yet.",
  after_test: 'The fall 2026 SHSAT dates have passed. If your student took the test, a free 15-minute consultation can help you think through what comes next.'
};
const NAMES = {
  final_weeks_baseline: 'Before November 18: begin with one timed practice test',
  final_weeks_focus: 'Before November 18: work on what the practice test showed',
  final_weeks_sharpen: 'Before November 18: timed practice and review',
  full_year: 'Fall 2027: a steady year of practice',
  foundation: 'Fall 2028: strong reading and math basics',
  early_start: 'Early years: everyday reading and math',
  after_test: 'After the fall 2026 test'
};

test('bandCopy: exact names and summaries, with the prefix before and after Oct 30', () => {
  for (const band of Q.BANDS) {
    for (const [today, prefix] of [['2026-09-28', PREFIX_EARLY], ['2026-10-30', PREFIX_EARLY], ['2026-10-31', PREFIX_LATE], ['2026-11-18', PREFIX_LATE]]) {
      const c = Q.bandCopy(band, today);
      assert.equal(c.name, NAMES[band]);
      const expected = FINAL.includes(band) ? prefix + ' ' + SUMMARY[band] : SUMMARY[band];
      assert.equal(c.summary, t(expected), band + ' ' + today);
    }
  }
  assert.throws(() => Q.bandCopy('not_ready', '2026-09-28'));
  assert.throws(() => Q.bandCopy(null, '2026-09-28'));
});

test('B2: unsure practice test gets the conditional baseline summary', () => {
  const band = Q.bandFor(parent(8, 'group', 'unsure'), '2026-09-28');
  assert.equal(band, 'final_weeks_baseline');
  const s = Q.bandCopy(band, '2026-09-28').summary;
  assert.ok(s.includes(t("If your student hasn't taken")));
  assert.ok(!/With no timed practice test/i.test(s));
});

test('B2: from Oct 31 no final-weeks summary says "in the right grade", all say "If your student registered"', () => {
  for (const band of FINAL) {
    const s = Q.bandCopy(band, '2026-10-31').summary;
    assert.ok(!s.includes('in the right grade to take the SHSAT this fall'), band);
    assert.ok(s.includes('If your student registered by October 30'), band);
  }
  for (const band of Q.BANDS) {
    for (const today of ALL_DATES) assert.ok(!/\bcan take\b/.test(Q.bandCopy(band, today).summary), band + ' ' + today);
  }
});

// ---------------------------------------------------------------------------
// Date lines (3.3, 2.2) and the plan preview (2.5)
// ---------------------------------------------------------------------------

test('countdownLine', () => {
  assert.equal(Q.countdownLine('2026-09-28'), 'About 7 weeks to the school-day test');
  assert.equal(Q.countdownLine('2026-11-04'), 'About 2 weeks to the school-day test');
  assert.equal(Q.countdownLine('2026-11-05'), 'Less than two weeks to the school-day test');
  assert.equal(Q.countdownLine('2026-11-17'), 'Less than two weeks to the school-day test');
  assert.equal(Q.countdownLine('2026-11-18'), 'The school-day test is today');
  assert.equal(Q.countdownLine('2026-11-19'), '');
  assert.throws(() => Q.countdownLine('soon'));
});

test('introDateLine at each boundary', () => {
  const soon = 'SHSAT registration opens Tuesday, October 6 and closes Friday, October 30. The school-day test is Wednesday, November 18.';
  const open = 'SHSAT registration is open until Friday, October 30. The school-day test is Wednesday, November 18.';
  const closed = 'The school-day SHSAT is Wednesday, November 18, the first year of the computer-adaptive format.';
  assert.equal(Q.introDateLine('2026-09-28'), soon);
  assert.equal(Q.introDateLine('2026-10-05'), soon);
  assert.equal(Q.introDateLine('2026-10-06'), open);
  assert.equal(Q.introDateLine('2026-10-30'), open);
  assert.equal(Q.introDateLine('2026-10-31'), closed);
  assert.equal(Q.introDateLine('2026-11-18'), closed);
  assert.equal(Q.introDateLine('2026-11-19'), '');
});

test('registrationLine at each boundary', () => {
  assert.equal(Q.registrationLine('2026-10-05'), 'Registration opens Tuesday, October 6 and closes Friday, October 30.');
  assert.equal(Q.registrationLine('2026-10-06'), 'Registration closes Friday, October 30.');
  assert.equal(Q.registrationLine('2026-10-30'), 'Registration closes Friday, October 30.');
  assert.equal(Q.registrationLine('2026-10-31'), '');
});

test('eyebrowLine: countdown for final-weeks bands, else the plan eyebrow', () => {
  assert.equal(Q.eyebrowLine('final_weeks_focus', '2026-09-28'), 'About 7 weeks to the school-day test');
  assert.equal(Q.eyebrowLine('full_year', '2026-09-28'), 'SHSAT plan for parents');
  assert.equal(Q.eyebrowLine('after_test', '2026-11-19'), 'SHSAT plan for parents');
});

test('planPreview: eyebrow, band name, then registration or the first summary sentence', () => {
  assert.deepEqual(Q.planPreview(parent(8, 'self', 'no'), '2026-09-28'), [
    'About 7 weeks to the school-day test',
    'Before November 18: begin with one timed practice test',
    'Registration opens Tuesday, October 6 and closes Friday, October 30.'
  ]);
  assert.equal(Q.planPreview(parent(9, 'tutor', 'once'), '2026-10-30')[2], 'Registration closes Friday, October 30.');
  assert.equal(Q.planPreview(parent(8, 'self', 'no'), '2026-10-31')[2], PREFIX_LATE);
  assert.deepEqual(Q.planPreview(parent(7, 'none', 'no'), '2026-09-28'), [
    'SHSAT plan for parents', 'Fall 2027: a steady year of practice', 'Your student would take the SHSAT in fall 2027.'
  ]);
  assert.equal(Q.planPreview(parent(6, 'none', 'no'), '2026-09-28')[2], 'Your student would take the SHSAT in fall 2028.');
  assert.equal(Q.planPreview(parent(5, 'none', 'no'), '2026-09-28')[2], 'Your student is still a few years away from the SHSAT.');
  assert.deepEqual(Q.planPreview(parent(8, 'self', 'no'), '2026-11-19'), [
    'SHSAT plan for parents', 'After the fall 2026 test', 'The fall 2026 SHSAT dates have passed.'
  ]);
  assert.equal(Q.planPreview({ role: 'student' }, '2026-09-28'), null);
});

// ---------------------------------------------------------------------------
// weekPlan (3.4, 2.6.5)
// ---------------------------------------------------------------------------

const REG_TEXT = t("Register for the SHSAT. Your student's school counselor can tell you how it works at their school.");
const LAST_RUN = 'One last timed run early in the week, then light review.';
const TEST_DATES = 'Wednesday, November 18 is the school-day test. Charter, private and homeschool students test on November 14, 15 or 21.';
const THIS_WEEK = {
  final_weeks_baseline: 'One timed, full-length practice test (100 questions in 180 minutes), then list the question types that were missed or took longest.',
  final_weeks_focus: 'Go back through the practice test your student took and list the question types that were missed or took longest.',
  final_weeks_sharpen: 'One timed, full-length practice test at the new length, then review every missed question.'
};
const rows = (plan) => plan.map((r) => [r.label, r.text]);

test('weekPlan 2026-09-28, baseline, worry math: the 2.6.5 example', () => {
  assert.deepEqual(rows(Q.weekPlan(parent(8, 'self', 'no', 'math'), '2026-09-28')), [
    ['This week', THIS_WEEK.final_weeks_baseline],
    ['Oct 6 to Oct 30', REG_TEXT],
    ['Weeks of Oct 5 to Nov 2', 'Most practice time on the math topics that take longest, plus one timed section each week.'],
    ['Week of Nov 9', LAST_RUN],
    ['Test dates', TEST_DATES]
  ]);
});

test('weekPlan 2026-10-06, focus, worry timing', () => {
  assert.deepEqual(rows(Q.weekPlan(parent(8, 'self', 'once', 'timing'), '2026-10-06')), [
    ['This week', THIS_WEEK.final_weeks_focus],
    ['By Fri, Oct 30', REG_TEXT],
    ['Weeks of Oct 12 to Nov 2', 'Most practice time on timed sets and pacing, plus one timed section each week.'],
    ['Week of Nov 9', LAST_RUN],
    ['Test dates', TEST_DATES]
  ]);
});

test('weekPlan 2026-10-26, sharpen, worry ela', () => {
  assert.deepEqual(rows(Q.weekPlan(parent(9, 'tutor', 'multiple', 'ela'), '2026-10-26')), [
    ['This week', THIS_WEEK.final_weeks_sharpen],
    ['By Fri, Oct 30', REG_TEXT],
    ['Week of Nov 2', 'Most practice time on longer reading passages and ELA questions, plus one timed section each week.'],
    ['Week of Nov 9', LAST_RUN],
    ['Test dates', TEST_DATES]
  ]);
});

test('weekPlan 2026-10-30, the last registration day, keeps the registration row', () => {
  assert.deepEqual(rows(Q.weekPlan(parent(8, 'none', 'no', 'consistency'), '2026-10-30')), [
    ['This week', THIS_WEEK.final_weeks_baseline],
    ['By Fri, Oct 30', REG_TEXT],
    ['Week of Nov 2', 'Most practice time on a fixed weekly schedule, plus one timed section each week.'],
    ['Week of Nov 9', LAST_RUN],
    ['Test dates', TEST_DATES]
  ]);
});

test('weekPlan 2026-10-31, baseline, worry where_stands (registration row gone)', () => {
  assert.deepEqual(rows(Q.weekPlan(parent(8, 'none', 'unsure', 'where_stands'), '2026-10-31')), [
    ['This week', THIS_WEEK.final_weeks_baseline],
    ['Week of Nov 2', 'Most practice time on the question types the practice test shows need the most time, plus one timed section each week.'],
    ['Week of Nov 9', LAST_RUN],
    ['Test dates', TEST_DATES]
  ]);
});

test('weekPlan 2026-11-02, 2026-11-10, 2026-11-17 and 2026-11-18', () => {
  assert.deepEqual(rows(Q.weekPlan(parent(8, 'group', 'no', 'adaptive'), '2026-11-02')), [
    ['This week', THIS_WEEK.final_weeks_baseline],
    ['Week of Nov 9', LAST_RUN],
    ['Test dates', TEST_DATES]
  ]);
  assert.deepEqual(rows(Q.weekPlan(parent(8, 'group', 'no', 'adaptive'), '2026-11-08')).map((r) => r[0]), ['This week', 'Week of Nov 9', 'Test dates']);
  for (const today of ['2026-11-09', '2026-11-10', '2026-11-15']) {
    assert.deepEqual(rows(Q.weekPlan(parent(8, 'group', 'once', 'math'), today)), [
      ['This week', LAST_RUN],
      ['Test dates', TEST_DATES]
    ], today);
  }
  for (const today of ['2026-11-16', '2026-11-17', '2026-11-18']) {
    assert.deepEqual(rows(Q.weekPlan(parent(9, 'self', 'once', 'process'), today)), [
      ['This week', 'Light review, and plenty of sleep before Wednesday.'],
      ['Test dates', TEST_DATES]
    ], today);
  }
});

test('weekPlan is [] for every non-final-weeks band', () => {
  for (const a of parentCombos()) {
    for (const today of ALL_DATES) {
      const band = Q.bandFor(a, today);
      if (!FINAL.includes(band)) assert.deepEqual(Q.weekPlan(a, today), [], band + ' ' + today);
    }
  }
  assert.deepEqual(Q.weekPlan({ role: 'student' }, '2026-09-28'), []);
});

test('weekPlan invariants: 2 to 5 rows, unique labels, last row "Test dates", no IvyPath or diagnostic', () => {
  for (const a of parentCombos()) {
    for (const today of ALL_DATES) {
      const band = Q.bandFor(a, today);
      if (!FINAL.includes(band)) continue;
      const plan = Q.weekPlan(a, today);
      assert.ok(plan.length >= 2 && plan.length <= 5, today);
      const labels = plan.map((r) => r.label);
      assert.equal(new Set(labels).size, labels.length);
      assert.equal(labels[0], 'This week');
      assert.equal(labels[labels.length - 1], 'Test dates');
      for (const r of plan) assert.ok(!/diagnostic|IvyPath/i.test(r.label + ' ' + r.text));
    }
  }
});

// ---------------------------------------------------------------------------
// takeawaysFor (3.5, 2.6.6)
// ---------------------------------------------------------------------------

function oracleIds(a, today, flags) {
  const band = oracleBand(a, today);
  if (band === 'after_test' || band === null) return [];
  let t1;
  if (a.grade >= 8) t1 = today < '2026-10-06' ? 'T1_REG_SOON' : (today <= '2026-10-30' ? 'T1_REG_OPEN' : 'T1_REG_CLOSED');
  else t1 = 'T1_G' + a.grade;
  let t2;
  if (a.grade === 5) t2 = 'T2_HABITS';
  else if (a.practice_test === 'no' || a.practice_test === 'unsure') t2 = 'T2_BASELINE';
  else if (a.prep === 'none' || a.prep === 'self') t2 = 'T2_USE_TEST';
  else t2 = 'T2_CHECK_FORMAT';
  let t3;
  if (a.grade === 5) t3 = 'T3_EARLY';
  else if (a.worry === 'process') t3 = flags && flags.T3_PROCESS_VERIFIED ? 'T3_PROCESS' : 'T3_PROCESS_BASIC';
  else t3 = { timing: 'T3_TIMING', math: 'T3_MATH', ela: 'T3_ELA', adaptive: 'T3_ADAPTIVE', consistency: 'T3_CONSISTENCY', where_stands: 'T3_WHERE' }[a.worry];
  return [t1, t2, t3];
}

const BODIES = {
  T1_REG_SOON: "Registration opens Tuesday, October 6 and closes Friday, October 30. The school-day test is Wednesday, November 18. The weekend dates, November 14, 15 and 21, are for charter, private and homeschool students. This week, ask your student's school counselor how registration works at their school.",
  T1_REG_OPEN: "Registration is open now and closes Friday, October 30. The school-day test is Wednesday, November 18. The weekend dates, November 14, 15 and 21, are for charter, private and homeschool students. This week, ask your student's school counselor how registration works at their school.",
  T1_REG_CLOSED: "Registration closed on Friday, October 30. The school-day test is Wednesday, November 18, and the weekend dates, November 14, 15 and 21, are for charter, private and homeschool students. If your student isn't registered, ask the school counselor right away about options.",
  T1_G9_NOTE: 'For 9th graders, the test is for 10th-grade seats, and there are far fewer of those than 9th-grade seats.',
  T1_G7: "Students usually take the SHSAT in the fall of 8th grade. For your student, that's fall 2027, a full year away, which leaves room to prepare at a steady pace.",
  T1_G6: "Students usually take the SHSAT in the fall of 8th grade, so for your student that's fall 2028. The test became computer-adaptive in fall 2026, so any practice should match the new length: 100 questions in 180 minutes, on a computer.",
  T1_G5: "Students usually take the SHSAT in the fall of 8th grade. For your student, that's at least three years away.",
  T2_BASELINE: 'Start with one timed, full-length practice test: 100 questions in 180 minutes, on a computer if you can. Afterward, list the question types that were missed or took longest. That list shows where practice time should go first.',
  T2_USE_TEST: 'Go back through the practice test your student already took. Mark each question that was missed or took too long, and group them by type. Build each week around the two or three biggest groups.',
  T2_CHECK_FORMAT: "Keep what's working, and check that practice matches the new test: 100 questions in 180 minutes, on a computer. Ask your student's current program whether its practice tests use the new length.",
  T2_HABITS: 'Build everyday habits: reading longer books and articles, and steady practice with fractions, ratios and word problems. These give your student a strong base for later.',
  T3_TIMING: "Practice pacing with timed sets rather than extra untimed work. On the new test there's no penalty for a wrong answer, and math questions and stand-alone ELA questions can't be revisited once answered, so practice making a best guess and moving on.",
  T3_MATH: 'Pick the math topics that come up most and the ones that take your student longest, and practice a few of each every week. Short, regular practice on those topics usually helps more than long weekend sessions.',
  T3_ELA: 'Reading and ELA build more slowly than math, so regular practice with longer passages matters. Have your student check each answer against the text before moving on.',
  T3_ADAPTIVE: 'Fall 2026 is the first year the SHSAT is computer-adaptive: each answer changes which question comes next. Practicing on a computer, at the new 100-question length, helps test day feel familiar.',
  T3_CONSISTENCY: 'Pick two or three fixed practice times each week and keep them, even in busy weeks. With IvyPath, you also get automated progress reports after sessions, so you can see what your student worked on.',
  T3_WHERE: 'A timed, full-length practice test is the clearest way to find out. Afterward, look at which question types were missed or took longest, not only the total.',
  T3_PROCESS: "On the application, you list the specialized high schools your student would attend, in order of preference. The order matters: offers go by score, then by the order you listed the schools. The DOE's specialized high schools page explains each step.",
  T3_PROCESS_BASIC: "Start with the DOE's specialized high schools page: it explains registration, the test and how offers are made. On a free 15-minute consultation, we can go over any step you're unsure about.",
  T3_EARLY: "It's early, and that helps. For now, reading for fun and everyday math matter more than test prep. When your student reaches 6th or 7th grade, a free 15-minute consultation can help you decide when to start."
};

test('TAKEAWAY_TEXT holds every 2.6.6 body, rendered', () => {
  assert.deepEqual(Object.keys(Q.TAKEAWAY_TEXT).sort(), Object.keys(BODIES).sort());
  for (const id of Object.keys(BODIES)) assert.equal(Q.TAKEAWAY_TEXT[id], t(BODIES[id]), id);
});

test('takeawaysFor: exact ids per 3.5 for every combination, date and flag setting', () => {
  const flagSets = [undefined, { G9_NOTE: null, T3_PROCESS_VERIFIED: false }, { G9_NOTE: true, T3_PROCESS_VERIFIED: true }];
  for (const flags of flagSets) {
    for (const a of parentCombos()) {
      for (const today of BAND_DATES) {
        const got = Q.takeawaysFor(a, today, flags);
        const ids = oracleIds(a, today, flags);
        assert.deepEqual(got.map((x) => x.id), ids, JSON.stringify({ a, today, flags }));
        assert.equal(got.length, Q.bandFor(a, today) === 'after_test' ? 0 : 3);
      }
    }
  }
  assert.deepEqual(Q.takeawaysFor({ role: 'student' }, '2026-09-28'), []);
});

test('takeawaysFor: titles and bodies', () => {
  const g8 = Q.takeawaysFor(parent(8, 'self', 'no', 'timing'), '2026-09-28');
  assert.deepEqual(g8.map((x) => x.title), ['The dates that matter', 'Where to start', 'Your biggest worry: finishing in time']);
  assert.deepEqual(g8.map((x) => x.body), [t(BODIES.T1_REG_SOON), t(BODIES.T2_BASELINE), t(BODIES.T3_TIMING)]);

  const g7 = Q.takeawaysFor(parent(7, 'tutor', 'multiple', 'where_stands'), '2026-09-28');
  assert.deepEqual(g7.map((x) => x.title), ['When your student takes the SHSAT', 'Where to start', 'Your biggest worry: knowing where things stand']);
  assert.deepEqual(g7.map((x) => x.id), ['T1_G7', 'T2_CHECK_FORMAT', 'T3_WHERE']);

  const g5 = Q.takeawaysFor(parent(5, 'tutor', 'multiple', 'math'), '2026-11-19');
  assert.deepEqual(g5.map((x) => x.title), ['When your student takes the SHSAT', 'Where to start', 'Your biggest worry']);
  assert.deepEqual(g5.map((x) => x.body), [t(BODIES.T1_G5), t(BODIES.T2_HABITS), t(BODIES.T3_EARLY)]);

  const titles = {};
  for (const w of WORRIES) titles[w] = Q.takeawaysFor(parent(8, 'self', 'no', w), '2026-09-28')[2].title;
  assert.deepEqual(titles, {
    timing: 'Your biggest worry: finishing in time', math: 'Your biggest worry: math', ela: 'Your biggest worry: reading and ELA',
    adaptive: 'Your biggest worry: the new format', consistency: 'Your biggest worry: staying consistent',
    where_stands: 'Your biggest worry: knowing where things stand', process: 'Your biggest worry: registration and offers'
  });
});

test('takeawaysFor: G9 note appended for grade 9 only when verified; T3_PROCESS only when verified', () => {
  const g9 = parent(9, 'self', 'no', 'process');
  const off = Q.takeawaysFor(g9, '2026-10-06');
  assert.equal(off[0].body, t(BODIES.T1_REG_OPEN));
  assert.equal(off[2].id, 'T3_PROCESS_BASIC');
  const on = Q.takeawaysFor(g9, '2026-10-06', { G9_NOTE: true, T3_PROCESS_VERIFIED: true });
  assert.equal(on[0].id, 'T1_REG_OPEN');
  assert.equal(on[0].body, t(BODIES.T1_REG_OPEN) + ' ' + BODIES.T1_G9_NOTE);
  assert.equal(on[2].id, 'T3_PROCESS');
  assert.equal(on[2].body, t(BODIES.T3_PROCESS));
  const g8 = Q.takeawaysFor(parent(8, 'self', 'no', 'process'), '2026-10-06', { G9_NOTE: true });
  assert.equal(g8[0].body, t(BODIES.T1_REG_OPEN));
  assert.deepEqual({ ...Q.COPY_FLAG_DEFAULTS }, { G9_NOTE: null, T3_PROCESS_VERIFIED: false });
});

test('takeaway structure: no body names the diagnostic; at most one IvyPath or consultation mention', () => {
  for (const flags of [undefined, { G9_NOTE: true, T3_PROCESS_VERIFIED: true }]) {
    for (const a of parentCombos()) {
      for (const today of BAND_DATES) {
        for (const item of Q.takeawaysFor(a, today, flags)) {
          assert.deepEqual(lintTakeawayBody(item.body), [], item.id);
        }
      }
    }
  }
});

test('takeawaysFor: invalid worry throws', () => {
  assert.throws(() => Q.takeawaysFor(parent(8, 'self', 'no', 'money'), '2026-09-28'));
  assert.throws(() => Q.weekPlan(parent(8, 'self', 'no', 'money'), '2026-09-28'));
});

// ---------------------------------------------------------------------------
// schoolsLine (2.6.2)
// ---------------------------------------------------------------------------

test('schoolsLine', () => {
  const CUT = 'Fall 2026 is the first computer-adaptive SHSAT, so past cutoffs are only a rough guide.';
  const UNDECIDED = 'Schools: still deciding. We can go over the options on the consultation.';
  assert.deepEqual(Q.schoolsLine(['not_sure'], 8), [UNDECIDED, CUT]);
  assert.deepEqual(Q.schoolsLine(['not_sure'], 5), [UNDECIDED]);
  assert.deepEqual(Q.schoolsLine(['stuyvesant'], 5), ['Aiming for: Stuyvesant.']);
  assert.deepEqual(Q.schoolsLine(['stuyvesant'], 6), ['Aiming for: Stuyvesant.', CUT]);
  assert.deepEqual(Q.schoolsLine(['bronx_science', 'stuyvesant'], 7), ['Aiming for: Stuyvesant and Bronx Science.', CUT]);
  assert.deepEqual(Q.schoolsLine(['brooklyn_tech', 'stuyvesant', 'bronx_science'], 9),
    ['Aiming for: Stuyvesant, Bronx Science and Brooklyn Tech.', CUT]);
  assert.deepEqual(Q.schoolsLine(['stuyvesant'], '8'), ['Aiming for: Stuyvesant.', CUT]);
  assert.deepEqual(Q.schoolNames(['hsmse_ccny', 'stuyvesant']), ['Stuyvesant', 'Math, Science & Engineering at City College']);
  assert.deepEqual(Q.schoolNames(['not_sure']), []);
  assert.throws(() => Q.schoolsLine([], 8));
  assert.throws(() => Q.schoolsLine(['not_sure', 'stuyvesant'], 8));
  assert.throws(() => Q.schoolsLine(['laguardia'], 8));
});

// ---------------------------------------------------------------------------
// Diagnostic availability (3.6)
// ---------------------------------------------------------------------------

test('diagAvailable: DIAG_GRADES in Phase 1, the platform answer when lead_ref is set', () => {
  assert.deepEqual([...Q.DIAG_GRADES], [6, 7, 8]);
  assert.equal(Q.diagAvailable(5), false);
  assert.equal(Q.diagAvailable(6), true);
  assert.equal(Q.diagAvailable(8), true);
  assert.equal(Q.diagAvailable(9), false);
  assert.equal(Q.diagAvailable('7'), true);
  assert.equal(Q.diagAvailable(9, { diagGrades: [6, 7, 8, 9] }), true);
  assert.equal(Q.diagAvailable(9, { leadRef: 'tok_abcdefghij', diagAllowed: true }), true);
  assert.equal(Q.diagAvailable(8, { leadRef: 'tok_abcdefghij', diagAllowed: false }), false);
  assert.equal(Q.diagAvailable(8, { leadRef: null, diagAllowed: false }), true);
});

test('diagnosticBlock: none for grade 5, the grade 9 line, the form, or the link variant', () => {
  assert.equal(Q.diagnosticBlock(5, { captured: true, hasEmail: true }), 'none');
  assert.equal(Q.diagnosticBlock(5, { captured: true, hasEmail: true, diagGrades: [5, 6, 7, 8] }), 'none');
  assert.equal(Q.diagnosticBlock(9, { captured: true, hasEmail: true }), 'grade9');
  assert.equal(Q.diagnosticBlock(9, { captured: false, hasEmail: false }), 'grade9');
  assert.equal(Q.diagnosticBlock(9, { captured: true, hasEmail: true, diagGrades: [6, 7, 8, 9] }), 'form');
  assert.equal(Q.diagnosticBlock(8, { captured: true, hasEmail: true }), 'form');
  assert.equal(Q.diagnosticBlock(6, { captured: true, hasEmail: true }), 'form');
  assert.equal(Q.diagnosticBlock(8, { captured: false, hasEmail: true }), 'link');
  assert.equal(Q.diagnosticBlock(7, { captured: true, hasEmail: false }), 'link');
  assert.equal(Q.diagnosticBlock(8), 'link');
  assert.equal(Q.diagnosticBlock(8, { captured: true, hasEmail: true, leadRef: 'tok_abcdefghij', diagAllowed: false }), 'link');
});

// ---------------------------------------------------------------------------
// Texting windows (3.7)
// ---------------------------------------------------------------------------

test('textWindowState at every boundary of 3.7', () => {
  const hm = (h, m) => h * 60 + m;
  const cases = [
    [hm(7, 59), false, 480, false, 'text at 8:00 AM', 'this morning'],
    [hm(8, 0), true, hm(8, 0), false, 'text now', 'today'],
    [hm(8, 59), true, hm(8, 59), false, 'text now', 'today'],
    [hm(9, 0), false, 720, false, 'text at 12:00 PM', 'later today'],
    [hm(11, 59), false, 720, false, 'text at 12:00 PM', 'later today'],
    [hm(12, 0), true, hm(12, 0), false, 'text now', 'today'],
    [hm(13, 29), true, hm(13, 29), false, 'text now', 'today'],
    [hm(13, 30), false, 1050, false, 'text at 5:30 PM', 'later today'],
    [hm(17, 29), false, 1050, false, 'text at 5:30 PM', 'later today'],
    [hm(17, 30), true, hm(17, 30), false, 'text now', 'today'],
    [hm(20, 29), true, hm(20, 29), false, 'text now', 'today'],
    [hm(20, 30), false, 480, true, 'text tomorrow 8:00 AM', 'tomorrow morning'],
    [hm(23, 0), false, 480, true, 'text tomorrow 8:00 AM', 'tomorrow morning'],
    [0, false, 480, false, 'text at 8:00 AM', 'this morning']
  ];
  for (const [m, inWindow, nextStartMin, nextDay, alertPhrase, parentPhrase] of cases) {
    assert.deepEqual({ ...Q.textWindowState(m) }, { inWindow, nextStartMin, nextDay, alertPhrase, parentPhrase }, String(m));
  }
  assert.throws(() => Q.textWindowState(1440));
  assert.throws(() => Q.textWindowState(-1));
  assert.throws(() => Q.textWindowState(NaN));
});

test('textWindowState with the exemption constant [[480, 1230]]', () => {
  const W = [[480, 1230]];
  assert.equal(Q.textWindowState(600, W).alertPhrase, 'text now');
  assert.equal(Q.textWindowState(479, W).parentPhrase, 'this morning');
  assert.equal(Q.textWindowState(1230, W).alertPhrase, 'text tomorrow 8:00 AM');
});

test('formatClock', () => {
  assert.equal(Q.formatClock(0), '12:00 AM');
  assert.equal(Q.formatClock(480), '8:00 AM');
  assert.equal(Q.formatClock(720), '12:00 PM');
  assert.equal(Q.formatClock(810), '1:30 PM');
  assert.equal(Q.formatClock(1050), '5:30 PM');
  assert.equal(Q.formatClock(1439), '11:59 PM');
});

// ---------------------------------------------------------------------------
// Phone, name and email normalization (5.1)
// ---------------------------------------------------------------------------

test('normalizeUsMobile accepts the 8.1 list', () => {
  // The platform rule trims, then caps at 40 characters, so surrounding spaces never count.
  for (const raw of ['(917) 555-0142', '917.555.0142', '+1 917 555 0142', '19175550142', '9175550142', '1 (917) 555-0142',
    ' 917-555-0142 ', '+1 917 555 0142' + ' '.repeat(40)]) {
    assert.equal(Q.normalizeUsMobile(raw), '+19175550142', raw);
  }
});

test('normalizeUsMobile rejects the 8.1 list and non-strings', () => {
  for (const raw of ['1234567890', '0175550142', '9171555014', '2222222222', '5555555555', '917555014', '191755501423',
    '+44 20 7946 0958', '', '   ', 'call me', '1 (117) 555-0142', '9'.repeat(10), '917-555-0142' + '-'.repeat(30)]) {
    assert.equal(Q.normalizeUsMobile(raw), null, raw);
  }
  for (const raw of [null, undefined, 9175550142, {}, []]) assert.equal(Q.normalizeUsMobile(raw), null);
});

test('formatUsPhone', () => {
  assert.equal(Q.formatUsPhone('+19175550142'), '(917) 555-0142');
  assert.equal(Q.formatUsPhone('9175550142'), '(917) 555-0142');
  assert.equal(Q.formatUsPhone('not a phone'), '');
  assert.equal(Q.formatUsPhone(null), '');
});

test('sanitizeName strips tags, digits and control characters and keeps real names', () => {
  assert.equal(Q.sanitizeName('  Sam   Rivera '), 'Sam Rivera');
  assert.equal(Q.sanitizeName("O'Neil-Smith"), "O'Neil-Smith");
  assert.equal(Q.sanitizeName('Mary O\u2019Neil'), "Mary O'Neil");
  assert.equal(Q.sanitizeName('陈丽'), '陈丽');
  assert.equal(Q.sanitizeName('José Núñez'), 'José Núñez');
  assert.equal(Q.sanitizeName('Jose\u0301'), 'José');
  assert.equal(Q.sanitizeName('Dr. Ana Lopez'), 'Dr. Ana Lopez');
  assert.equal(Q.sanitizeName('<b>Sam</b> Rivera'), 'Sam Rivera');
  assert.equal(Q.sanitizeName('<script>alert(1)</script>Sam'), 'alert Sam');
  assert.equal(Q.sanitizeName('Sam2 Rivera99'), 'Sam Rivera');
  assert.equal(Q.sanitizeName('Sam\u0000\u0007 Rivera\u007f'), 'Sam Rivera');
  assert.equal(Q.sanitizeName('Sam\nRivera\t'), 'Sam Rivera');
  assert.equal(Q.sanitizeName('Sam \uD83D\uDE42 Rivera'), 'Sam Rivera');
  assert.equal(Q.sanitizeName('Sam & Pat'), 'Sam Pat');
  assert.equal(Q.sanitizeName(null), '');
  assert.equal(Q.sanitizeName(undefined), '');
  assert.equal(Q.sanitizeName('a'.repeat(200)).length, 120);
  assert.equal(Q.sanitizeName('a'.repeat(200), 50).length, 50);
  assert.equal(Q.sanitizeName('ab cd', 3), 'ab');
});

test('normalizeEmail and isValidEmail (the platform zod email rule)', () => {
  assert.equal(Q.normalizeEmail('  Sam.Rivera@Example.COM '), 'sam.rivera@example.com');
  assert.equal(Q.normalizeEmail(null), '');
  for (const ok of ['sam@example.com', '  SAM@EXAMPLE.COM ', 'a@b.co', "o'neil+quiz@mail.example.org", 'sam_r-1@sub.example.com']) {
    assert.equal(Q.isValidEmail(ok), true, ok);
  }
  for (const bad of ['sam@example', 'sam.example.com', 'sam@', '@example.com', '.sam@example.com', 'sam.@example.com',
    'sam..r@example.com', 'sam@exa_mple.com', 'sam @example.com', '', null, 'a@' + 'b'.repeat(200) + '.com']) {
    assert.equal(Q.isValidEmail(bad), false, String(bad));
  }
});

// ---------------------------------------------------------------------------
// isSchoolEmail: a port of school-email-guard.js isSchoolAddress
// ---------------------------------------------------------------------------

const SCHOOL_TABLE = [
  ['student@nycstudents.net', true, 'exact domain'],
  ['  Student@NYCSTUDENTS.NET ', true, 'case and spaces'],
  ['student@nycstudents.net.', true, 'trailing dot'],
  ['student@mail.nycstudents.net', true, 'subdomain'],
  ['student@nycstudent.net', true, 'one edit (missing s)'],
  ['student@nycstudemts.net', true, 'one edit (substitution)'],
  ['student@mycstudents.net', true, 'one edit at the start'],
  ['student@nycstudents.ne', true, 'one edit at the end'],
  ['student@nycstudnets.net', true, 'two edits after nyc (transposition)'],
  ['student@nycsstudents.nett', true, 'two edits after nyc'],
  ['student@xxcstudents.net', false, 'two edits, not after nyc'],
  ['student@nycstudents.com', false, 'three edits'],
  ['student@nycstudents.org', false, 'three edits'],
  ['student@schools.nyc.gov', false, 'unrelated nyc domain'],
  ['parent@gmail.com', false, 'unrelated'],
  ['parent@icloud.com', false, 'unrelated'],
  ['nycstudents.net', false, 'no @'],
  ['', false, 'empty'],
  [null, false, 'null']
];

test('isSchoolEmail: the guard table', () => {
  for (const [addr, expected, why] of SCHOOL_TABLE) assert.equal(Q.isSchoolEmail(addr), expected, why + ': ' + addr);
});

test('isSchoolEmail agrees with school-email-guard.js on the shared list', () => {
  const src = fs.readFileSync(path.join(ROOT, 'school-email-guard.js'), 'utf8');
  const sandbox = {
    window: {},
    document: { addEventListener() {}, documentElement: { getAttribute() { return 'en'; } } }
  };
  vm.runInNewContext(src, sandbox);
  const guard = sandbox.window.ivpIsSchoolEmail;
  assert.equal(typeof guard, 'function');
  const extra = ['a@nycstudents.net.au', 'a@nycstudentsnet', 'a@NycStudents.Net', 'a@b@nycstudents.net', 'x@nyc.net', 'x@students.net'];
  for (const addr of SCHOOL_TABLE.map((r) => r[0]).concat(extra)) {
    assert.equal(Q.isSchoolEmail(addr), guard(addr), String(addr));
  }
});

test('the school-address error is the guard block message, word for word', () => {
  const src = fs.readFileSync(path.join(ROOT, 'school-email-guard.js'), 'utf8');
  assert.ok(src.includes(Q.ERRORS.school));
});

// ---------------------------------------------------------------------------
// quiz_id (5.1)
// ---------------------------------------------------------------------------

test('uuidFromBytes matches the shared fixture and the platform uuid rule', () => {
  assert.equal(Q.uuidFromBytes(FIXTURES.uuid_fallback.bytes), FIXTURES.uuid_fallback.uuid);
  assert.equal(Q.uuidFromBytes(new Array(16).fill(0)), '00000000-0000-4000-8000-000000000000');
  assert.equal(Q.uuidFromBytes(new Array(16).fill(255)), 'ffffffff-ffff-4fff-bfff-ffffffffffff');
  assert.ok(Q.isUuid(FIXTURES.uuid_fallback.uuid));
});

test('newQuizId prefers randomUUID, falls back to getRandomValues', () => {
  assert.equal(Q.newQuizId({ randomUUID: () => '3b1f0c9e-6a0e-4f2d-9d6b-2f4f7b0c1a11' }), '3b1f0c9e-6a0e-4f2d-9d6b-2f4f7b0c1a11');
  const fake = { getRandomValues(b) { for (let i = 0; i < b.length; i++) b[i] = FIXTURES.uuid_fallback.bytes[i]; return b; } };
  assert.equal(Q.newQuizId(fake), FIXTURES.uuid_fallback.uuid);
  const throwing = { randomUUID() { throw new Error('insecure context'); }, getRandomValues: fake.getRandomValues };
  assert.equal(Q.newQuizId(throwing), FIXTURES.uuid_fallback.uuid);
  const a = Q.newQuizId();
  const b = Q.newQuizId({});
  assert.ok(Q.isUuid(a) && Q.isUuid(b));
  assert.notEqual(a, b);
});

test('isUuid follows zod v4 .uuid() (RFC 9562 version and variant)', () => {
  assert.ok(Q.isUuid('3B1F0C9E-6A0E-4F2D-9D6B-2F4F7B0C1A11'));
  assert.ok(!Q.isUuid('3b1f0c9e-6a0e-0f2d-9d6b-2f4f7b0c1a11'));
  assert.ok(!Q.isUuid('3b1f0c9e-6a0e-4f2d-7d6b-2f4f7b0c1a11'));
  assert.ok(!Q.isUuid('3b1f0c9e6a0e4f2d9d6b2f4f7b0c1a11'));
  assert.ok(!Q.isUuid(null));
});

// ---------------------------------------------------------------------------
// Attribution allowlist (5.3.1 step 8)
// ---------------------------------------------------------------------------

test('sanitizeAttribution keeps the platform keys, strings only, 300 characters, no control characters', () => {
  const out = Q.sanitizeAttribution({
    utm_source: 'google', utm_medium: 'cpc', gclid: 12345, wbraid: 'x', evil: 'y', v: 'parent',
    referrer: 'https://www.google.com\u0000/x', ref: '', first_landing: '/shsat/quiz', utm_term: 'a'.repeat(400),
    heard_from: '  friend  '
  });
  assert.deepEqual(out, {
    utm_source: 'google', utm_medium: 'cpc', v: 'parent', referrer: 'https://www.google.com/x',
    first_landing: '/shsat/quiz', utm_term: 'a'.repeat(300), heard_from: 'friend'
  });
  for (const bad of [null, undefined, 'utm_source=google', 42, ['google']]) assert.deepEqual(Q.sanitizeAttribution(bad), {});
  assert.deepEqual([...Q.ATTRIBUTION_KEYS], ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'fbclid', 'gclid', 'ref', 'referrer', 'ivp_lp', 'page', 'v', 'mc', 'mc_sub', 'first_landing', 'first_referrer', 'heard_from']);
});

// ---------------------------------------------------------------------------
// validateQuizPayload (5.2, 5.3.1)
// ---------------------------------------------------------------------------

const clone = (o) => JSON.parse(JSON.stringify(o));
const BASE = FIXTURES.valid[0].body;

test('ERRORS are the 5.3.1 strings', () => {
  assert.deepEqual({ ...Q.ERRORS }, {
    name: 'Please enter your name.',
    phone: 'Please enter a 10-digit US mobile number.',
    email: 'Please enter a valid email address.',
    school: t("Please use a personal or parent email. We can't deliver to @nycstudents.net school accounts."),
    consent: 'Please check the box so we can follow up.',
    generic: 'Please check your entries and try again.'
  });
});

test('validateQuizPayload: every valid fixture passes', () => {
  for (const f of FIXTURES.valid) {
    const r = Q.validateQuizPayload(clone(f.body));
    assert.equal(r.ok, true, f.name + ' ' + JSON.stringify(r));
  }
});

test('validateQuizPayload: every invalid fixture fails with the expected field', () => {
  for (const f of FIXTURES.invalid) {
    const r = Q.validateQuizPayload(clone(f.body));
    assert.equal(r.ok, false, f.name);
    assert.equal(r.field === undefined ? null : r.field, f.field, f.name);
    assert.equal(typeof r.error, 'string');
  }
});

test('validateQuizPayload: invalid fixtures use only the three platform fields', () => {
  for (const f of FIXTURES.invalid) {
    assert.ok([null, 'parent_name', 'phone', 'parent_email'].includes(f.platform_field), f.name);
  }
});

test('validateQuizPayload: the normalized value', () => {
  const body = clone(BASE);
  body.parent_name = '  Sam   Rivera2 ';
  body.parent_email = '  Sam.Rivera@Example.com ';
  body.phone = '(917) 555-0142';
  body.student_grade = '8';
  body.attribution = { utm_source: 'google', gclid: 5, junk: 'x' };
  body.turnstile_token = 'tok';
  body.extra_top_level = 'dropped';
  delete body.delivery;
  delete body.company_name;
  const r = Q.validateQuizPayload(body);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, {
    quiz_id: '3b1f0c9e-6a0e-4f2d-9d6b-2f4f7b0c1a11',
    test_type: 'SHSAT',
    parent_name: 'Sam Rivera',
    parent_email: 'sam.rivera@example.com',
    phone: '+19175550142',
    student_grade: 8,
    consent: true,
    consent_version: 'quiz-2026-09-28',
    quiz: { version: 1, role: 'parent', targets: ['stuyvesant', 'bronx_science'], prep: 'self', practice_test: 'no', worry: 'timing', band: 'final_weeks_baseline' },
    attribution: { utm_source: 'google' },
    company_name: '',
    delivery: 'alert_and_copy'
  });
  assert.notEqual(r.value.quiz, body.quiz, 'quiz is copied, not shared');
});

test('validateQuizPayload: each error branch and its field', () => {
  const run = (patch, quizPatch) => {
    const b = clone(BASE);
    Object.assign(b, patch || {});
    if (quizPatch) Object.assign(b.quiz, quizPatch);
    return Q.validateQuizPayload(b);
  };
  assert.deepEqual(run({ parent_name: ' 1 ' }), { ok: false, field: 'parent_name', error: Q.ERRORS.name });
  assert.deepEqual(run({ parent_name: 42 }), { ok: false, field: 'parent_name', error: Q.ERRORS.name });
  assert.deepEqual(run({ phone: '555-0142' }), { ok: false, field: 'phone', error: Q.ERRORS.phone });
  assert.deepEqual(run({ phone: 9175550142 }), { ok: false, field: 'phone', error: Q.ERRORS.phone });
  assert.deepEqual(run({ parent_email: 'sam@example' }), { ok: false, field: 'parent_email', error: Q.ERRORS.email });
  assert.deepEqual(run({ parent_email: 'student@nycstudents.net' }), { ok: false, field: 'parent_email', error: Q.ERRORS.school });
  assert.deepEqual(run({ parent_email: 'student@nycstudent.net' }), { ok: false, field: 'parent_email', error: Q.ERRORS.school });
  assert.deepEqual(run({ consent: false }), { ok: false, field: 'consent', error: Q.ERRORS.consent });
  assert.deepEqual(run({ consent_version: 'quiz-2025-01-01' }), { ok: false, field: 'consent', error: Q.ERRORS.consent });
  assert.deepEqual(run({ test_type: 'SAT' }), { ok: false, error: Q.ERRORS.generic });
  assert.deepEqual(run({ delivery: 'everything' }), { ok: false, error: Q.ERRORS.generic });
  assert.deepEqual(run(null, { targets: 'stuyvesant' }), { ok: false, error: Q.ERRORS.generic });
  assert.deepEqual(run(null, { targets: SCHOOLS.concat(['stuyvesant']) }), { ok: false, error: Q.ERRORS.generic });
  for (const bad of [null, undefined, 'x', 42, [], [BASE]]) {
    assert.deepEqual(Q.validateQuizPayload(bad), { ok: false, error: Q.ERRORS.generic });
  }
});

test('validateQuizPayload: fields are checked in form order (name, mobile, email, consent)', () => {
  const b = clone(BASE);
  b.parent_name = '';
  b.phone = '1';
  b.parent_email = 'x';
  b.consent = false;
  b.test_type = 'SAT';
  assert.equal(Q.validateQuizPayload(b).field, 'parent_name');
  b.parent_name = 'Sam';
  assert.equal(Q.validateQuizPayload(b).field, 'phone');
  b.phone = '9175550142';
  assert.equal(Q.validateQuizPayload(b).field, 'parent_email');
  b.parent_email = 'sam@example.com';
  assert.equal(Q.validateQuizPayload(b).field, 'consent');
  b.consent = true;
  assert.equal(Q.validateQuizPayload(b).field, undefined);
});

test('validateQuizPayload: delivery, honeypot, attribution and fallback_reason are lenient where a lead could be lost', () => {
  const v = (patch) => { const b = clone(BASE); Object.assign(b, patch); return Q.validateQuizPayload(b); };
  for (const d of ['alert_and_copy', 'alert_only', 'copy_only']) assert.equal(v({ delivery: d }).value.delivery, d);
  assert.equal(v({ company_name: 'Acme' }).value.company_name, 'Acme');
  assert.equal(v({ company_name: 123 }).value.company_name, '123');
  assert.equal(v({ company_name: 'x'.repeat(500) }).value.company_name.length, 200);
  assert.equal(v({ company_name: null }).value.company_name, '');
  assert.deepEqual(v({ attribution: 'utm_source=google' }).value.attribution, {});
  assert.deepEqual(v({ attribution: null }).value.attribution, {});
  assert.equal(v({ fallback_reason: 'platform_500' }).value.fallback_reason, 'platform_500');
  assert.equal(v({ fallback_reason: 'platform_network' }).value.fallback_reason, 'platform_network');
  assert.equal('fallback_reason' in v({ fallback_reason: '<b>x</b>' }).value, false);
  assert.equal('fallback_reason' in v({ fallback_reason: 42 }).value, false);
  assert.equal('turnstile_token' in v({ turnstile_token: 'x'.repeat(9000) }).value, false);
});

// ---------------------------------------------------------------------------
// firstMissing (2.7: the controller goes to the first unanswered question)
// ---------------------------------------------------------------------------

test('firstMissing returns the first unanswered or invalid question, or null', () => {
  assert.equal(Q.firstMissing(undefined), 'role');
  assert.equal(Q.firstMissing({}), 'role');
  assert.equal(Q.firstMissing({ role: 'teacher' }), 'role');
  assert.equal(Q.firstMissing({ role: 'student' }), null);
  assert.equal(Q.firstMissing({ role: 'parent' }), 'grade');
  assert.equal(Q.firstMissing({ role: 'parent', grade: 4 }), 'grade');
  assert.equal(Q.firstMissing({ role: 'parent', grade: 8 }), 'targets');
  assert.equal(Q.firstMissing({ role: 'parent', grade: 8, targets: [] }), 'targets');
  assert.equal(Q.firstMissing({ role: 'parent', grade: 8, targets: ['not_sure', 'stuyvesant'] }), 'targets');
  assert.equal(Q.firstMissing({ role: 'parent', grade: 8, targets: ['stuyvesant'] }), 'prep');
  assert.equal(Q.firstMissing({ role: 'parent', grade: 8, targets: ['stuyvesant'], prep: 'self' }), 'practice_test');
  assert.equal(Q.firstMissing({ role: 'parent', grade: 8, targets: ['stuyvesant'], prep: 'self', practice_test: 'no' }), 'worry');
  assert.equal(Q.firstMissing(parent(8, 'self', 'no', 'math')), null);
});

// ---------------------------------------------------------------------------
// Copy lint (2.11)
// ---------------------------------------------------------------------------

test('copy-lint helper catches each banned pattern and honors only the exact exceptions', () => {
  const bad = ['Great for kids', 'the cost is low', 'our fees', 'see pricing', 'a discount', 'cheap', 'affordable',
    'a course', 'the class', 'small classes', 'our teachers', 'an instructor', 'a sales call', 'score guarantee',
    'exactly where', 'the exact score', '20 points', 'points away', 'cutoffs', 'the cutoff', 'a real number', 'readiness check',
    'is behind', 'not ready', 'struggling', 'weak areas', 'weaknesses', 'falling short', 'raise the score',
    'improves their scores', 'scores will increase', 'practice in the new format', 'practicing on it in the computer-adaptive format',
    'we can help you set one up', 'we replicate the test', 'she aced it', 'Ivy League tutors', '/book.html?ref=abc',
    'always', 'a \u2014 b', 'a \u2013 b', 'Great!', 'Hi {name}'];
  for (const s of bad) assert.notDeepEqual(lintText(s), [], s);
  assert.deepEqual(lintText('Fall 2026 is the first computer-adaptive SHSAT, so past cutoffs are only a rough guide.'), []);
  assert.deepEqual(lintText('Results shown reflect the experiences of individual IvyPath students and are not a guarantee of any particular score or admissions outcome.'), []);
  assert.notDeepEqual(lintText('Past cutoffs are only a rough guide.'), []);
  assert.notDeepEqual(lintText('This is not a guarantee.'), []);
  assert.deepEqual(lintText('Great!', { quizOnly: false }), []);
  assert.deepEqual(lintText('Your student can finish in time.'), []);
});

test('copy lint: every string exported from shsat-quiz-logic.js passes 2.11', () => {
  const strings = collectStrings(Q);
  assert.ok(strings.length > 150, 'walked the exports (' + strings.length + ' strings)');
  for (const { path: p, text } of strings) assert.deepEqual(lintText(text), [], p + ': ' + text);
});

test('copy lint: every rendered combination passes 2.11', () => {
  const seen = new Set();
  const add = (s, where) => { if (s && !seen.has(s)) { seen.add(s); assert.deepEqual(lintText(s), [], where + ': ' + s); } };
  const flagSets = [undefined, { G9_NOTE: true, T3_PROCESS_VERIFIED: true }];
  for (const today of ALL_DATES) {
    add(Q.countdownLine(today), 'countdownLine');
    add(Q.introDateLine(today), 'introDateLine');
    add(Q.registrationLine(today), 'registrationLine');
    for (const band of Q.BANDS) {
      const c = Q.bandCopy(band, today);
      add(c.name, 'band name');
      add(c.summary, 'band summary');
      add(Q.eyebrowLine(band, today), 'eyebrow');
    }
    for (const a of parentCombos()) {
      for (const line of Q.planPreview(a, today)) add(line, 'preview');
      for (const r of Q.weekPlan(a, today)) { add(r.label, 'week label'); add(r.text, 'week text'); }
      for (const flags of flagSets) {
        for (const x of Q.takeawaysFor(a, today, flags)) { add(x.title, 'takeaway title'); add(x.body, 'takeaway body'); }
      }
    }
  }
  for (const grade of GRADES) {
    for (const targets of [['not_sure'], ['stuyvesant'], ['stuyvesant', 'bronx_science'], SCHOOLS]) {
      for (const line of Q.schoolsLine(targets, grade)) add(line, 'schoolsLine');
    }
  }
  for (let m = 0; m < 1440; m += 1) {
    const s = Q.textWindowState(m);
    add(s.alertPhrase, 'alertPhrase');
    add(s.parentPhrase, 'parentPhrase');
  }
  assert.ok(seen.size > 100, 'linted ' + seen.size + ' distinct strings');
});
