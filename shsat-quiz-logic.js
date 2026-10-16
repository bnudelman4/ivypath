/* SHSAT plan quiz logic for /shsat/quiz.
   Spec: docs/specs/2026-09-27-shsat-quiz-design.md (sections 2, 3 and 5).

   Public and pure: no DOM access, no network, no alert template. The same file
   loads in the browser (window.IVP_QUIZ, from /shsat-quiz-logic.js?v=1) and in
   node (module.exports) for api/quiz-lead.js, api/_quiz-alert.js, the guarded
   lazy require in api/book-consultation.js and the unit tests. It touches no
   browser global at load, so requiring it on the server is safe.

   Copy. Every customer-facing string is rendered once, at load, from a template
   that keeps the {who} tokens (the quiz collects no student name, so they read
   "your student"; spec 2). Apostrophes render as the typographic U+2019, as on
   the live page. Nothing exported contains "{", and every exported string
   passes the copy lint in spec 2.11 (tests/helpers/copy-lint.js).

   Dates are 'YYYY-MM-DD' strings in New York time and compare as strings.
   The functions throw on invalid codes. The controller checks firstMissing()
   first, so it never calls them with a missing answer (spec 2.7).

   Copy flags G9_NOTE and T3_PROCESS_VERIFIED live in shsat-quiz.js (5.5) and
   are passed to takeawaysFor(); COPY_FLAG_DEFAULTS holds their launch values
   for callers without flags (the plan email). TEXT_WINDOWS lives here. */
(function (root) {
  'use strict';

  // -------------------------------------------------------------------------
  // Rendering helpers
  // -------------------------------------------------------------------------

  var WHO = { who: 'your student', Who: 'Your student', "who's": "your student's", "Who's": "Your student's" };

  function render(s) {
    return String(s)
      .replace(/\{(who|Who|who's|Who's)\}/g, function (m, k) { return WHO[k]; })
      .replace(/'/g, '\u2019');
  }

  function freeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) freeze(o[k]);
    }
    return o;
  }

  function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

  function has(list, v) {
    for (var i = 0; i < list.length; i++) if (list[i] === v) return true;
    return false;
  }

  function show(v) {
    try { return typeof v === 'string' ? v : JSON.stringify(v); } catch (e) { return '?'; }
  }

  function need(ok, what, v) {
    if (!ok) throw new TypeError('shsat-quiz-logic: invalid ' + what + ': ' + show(v));
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // -------------------------------------------------------------------------
  // Questions, codes and labels (spec 2.3)
  // -------------------------------------------------------------------------

  var QUIZ_VERSION = 1;

  var QUESTION_SRC = [
    { id: 'role', title: "Who's filling this out?", hint: '', multi: false, options: [
      ['parent', "I'm a parent or guardian"],
      ['student', "I'm a student"]
    ] },
    { id: 'grade', title: 'What grade is {who} in this school year?',
      hint: '8th graders and first-year 9th graders who live in NYC can take the SHSAT.', multi: false, options: [
        [5, '5th grade or younger'],
        [6, '6th grade'],
        [7, '7th grade'],
        [8, '8th grade'],
        [9, '9th grade (first year of 9th)']
      ] },
    { id: 'targets', title: 'Which specialized high schools is {who} aiming for?', hint: 'Pick all that apply.',
      multi: true, exclusive: 'not_sure', options: [
        ['stuyvesant', 'Stuyvesant'],
        ['bronx_science', 'Bronx Science'],
        ['brooklyn_tech', 'Brooklyn Tech'],
        ['brooklyn_latin', 'Brooklyn Latin'],
        ['staten_island_tech', 'Staten Island Tech'],
        ['queens_science_york', 'Queens Science at York'],
        ['american_studies_lehman', 'American Studies at Lehman'],
        ['hsmse_ccny', 'Math, Science & Engineering at City College'],
        ['not_sure', 'Not sure yet']
      ] },
    { id: 'prep', title: 'What SHSAT prep is {who} doing now?', hint: '', multi: false, options: [
      ['none', 'Nothing yet'],
      ['self', 'Practicing on their own (books or free sites)'],
      ['group', 'A group program or prep center'],
      ['tutor', 'A 1-on-1 tutor']
    ] },
    { id: 'practice_test', title: 'Has {who} taken a full-length, timed practice SHSAT?', hint: '', multi: false, options: [
      ['no', 'Not yet'],
      ['once', 'Yes, once'],
      ['multiple', 'Yes, two or more'],
      ['unsure', "I'm not sure"]
    ] },
    { id: 'worry', title: "What's your biggest worry about the SHSAT?", hint: 'Pick the one that matters most.', multi: false, options: [
      ['timing', 'Finishing all 100 questions in time'],
      ['math', 'Math'],
      ['ela', 'Reading and ELA'],
      ['adaptive', 'The new computer-adaptive format'],
      ['consistency', 'Keeping prep consistent week to week'],
      ['where_stands', 'Not knowing where my student stands'],
      ['process', 'Understanding registration and how offers work']
    ] }
  ];

  var BANDS = ['final_weeks_baseline', 'final_weeks_focus', 'final_weeks_sharpen', 'full_year', 'foundation', 'early_start', 'after_test'];

  var QUESTIONS = [];
  var CODES = {};
  var LABELS = {};
  for (var qi = 0; qi < QUESTION_SRC.length; qi++) {
    var src = QUESTION_SRC[qi];
    var q = { id: src.id, n: qi + 1, title: render(src.title), hint: render(src.hint), multi: src.multi, options: [] };
    if (src.exclusive) q.exclusive = src.exclusive;
    CODES[src.id] = [];
    LABELS[src.id] = {};
    for (var oi = 0; oi < src.options.length; oi++) {
      var code = src.options[oi][0];
      var label = render(src.options[oi][1]);
      q.options.push({ code: code, label: label });
      CODES[src.id].push(code);
      LABELS[src.id][code] = label;
    }
    QUESTIONS.push(q);
  }
  CODES.band = BANDS;

  var SCHOOL_CODES = [];
  var SCHOOL_SHORT = {};
  for (var si = 0; si < CODES.targets.length; si++) {
    if (CODES.targets[si] === 'not_sure') continue;
    SCHOOL_CODES.push(CODES.targets[si]);
    SCHOOL_SHORT[CODES.targets[si]] = LABELS.targets[CODES.targets[si]];
  }

  // Worry short labels: the T3 title and the alert (2.3).
  var WORRY_SHORT = {
    timing: 'finishing in time',
    math: 'math',
    ela: 'reading and ELA',
    adaptive: 'the new format',
    consistency: 'staying consistent',
    where_stands: 'knowing where things stand',
    process: 'registration and offers'
  };

  // Middle-weeks focus in the week plan (3.4).
  var FOCUS = {
    timing: 'timed sets and pacing',
    math: 'the math topics that take longest',
    ela: 'longer reading passages and ELA questions',
    adaptive: 'timed practice on a computer at the new length',
    consistency: 'a fixed weekly schedule',
    where_stands: 'the question types the practice test shows need the most time',
    process: 'the question types that take longest'
  };

  // -------------------------------------------------------------------------
  // Dates, consent, texting windows (3.1, 3.7)
  // -------------------------------------------------------------------------

  var DATES = {
    REG_OPENS: '2026-10-06',
    REG_CLOSES: '2026-10-30',
    SCHOOL_DAY: '2026-11-18',
    AFTER_FROM: '2026-11-19',
    LAST_PREP_WEEK: '2026-11-09',
    TEST_WEEK: '2026-11-16'
  };

  // Minutes after midnight ET: 08:00-09:00, 12:00-13:30, 17:30-20:30 (start inclusive, end exclusive).
  // If Vicente exempts parents who just asked to be contacted, this becomes [[480, 1230]] (spec 3.7, 10).
  var TEXT_WINDOWS = [[480, 540], [720, 810], [1050, 1230]];

  var CONSENT_VERSION = 'quiz-2026-09-28';
  var CONSENT_TEXT = {};
  CONSENT_TEXT[CONSENT_VERSION] = render("IvyPath Academy (Perevalis Tutoring LLC) may text and email me about my student's SHSAT plan. Texts come from a person at IvyPath, not an automated system, and there will only be a few. Reply STOP to opt out. Message and data rates may apply. Agreeing isn't required to book a consultation or enroll.");

  // The platform send-link GRADE_RANGE.SHSAT (Phase 1). shsat-quiz.js may pass its own DIAG_GRADES flag.
  var DIAG_GRADES = [6, 7, 8];

  var COPY_FLAG_DEFAULTS = { G9_NOTE: null, T3_PROCESS_VERIFIED: false };

  var DOE_SHS_URL = 'https://www.schools.nyc.gov/enrollment/enroll-grade-by-grade/specialized-high-schools';

  // Same keys as the platform's ATTRIBUTION_KEYS (src/lib/lead-attribution.ts).
  var ATTRIBUTION_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'fbclid', 'gclid', 'ref', 'referrer', 'ivp_lp', 'page', 'v', 'mc', 'mc_sub',
    'first_landing', 'first_referrer', 'heard_from'];

  var DELIVERIES = ['alert_and_copy', 'alert_only', 'copy_only'];

  // Validation errors (5.3.1). The school message is school-email-guard.js's block message, word for word.
  var ERRORS = {
    name: 'Please enter your name.',
    phone: 'Please enter a 10-digit US mobile number.',
    email: 'Please enter a valid email address.',
    school: render("Please use a personal or parent email. We can't deliver to @nycstudents.net school accounts."),
    consent: 'Please check the box so we can follow up.',
    generic: 'Please check your entries and try again.'
  };

  // -------------------------------------------------------------------------
  // Band copy (2.6.3)
  // -------------------------------------------------------------------------

  var BAND_NAMES = {
    final_weeks_baseline: 'Before November 18: begin with one timed practice test',
    final_weeks_focus: 'Before November 18: work on what the practice test showed',
    final_weeks_sharpen: 'Before November 18: timed practice and review',
    full_year: 'Fall 2027: a steady year of practice',
    foundation: 'Fall 2028: strong reading and math basics',
    early_start: 'Early years: everyday reading and math',
    after_test: 'After the fall 2026 test'
  };

  var PREFIX_OPEN = '{Who} is in the right grade to take the SHSAT this fall.';
  var PREFIX_CLOSED = 'If {who} registered by October 30, the test is this fall.';

  var SUMMARY_SRC = {
    final_weeks_baseline: "If {who} hasn't taken a timed, full-length practice test yet, that's the first step, so the weeks that are left go where they're needed most.",
    final_weeks_focus: "There's already a practice test to learn from, so the plan is to spend the remaining weeks on the question types that were missed or took longest, with timed practice at the new 100-question length.",
    final_weeks_sharpen: '{Who} already has structured prep, so the plan now is timed practice at the new 100-question length, on a computer, with extra time on the question types that still take longest.',
    full_year: '{Who} would take the SHSAT in fall 2027. A year out is a good time to start: enough time to build skills at a steady pace, without a rush at the end.',
    foundation: '{Who} would take the SHSAT in fall 2028. For now, the plan is strong reading and math basics, with a little practice to get familiar with the test.',
    early_start: "{Who} is still a few years away from the SHSAT. The most useful work now is everyday reading and math. There's no need for test prep yet.",
    after_test: 'The fall 2026 SHSAT dates have passed. If {who} took the test, a free 15-minute consultation can help you think through what comes next.'
  };

  // -------------------------------------------------------------------------
  // Week plan copy (3.4)
  // -------------------------------------------------------------------------

  var THIS_WEEK_SRC = {
    final_weeks_baseline: 'One timed, full-length practice test (100 questions in 180 minutes), then list the question types that were missed or took longest.',
    final_weeks_focus: 'Go back through the practice test {who} took and list the question types that were missed or took longest.',
    final_weeks_sharpen: 'One timed, full-length practice test at the new length, then review every missed question.'
  };
  var TEST_WEEK_TEXT = 'Light review, and plenty of sleep before Wednesday.';
  var LAST_RUN_TEXT = 'One last timed run early in the week, then light review.';
  var REGISTER_TEXT = render("Register for the SHSAT. {Who's} school counselor can tell you how it works at their school.");
  var TEST_DATES_TEXT = 'Wednesday, November 18 is the school-day test. Charter, private and homeschool students test on November 14, 15 or 21.';

  // -------------------------------------------------------------------------
  // Takeaways (2.6.6)
  // -------------------------------------------------------------------------

  var TAKEAWAY_SRC = {
    T1_REG_SOON: "Registration opens Tuesday, October 6 and closes Friday, October 30. The school-day test is Wednesday, November 18. The weekend dates, November 14, 15 and 21, are for charter, private and homeschool students. This week, ask {who's} school counselor how registration works at their school.",
    T1_REG_OPEN: "Registration is open now and closes Friday, October 30. The school-day test is Wednesday, November 18. The weekend dates, November 14, 15 and 21, are for charter, private and homeschool students. This week, ask {who's} school counselor how registration works at their school.",
    T1_REG_CLOSED: "Registration closed on Friday, October 30. The school-day test is Wednesday, November 18, and the weekend dates, November 14, 15 and 21, are for charter, private and homeschool students. If {who} isn't registered, ask the school counselor right away about options.",
    T1_G9_NOTE: 'For 9th graders, the test is for 10th-grade seats, and there are far fewer of those than 9th-grade seats.',
    T1_G7: "Students usually take the SHSAT in the fall of 8th grade. For {who}, that's fall 2027, a full year away, which leaves room to prepare at a steady pace.",
    T1_G6: "Students usually take the SHSAT in the fall of 8th grade, so for {who} that's fall 2028. The test became computer-adaptive in fall 2026, so any practice should match the new length: 100 questions in 180 minutes, on a computer.",
    T1_G5: "Students usually take the SHSAT in the fall of 8th grade. For {who}, that's at least three years away.",
    T2_BASELINE: 'Start with one timed, full-length practice test: 100 questions in 180 minutes, on a computer if you can. Afterward, list the question types that were missed or took longest. That list shows where practice time should go first.',
    T2_USE_TEST: 'Go back through the practice test {who} already took. Mark each question that was missed or took too long, and group them by type. Build each week around the two or three biggest groups.',
    T2_CHECK_FORMAT: "Keep what's working, and check that practice matches the new test: 100 questions in 180 minutes, on a computer. Ask {who's} current program whether its practice tests use the new length.",
    T2_HABITS: 'Build everyday habits: reading longer books and articles, and steady practice with fractions, ratios and word problems. These give {who} a strong base for later.',
    T3_TIMING: "Practice pacing with timed sets rather than extra untimed work. On the new test there's no penalty for a wrong answer, and math questions and stand-alone ELA questions can't be revisited once answered, so practice making a best guess and moving on.",
    T3_MATH: 'Pick the math topics that come up most and the ones that take {who} longest, and practice a few of each every week. Short, regular practice on those topics usually helps more than long weekend sessions.',
    T3_ELA: 'Reading and ELA build more slowly than math, so regular practice with longer passages matters. Have {who} check each answer against the text before moving on.',
    T3_ADAPTIVE: 'Fall 2026 is the first year the SHSAT is computer-adaptive: each answer changes which question comes next. Practicing on a computer, at the new 100-question length, helps test day feel familiar.',
    T3_CONSISTENCY: 'Pick two or three fixed practice times each week and keep them, even in busy weeks. With IvyPath, you also get automated progress reports after sessions, so you can see what {who} worked on.',
    T3_WHERE: 'A timed, full-length practice test is the clearest way to find out. Afterward, look at which question types were missed or took longest, not only the total.',
    // Ships only when every sentence is verified on the DOE page (T3_PROCESS_VERIFIED, spec 10).
    T3_PROCESS: "On the application, you list the specialized high schools {who} would attend, in order of preference. The order matters: offers go by score, then by the order you listed the schools. The DOE's specialized high schools page explains each step.",
    T3_PROCESS_BASIC: "Start with the DOE's specialized high schools page: it explains registration, the test and how offers are made. On a free 15-minute consultation, we can go over any step you're unsure about.",
    T3_EARLY: "It's early, and that helps. For now, reading for fun and everyday math matter more than test prep. When {who} reaches 6th or 7th grade, a free 15-minute consultation can help you decide when to start."
  };

  var TAKEAWAY_TEXT = {};
  for (var tk in TAKEAWAY_SRC) if (hasOwn(TAKEAWAY_SRC, tk)) TAKEAWAY_TEXT[tk] = render(TAKEAWAY_SRC[tk]);

  var T3_BY_WORRY = {
    timing: 'T3_TIMING', math: 'T3_MATH', ela: 'T3_ELA', adaptive: 'T3_ADAPTIVE',
    consistency: 'T3_CONSISTENCY', where_stands: 'T3_WHERE'
  };

  var T1_TITLE_TEST_YEAR = 'The dates that matter';
  var T1_TITLE_EARLY = render('When {who} takes the SHSAT');
  var T2_TITLE = 'Where to start';
  var T3_TITLE = 'Your biggest worry';

  var UNDECIDED_LINE = 'Schools: still deciding. We can go over the options on the consultation.';
  // The only permitted use of "cutoffs" (lint exception, spec 2.11).
  var CUTOFF_LINE = 'Fall 2026 is the first computer-adaptive SHSAT, so past cutoffs are only a rough guide.';
  var PLAN_EYEBROW = 'SHSAT plan for parents';

  // -------------------------------------------------------------------------
  // Dates
  // -------------------------------------------------------------------------

  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  var DAY_MS = 86400000;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function toUTC(d) { return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)); }

  function fromUTC(ms) {
    var x = new Date(ms);
    return x.getUTCFullYear() + '-' + pad(x.getUTCMonth() + 1) + '-' + pad(x.getUTCDate());
  }

  function checkDate(d) {
    need(typeof d === 'string' && DATE_RE.test(d) && fromUTC(toUTC(d)) === d, 'date', d);
    return d;
  }

  function addDays(d, n) { return fromUTC(toUTC(d) + n * DAY_MS); }

  // The Monday on or before d.
  function mon(d) { return addDays(d, -((new Date(toUTC(d)).getUTCDay() + 6) % 7)); }

  // "Oct 5"
  function fmt(d) { return MONTHS[+d.slice(5, 7) - 1] + ' ' + (+d.slice(8, 10)); }

  var MIDDLE_END = addDays(DATES.LAST_PREP_WEEK, -7); // '2026-11-02'

  // -------------------------------------------------------------------------
  // New York clock and the Playwright hooks (3.1)
  // -------------------------------------------------------------------------

  var nyFmt = null;

  function nyParts(date) {
    if (!nyFmt) {
      nyFmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
      });
    }
    var out = {};
    var pm = null;
    var parts = nyFmt.formatToParts(date);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === 'dayPeriod') pm = /p/i.test(parts[i].value);
      else if (parts[i].type !== 'literal') out[parts[i].type] = parseInt(parts[i].value, 10);
    }
    if (out.hour === 24) out.hour = 0; // older engines print midnight as 24
    if (pm !== null) out.hour = out.hour % 12 + (pm ? 12 : 0); // engines that ignore hourCycle
    return out;
  }

  // Read at call time only. Playwright sets these through addInitScript; there is no URL parameter.
  function hook(name) {
    try {
      var g = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null);
      return g ? g[name] : undefined;
    } catch (e) {
      return undefined;
    }
  }

  function asDate(now) { return now instanceof Date ? now : new Date(now); }

  function todayNY(now) {
    if (now === undefined) {
      var h = hook('__IVP_QUIZ_TODAY');
      if (typeof h === 'string' && DATE_RE.test(h)) return h;
      now = new Date();
    }
    var p = nyParts(asDate(now));
    return p.year + '-' + pad(p.month) + '-' + pad(p.day);
  }

  function isMinute(m) { return typeof m === 'number' && m % 1 === 0 && m >= 0 && m <= 1439; }

  function nowMinutesNY(now) {
    if (now === undefined) {
      var h = hook('__IVP_QUIZ_NOW_MIN');
      if (isMinute(h)) return h;
      now = new Date();
    }
    var p = nyParts(asDate(now));
    return p.hour * 60 + p.minute;
  }

  // -------------------------------------------------------------------------
  // Answer checks
  // -------------------------------------------------------------------------

  function gradeOf(g) {
    if (typeof g === 'string' && /^[5-9]$/.test(g)) g = +g;
    return has(CODES.grade, g) ? g : null;
  }

  function validTargets(t) {
    if (!Array.isArray(t) || t.length < 1 || t.length > 9) return false;
    for (var i = 0; i < t.length; i++) {
      if (!has(CODES.targets, t[i])) return false;
      for (var j = 0; j < i; j++) if (t[j] === t[i]) return false;
    }
    return !(has(t, 'not_sure') && t.length !== 1);
  }

  function isFinal(band) { return typeof band === 'string' && band.indexOf('final_weeks_') === 0; }

  // The first unanswered (or invalid) question id, or null when nothing more is needed.
  function firstMissing(a) {
    a = a && typeof a === 'object' ? a : {};
    if (!has(CODES.role, a.role)) return 'role';
    if (a.role === 'student') return null;
    if (gradeOf(a.grade) === null) return 'grade';
    if (!validTargets(a.targets)) return 'targets';
    if (!has(CODES.prep, a.prep)) return 'prep';
    if (!has(CODES.practice_test, a.practice_test)) return 'practice_test';
    if (!has(CODES.worry, a.worry)) return 'worry';
    return null;
  }

  // -------------------------------------------------------------------------
  // Results logic (3.2 to 3.6)
  // -------------------------------------------------------------------------

  // 3.2. First matching row wins. targets and worry never change the band.
  function bandFor(a, today) {
    need(a && typeof a === 'object', 'answers', a);
    need(has(CODES.role, a.role), 'role', a.role);
    checkDate(today);
    if (a.role === 'student') return null;
    var g = gradeOf(a.grade);
    need(g !== null, 'grade', a.grade);
    need(has(CODES.prep, a.prep), 'prep', a.prep);
    need(has(CODES.practice_test, a.practice_test), 'practice_test', a.practice_test);
    if (g >= 8) {
      if (today >= DATES.AFTER_FROM) return 'after_test';
      if (a.practice_test === 'no' || a.practice_test === 'unsure') return 'final_weeks_baseline';
      return (a.prep === 'none' || a.prep === 'self') ? 'final_weeks_focus' : 'final_weeks_sharpen';
    }
    if (g === 7) return 'full_year';
    if (g === 6) return 'foundation';
    return 'early_start';
  }

  function bandCopy(band, today) {
    need(has(BANDS, band), 'band', band);
    checkDate(today);
    var s = SUMMARY_SRC[band];
    if (isFinal(band)) s = (today <= DATES.REG_CLOSES ? PREFIX_OPEN : PREFIX_CLOSED) + ' ' + s;
    return { name: BAND_NAMES[band], summary: render(s) };
  }

  // 3.3
  function countdownLine(today) {
    checkDate(today);
    var days = Math.round((toUTC(DATES.SCHOOL_DAY) - toUTC(today)) / DAY_MS);
    if (days >= 14) return 'About ' + Math.floor(days / 7) + ' weeks to the school-day test';
    if (days >= 1) return 'Less than two weeks to the school-day test';
    if (days === 0) return 'The school-day test is today';
    return '';
  }

  // 2.2 date line
  function introDateLine(today) {
    checkDate(today);
    if (today < DATES.REG_OPENS) return 'SHSAT registration opens Tuesday, October 6 and closes Friday, October 30. The school-day test is Wednesday, November 18.';
    if (today <= DATES.REG_CLOSES) return 'SHSAT registration is open until Friday, October 30. The school-day test is Wednesday, November 18.';
    if (today <= DATES.SCHOOL_DAY) return 'The school-day SHSAT is Wednesday, November 18, the first year of the computer-adaptive format.';
    return '';
  }

  function registrationLine(today) {
    checkDate(today);
    if (today < DATES.REG_OPENS) return 'Registration opens Tuesday, October 6 and closes Friday, October 30.';
    if (today <= DATES.REG_CLOSES) return 'Registration closes Friday, October 30.';
    return '';
  }

  // The results eyebrow (2.6.1) and gate preview line 1 (2.5).
  function eyebrowLine(band, today) {
    need(has(BANDS, band), 'band', band);
    return isFinal(band) ? countdownLine(today) : PLAN_EYEBROW;
  }

  function firstSentence(s) {
    var i = s.indexOf('. ');
    return i === -1 ? s : s.slice(0, i + 1);
  }

  // Gate plan preview (2.5): [eyebrow, band name, registration sentence or first summary sentence].
  function planPreview(a, today) {
    var band = bandFor(a, today);
    if (band === null) return null;
    var c = bandCopy(band, today);
    var third = isFinal(band) && today <= DATES.REG_CLOSES ? registrationLine(today) : firstSentence(c.summary);
    return [eyebrowLine(band, today), c.name, third];
  }

  // 3.4
  function weekPlan(a, today) {
    var band = bandFor(a, today);
    if (band === null) return [];
    need(has(CODES.worry, a.worry), 'worry', a.worry);
    if (!isFinal(band)) return [];
    var M = mon(today);
    var rows = [];
    var first;
    if (today >= DATES.TEST_WEEK) first = TEST_WEEK_TEXT;
    else if (M === DATES.LAST_PREP_WEEK) first = LAST_RUN_TEXT;
    else first = render(THIS_WEEK_SRC[band]);
    rows.push({ label: 'This week', text: first });
    if (today <= DATES.REG_CLOSES) {
      rows.push({ label: today < DATES.REG_OPENS ? 'Oct 6 to Oct 30' : 'By Fri, Oct 30', text: REGISTER_TEXT });
    }
    var next = addDays(M, 7);
    if (next <= MIDDLE_END) {
      rows.push({
        label: next === MIDDLE_END ? 'Week of Nov 2' : 'Weeks of ' + fmt(next) + ' to Nov 2',
        text: 'Most practice time on ' + FOCUS[a.worry] + ', plus one timed section each week.'
      });
    }
    if (M < DATES.LAST_PREP_WEEK) rows.push({ label: 'Week of Nov 9', text: LAST_RUN_TEXT });
    rows.push({ label: 'Test dates', text: TEST_DATES_TEXT });
    return rows;
  }

  // 3.5. flags: { G9_NOTE, T3_PROCESS_VERIFIED } from shsat-quiz.js; COPY_FLAG_DEFAULTS when omitted.
  function takeawaysFor(a, today, flags) {
    var band = bandFor(a, today);
    if (band === null) return [];
    need(has(CODES.worry, a.worry), 'worry', a.worry);
    if (band === 'after_test') return [];
    var f = flags || COPY_FLAG_DEFAULTS;
    var g = gradeOf(a.grade);

    var t1id, t1title;
    if (g >= 8) {
      t1id = today < DATES.REG_OPENS ? 'T1_REG_SOON' : (today <= DATES.REG_CLOSES ? 'T1_REG_OPEN' : 'T1_REG_CLOSED');
      t1title = T1_TITLE_TEST_YEAR;
    } else {
      t1id = 'T1_G' + g;
      t1title = T1_TITLE_EARLY;
    }
    var t1body = TAKEAWAY_TEXT[t1id];
    if (g === 9 && f.G9_NOTE) t1body += ' ' + TAKEAWAY_TEXT.T1_G9_NOTE;

    var t2id;
    if (g === 5) t2id = 'T2_HABITS';
    else if (a.practice_test === 'no' || a.practice_test === 'unsure') t2id = 'T2_BASELINE';
    else if (a.prep === 'none' || a.prep === 'self') t2id = 'T2_USE_TEST';
    else t2id = 'T2_CHECK_FORMAT';

    var t3id, t3title;
    if (g === 5) {
      t3id = 'T3_EARLY';
      t3title = T3_TITLE;
    } else {
      t3id = a.worry === 'process' ? (f.T3_PROCESS_VERIFIED === true ? 'T3_PROCESS' : 'T3_PROCESS_BASIC') : T3_BY_WORRY[a.worry];
      t3title = T3_TITLE + ': ' + WORRY_SHORT[a.worry];
    }

    return [
      { id: t1id, title: t1title, body: t1body },
      { id: t2id, title: T2_TITLE, body: TAKEAWAY_TEXT[t2id] },
      { id: t3id, title: t3title, body: TAKEAWAY_TEXT[t3id] }
    ];
  }

  // Short school names in Q3 order ([] for not_sure).
  function schoolNames(targets) {
    var out = [];
    if (!Array.isArray(targets)) return out;
    for (var i = 0; i < SCHOOL_CODES.length; i++) if (has(targets, SCHOOL_CODES[i])) out.push(SCHOOL_SHORT[SCHOOL_CODES[i]]);
    return out;
  }

  function joinAnd(list) {
    if (list.length < 2) return list.join('');
    return list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1];
  }

  // 2.6.2: 1 or 2 sentences.
  function schoolsLine(targets, grade) {
    need(validTargets(targets), 'targets', targets);
    var g = gradeOf(grade);
    need(g !== null, 'grade', grade);
    var lines = [targets[0] === 'not_sure' ? UNDECIDED_LINE : 'Aiming for: ' + joinAnd(schoolNames(targets)) + '.'];
    if (g >= 6) lines.push(CUTOFF_LINE);
    return lines;
  }

  // 3.6. opts: { diagGrades, leadRef, diagAllowed }. With a lead_ref, the platform's answer wins.
  function diagAvailable(grade, opts) {
    var o = opts || {};
    var g = gradeOf(grade);
    if (g === null) return false;
    if (o.leadRef && typeof o.diagAllowed === 'boolean') return o.diagAllowed;
    return has(o.diagGrades || DIAG_GRADES, g);
  }

  // 3.6 table: 'none' (grade 5), 'grade9' (grade 9 while not available), 'form', or 'link'
  // (not captured, no handoff email, or a grade the diagnostic does not take).
  // opts adds { captured, hasEmail } to the diagAvailable options.
  function diagnosticBlock(grade, opts) {
    var o = opts || {};
    var g = gradeOf(grade);
    if (g === null || g === 5) return 'none';
    if (!diagAvailable(g, o)) return g === 9 ? 'grade9' : 'link';
    return o.captured && o.hasEmail ? 'form' : 'link';
  }

  // -------------------------------------------------------------------------
  // Texting windows (3.7)
  // -------------------------------------------------------------------------

  // 480 -> '8:00 AM'
  function formatClock(min) {
    var h = Math.floor(min / 60);
    var m = min % 60;
    return (h % 12 || 12) + ':' + pad(m) + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  // Inside a window, nextStartMin is now. windows defaults to TEXT_WINDOWS.
  function textWindowState(minutesNY, windows) {
    need(isMinute(minutesNY), 'minutes', minutesNY);
    var m = minutesNY;
    var W = windows || TEXT_WINDOWS;
    for (var i = 0; i < W.length; i++) {
      if (m >= W[i][0] && m < W[i][1]) {
        return { inWindow: true, nextStartMin: m, nextDay: false, alertPhrase: 'text now', parentPhrase: 'today' };
      }
      if (m < W[i][0]) {
        return {
          inWindow: false, nextStartMin: W[i][0], nextDay: false,
          alertPhrase: 'text at ' + formatClock(W[i][0]),
          parentPhrase: i === 0 ? 'this morning' : 'later today'
        };
      }
    }
    return {
      inWindow: false, nextStartMin: W[0][0], nextDay: true,
      alertPhrase: 'text tomorrow ' + formatClock(W[0][0]),
      parentPhrase: 'tomorrow morning'
    };
  }

  // -------------------------------------------------------------------------
  // Contact normalization (5.1)
  // -------------------------------------------------------------------------

  var nameStrip = null;
  function nameStripRe() {
    if (nameStrip) return nameStrip;
    try {
      nameStrip = new RegExp("[^\\p{L} .'-]", 'gu');
    } catch (e) {
      // Engines without Unicode property escapes: drop control characters, digits and ASCII symbols.
      nameStrip = /[\u0000-\u001f\u007f-\u009f\u0021-\u0026\u0028-\u002c\u002f-\u0040\u005b-\u0060\u007b-\u007e]/g;
    }
    return nameStrip;
  }

  // Letters (\p{L}), spaces, - ' and . only; collapses spaces; trims; at most max characters (default 120).
  function sanitizeName(raw, max) {
    if (raw === null || raw === undefined) return '';
    var s = String(raw);
    if (typeof s.normalize === 'function') {
      try { s = s.normalize('NFC'); } catch (e) {}
    }
    s = s.replace(/<[^>]*>/g, ' ')
      .replace(/[\u2018\u2019\u02BC]/g, "'") // phone keyboards type O\u2019Neil (smart punctuation)
      .replace(/\s+/g, ' ')
      .replace(nameStripRe(), '')
      .replace(/ {2,}/g, ' ')
      .replace(/^ +| +$/g, '');
    var n = typeof max === 'number' && max > 0 ? Math.floor(max) : 120;
    var chars = typeof Array.from === 'function' ? Array.from(s) : s.split('');
    if (chars.length > n) s = chars.slice(0, n).join('').replace(/ +$/, '');
    return s;
  }

  // E.164 or null. The platform's usMobile rule: trim, at most 40 characters, strip non-digits,
  // drop a leading 1 from 11 digits, NANP area code and exchange, not one repeated digit.
  function normalizeUsMobile(raw) {
    if (typeof raw !== 'string') return null;
    var s = raw.replace(/^\s+|\s+$/g, '');
    if (s.length > 40) return null;
    var d = s.replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(d)) return null;
    if (/^(\d)\1{9}$/.test(d)) return null;
    return '+1' + d;
  }

  // '+19175550142' -> '(917) 555-0142'; '' when it is not a US mobile.
  function formatUsPhone(e164) {
    var n = normalizeUsMobile(typeof e164 === 'string' ? e164 : '');
    return n ? '(' + n.slice(2, 5) + ') ' + n.slice(5, 8) + '-' + n.slice(8) : '';
  }

  // zod v4's email regex (the platform validates parent_email with z.string().trim().email().max(200)).
  var EMAIL_RE = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-\.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

  function normalizeEmail(v) {
    return v === null || v === undefined ? '' : String(v).replace(/^\s+|\s+$/g, '').toLowerCase();
  }

  function isValidEmail(v) {
    if (typeof v !== 'string') return false;
    var e = normalizeEmail(v);
    return e.length > 0 && e.length <= 200 && EMAIL_RE.test(e);
  }

  // Port of school-email-guard.js isSchoolAddress: @nycstudents.net, its subdomains, one edit
  // anywhere, or two edits after "nyc". Those mail systems reject outside senders.
  var SCHOOL_DOMAIN = 'nycstudents.net';

  function distance(a, b) {
    var prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[b.length];
  }

  function isSchoolEmail(value) {
    var m = /@([^@\s]+)$/.exec(String(value || '').trim().toLowerCase());
    if (!m) return false;
    var d = m[1].replace(/\.+$/, '');
    if (d === SCHOOL_DOMAIN || d.slice(-(SCHOOL_DOMAIN.length + 1)) === '.' + SCHOOL_DOMAIN) return true;
    var k = distance(d, SCHOOL_DOMAIN);
    return k <= 1 || (k === 2 && d.slice(0, 3) === 'nyc');
  }

  // -------------------------------------------------------------------------
  // quiz_id (5.1)
  // -------------------------------------------------------------------------

  // zod v4 .uuid(): RFC 9562 version 1 to 8 and the 10xx variant.
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function isUuid(v) { return typeof v === 'string' && UUID_RE.test(v); }

  // The crypto.getRandomValues fallback: 16 bytes, version 4 and variant bits set, 8-4-4-4-12.
  function uuidFromBytes(bytes) {
    var h = '';
    for (var i = 0; i < 16; i++) {
      var b = (bytes[i] | 0) & 255;
      if (i === 6) b = (b & 0x0f) | 0x40;
      if (i === 8) b = (b & 0x3f) | 0x80;
      h += (b < 16 ? '0' : '') + b.toString(16);
    }
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  // crypto.randomUUID when it works, else getRandomValues, else Math.random. c defaults to the global crypto.
  function newQuizId(c) {
    if (c === undefined) c = typeof crypto !== 'undefined' ? crypto : null;
    if (c && typeof c.randomUUID === 'function') {
      try {
        var u = c.randomUUID();
        if (isUuid(u)) return u;
      } catch (e) {}
    }
    var b = typeof Uint8Array !== 'undefined' ? new Uint8Array(16) : [];
    var filled = false;
    if (c && typeof c.getRandomValues === 'function') {
      try { c.getRandomValues(b); filled = true; } catch (e) {}
    }
    if (!filled) for (var i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    return uuidFromBytes(b);
  }

  // -------------------------------------------------------------------------
  // Payload (5.2, 5.3.1)
  // -------------------------------------------------------------------------

  // The platform keys only; string values; control characters stripped; 300 characters; empty values dropped.
  function sanitizeAttribution(raw) {
    var out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (var i = 0; i < ATTRIBUTION_KEYS.length; i++) {
      var k = ATTRIBUTION_KEYS[i];
      if (!hasOwn(raw, k) || typeof raw[k] !== 'string') continue;
      var v = raw[k].replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\s+|\s+$/g, '').slice(0, 300);
      if (v) out[k] = v;
    }
    return out;
  }

  var QUIZ_KEYS = ['version', 'role', 'targets', 'prep', 'practice_test', 'worry', 'band'];

  // The strict quiz object (platform shsatQuizAnswersSchema), copied, or null.
  function checkQuiz(q) {
    if (!q || typeof q !== 'object' || Array.isArray(q)) return null;
    for (var k in q) if (hasOwn(q, k) && !has(QUIZ_KEYS, k)) return null;
    if (q.version !== QUIZ_VERSION || q.role !== 'parent') return null;
    if (!validTargets(q.targets)) return null;
    if (!has(CODES.prep, q.prep) || !has(CODES.practice_test, q.practice_test)) return null;
    if (!has(CODES.worry, q.worry) || !has(BANDS, q.band)) return null;
    return {
      version: QUIZ_VERSION, role: 'parent', targets: q.targets.slice(), prep: q.prep,
      practice_test: q.practice_test, worry: q.worry, band: q.band
    };
  }

  function fail(field, error) {
    var r = { ok: false, error: error };
    if (field) r.field = field;
    return r;
  }

  // Parent-fixable fields are checked first, in form order, and carry `field`. Everything a
  // parent cannot fix returns the generic error with no field. As the Phase 2 fallback, the
  // site stays lenient where a lead could otherwise be lost: attribution, the honeypot value
  // and fallback_reason are cleaned or dropped, never a reason to refuse.
  function validateQuizPayload(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(null, ERRORS.generic);

    var name = typeof body.parent_name === 'string' ? sanitizeName(body.parent_name, 120) : '';
    if (name.length < 2) return fail('parent_name', ERRORS.name);

    var phone = normalizeUsMobile(body.phone);
    if (!phone) return fail('phone', ERRORS.phone);

    if (!isValidEmail(body.parent_email)) return fail('parent_email', ERRORS.email);
    var email = normalizeEmail(body.parent_email);
    if (isSchoolEmail(email)) return fail('parent_email', ERRORS.school);

    if (body.consent !== true || typeof body.consent_version !== 'string' || !hasOwn(CONSENT_TEXT, body.consent_version)) {
      return fail('consent', ERRORS.consent);
    }

    if (body.test_type !== 'SHSAT' || !isUuid(body.quiz_id)) return fail(null, ERRORS.generic);

    var g = body.student_grade;
    var grade = typeof g === 'number' || (typeof g === 'string' && g.replace(/\s/g, '') !== '') ? Number(g) : NaN;
    if (!(grade % 1 === 0 && grade >= 5 && grade <= 9)) return fail(null, ERRORS.generic);

    var quiz = checkQuiz(body.quiz);
    if (!quiz) return fail(null, ERRORS.generic);

    var delivery = body.delivery === undefined || body.delivery === null ? 'alert_and_copy' : body.delivery;
    if (!has(DELIVERIES, delivery)) return fail(null, ERRORS.generic);

    var hp = body.company_name === undefined || body.company_name === null ? '' : String(body.company_name).slice(0, 200);

    var value = {
      quiz_id: body.quiz_id.toLowerCase(),
      test_type: 'SHSAT',
      parent_name: name,
      parent_email: email,
      phone: phone,
      student_grade: grade,
      consent: true,
      consent_version: body.consent_version,
      quiz: quiz,
      attribution: sanitizeAttribution(body.attribution),
      company_name: hp,
      delivery: delivery
    };
    if (typeof body.fallback_reason === 'string' && /^platform_[a-z0-9_]{1,32}$/.test(body.fallback_reason)) {
      value.fallback_reason = body.fallback_reason;
    }
    return { ok: true, value: value };
  }

  // -------------------------------------------------------------------------
  // Exports
  // -------------------------------------------------------------------------

  var api = {
    QUIZ_VERSION: QUIZ_VERSION,
    QUESTIONS: freeze(QUESTIONS),
    CODES: freeze(CODES),
    LABELS: freeze(LABELS),
    SCHOOL_SHORT: freeze(SCHOOL_SHORT),
    WORRY_SHORT: freeze(WORRY_SHORT),
    FOCUS: freeze(FOCUS),
    BANDS: freeze(BANDS),
    BAND_NAMES: freeze(BAND_NAMES),
    DATES: freeze(DATES),
    TEXT_WINDOWS: freeze(TEXT_WINDOWS),
    CONSENT_VERSION: CONSENT_VERSION,
    CONSENT_TEXT: freeze(CONSENT_TEXT),
    TAKEAWAY_TEXT: freeze(TAKEAWAY_TEXT),
    DIAG_GRADES: freeze(DIAG_GRADES),
    COPY_FLAG_DEFAULTS: freeze(COPY_FLAG_DEFAULTS),
    DOE_SHS_URL: DOE_SHS_URL,
    ATTRIBUTION_KEYS: freeze(ATTRIBUTION_KEYS),
    ERRORS: freeze(ERRORS),

    todayNY: todayNY,
    nowMinutesNY: nowMinutesNY,
    firstMissing: firstMissing,
    bandFor: bandFor,
    bandCopy: bandCopy,
    countdownLine: countdownLine,
    introDateLine: introDateLine,
    registrationLine: registrationLine,
    eyebrowLine: eyebrowLine,
    planPreview: planPreview,
    weekPlan: weekPlan,
    takeawaysFor: takeawaysFor,
    schoolNames: schoolNames,
    schoolsLine: schoolsLine,
    diagAvailable: diagAvailable,
    diagnosticBlock: diagnosticBlock,
    formatClock: formatClock,
    textWindowState: textWindowState,
    sanitizeName: sanitizeName,
    normalizeUsMobile: normalizeUsMobile,
    formatUsPhone: formatUsPhone,
    normalizeEmail: normalizeEmail,
    isValidEmail: isValidEmail,
    isSchoolEmail: isSchoolEmail,
    isUuid: isUuid,
    uuidFromBytes: uuidFromBytes,
    newQuizId: newQuizId,
    sanitizeAttribution: sanitizeAttribution,
    validateQuizPayload: validateQuizPayload
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IVP_QUIZ = api;
})(typeof window !== 'undefined' ? window : this);
