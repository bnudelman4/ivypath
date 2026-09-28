# /shsat/quiz: 2-minute SHSAT plan for parents. Design spec (draft 2)

- **Date:** 2026-09-28 (Mon)
- **Status:** draft 2. Resolves every blocker from the four critiques (brand compliance, parent conversion, engineering, accessibility and mobile). Section 0.2 maps each blocker to its fix. Items that need an owner's answer are in section 10.
- **Site repo:** `/Users/vicentexia/Downloads/IvyPath Academy/ivypath-site` (bnudelman4/ivypath, `main` at 56337b9)
- **Platform repo:** `/Users/vicentexia/Downloads/IvyPath Academy/Claude Code/ivypath-platform` (read on `base-0927`)
- **Owners:**
  - Site parts: the ads and site session.
  - Platform parts (section 5.6): the platform session, after 07:00 ET Mon.
  - Texting guards in Muse's tools and the outreach sender (section 5.7): the growth session that owns `~/muse-inbox/tools` and `~/.ivypath-agent/outreach`.
  - `RESEND_API_KEY` on the site Vercel project: Ben (the project is on his Vercel account).
  - Google Ads, GA4 admin, Meta Events Manager settings, the texts themselves, and the confirmations in section 10: Vicente.

**Where this file lives.** This copy sits in `ivypath-site/docs/specs/` because the task asked for it there. **Do not commit it to ivypath-site until the `.vercelignore` in section 1.2 is merged.** The site deploys with `outputDirectory: "."`, so every committed file is served publicly (`/PRODUCT.md` and `/docs/superpowers/plans/...` return 200 today). The canonical copy belongs in the growth folder. This draft leaves out inbox addresses and bid settings for that reason.

`~/Downloads/CLAUDE.md` is Stashly's. None of its rules apply here.

---

## 0. Decisions

### 0.1 Decisions that shape this spec

**D1. The page gives a plan, not a readiness grade, and says so on every surface.**
- Self-reported answers cannot measure a student. PRODUCT.md also forbids "copy asserting the reader's own child's deficiency".
- Every parent-facing surface calls it an "SHSAT plan": page title, eyebrow, OG tags, share text, the SMS draft and the /shsat link. The word "readiness" appears nowhere on the page, because a parent reads it as "this will tell me whether my student is ready", and then the results say it is not an assessment.
- Internal names stay as they are: `quiz_*` events, file names, the `/shsat/quiz` route and the Ads conversion name.
- Band names describe the plan that fits the timeline and the prep so far. They never say "behind" or "not ready", and they never state a fact the parent did not give (section 2.6.3).
- "Not a score" appears three times only: the intro honesty line, the plan note, and the disclaimer.

**D2. Q1 asks who is filling it out. Students exit, and the ad tags stand down.**
- A self-declared student gets the exit screen (2.4) and never reaches the gate. That makes `attribution.v = 'parent'` (contact_role `parent`) the parent's own answer, not an assumption. The alert and `admin_notes` label it "self-declared parent".
- A student answer switches the tab into minor mode (section 6.2). Google ad consent is denied, the Meta Pixel is revoked, and tracking.js stops ad conversions for the rest of the tab. This follows New York's Child Data Protection Act. Counsel confirms the reading (section 10).

**D3. Phase 1: a site function carries the phone number, and it is proven before any ad points at the quiz.**
- `/api/funnel/send-link` drops phone, name and answers (its zod object strips unknown keys). So Phase 1 adds `api/quiz-lead.js`, which emails Vicente a tap-to-text alert through Resend.
- It sends from `IvyPath Alerts <hello@noreply.ivypathacademy.com>`, the sender the platform ops alert already uses (`ops-diagnostic-alert.ts:36`). The root domain is not verified in the production Resend account, so `noreply@ivypathacademy.com` would fail.
- Nobody has confirmed that `RESEND_API_KEY` is set on the site project (memory records the booking email as "inert until set"). Ben sets it for Production and Preview, using a key from the Resend account where `noreply.ivypathacademy.com` is verified.
- **Deploy gate (section 9.1):** `GET /api/quiz-lead` reports `resend_configured: true`, and a real `[TEST]` alert arrives in both ops inboxes with a working `sms:` link. No Ads final URL changes before that.
- If the key cannot be set on Monday, the rollout inverts. The ads stay on /shsat until the platform route (Phase 2) is live, and the quiz launches with `QUIZ_BACKEND = 'platform'`.
- A parent is never stuck. After two failed saves they get "Show my plan anyway" and a prefilled text they can send to IvyPath's line themselves (2.7). The failure also fires `quiz_lead_failed`, so an outage shows up on the first failure.

**D4. One payload, two backends, and fallback on anything the parent cannot fix.**
- The same JSON body goes to the site function (Phase 1) or the platform route (Phase 2). One constant, `QUIZ_BACKEND`, switches between them.
- In Phase 2, only three platform results are final: a 200, a 429, and a 400 whose `field` is `parent_name`, `phone` or `parent_email`. Every other outcome falls back to the site function, tagged with the reason: a network error, the 15 s timeout, a 5xx, a 413, a 400 without one of those fields, or any other 4xx. If the two repos drift apart, the worst case is a duplicate alert, never a lost lead.

**D5. The diagnostic link is sent only when the parent asks for it on the results screen.**
- In Phase 2 it is sent for the same lead through a short-lived `lead_ref` token, so no second lead without a phone number is created.
- If the token has expired, the page quietly uses the Phase 1 path. It never tells the parent to go to /shsat.

**D6. The VSL stays off (`SHOW_VSL = false`) until its narration is fixed.**
- The narration in `VSL-Editing/shsat-words.json` matches the pause pattern of the live `assets/ivypath-shsat-vsl.mp4` within 0.1 s at 11 points. It says:
  - "The kids would get into..."
  - "if your child is 20 points away from a top school or 200"
  - "Your child takes a real, full-length test"
  - "measured against this year's real specialized high school cut-offs"
  - "It takes about an hour"
  - "Tap the button below to start the diagnostic"
- The block is fully specified (2.6.8), so a re-cut can be switched on with one flag. The same words play on the /shsat hero today. That goes to section 10; fixing /shsat is out of scope here.

**D7. Trust claims are the approved claims, worded for SHSAT and no wider than their source.**
- **Tutors:** "Our SHSAT tutors are Stuyvesant '24 graduates, now at Cornell and Princeton." That is what the six /shsat tutor cards show. It does not say "our tutors": faq.html describes all tutors as Ivy League and Top 20 students, not all as Stuyvesant graduates.
- **99th percentile:** left out. On an SHSAT page it reads as an SHSAT percentile, which the DOE does not report. Vicente can supply an SHSAT-true version (section 10).
- **The 606 Stuyvesant offer** is shown with its context: an earlier SHSAT, before the fall 2026 format change.
- **Excluded:**
  - the 96% pass rate (it is the AP Calculus rate)
  - college acceptances
  - the Score Improvement Guarantee (no bare badge anywhere)
  - "aced"
  - tutor credentials that PRODUCT.md does not list

**D8. "First-time 9th graders" means students in their first year of 9th grade.** That is the DOE's wording ("first-time 9th grade students"), not first-time test takers. The option reads "9th grade (first year of 9th)". Vicente confirms (section 10).

**D9. book.html's "we can text your Meet link and a reminder" is changed**, because nothing sends those texts (section 7).

**D10. Google Ads gets one new snippet conversion, "SHSAT quiz lead".**
- The five existing actions stay as they are.
- The quiz becomes the landing page through **keyword-level** final URLs in the four parent-intent ad groups. There is no ad-group final URL, and editing an RSA's final URL recreates the ad and resets its stats.
- Bidding stays on Maximize clicks. Re-check it right after saving the new action.

**D11. No A/B test.** Traffic is about 6 ad clicks a day. /shsat stays as it is apart from one secondary hero link.

**D12. Texting means a person, at set hours, from a confirmed number, with a working STOP.**
- **Who texts:** Vicente, by hand, from the alert. Nothing automated may text a quiz family:
  - Muse's `can_contact.py` returns BLOCKED for quiz families.
  - No platform SMS path reaches them.
  - Quiz alerts never go into `~/muse-inbox` (section 5.7).
  - Any future automated texting needs new consent wording and a new `consent_version`.
- **Hours:** Vicente's contact windows from 2026-09-28 are 07:00-09:00, 12:00-13:30 and 17:30-20:30 ET. With an 08:00 floor for quiet-hours rules they become **08:00-09:00, 12:00-13:30 and 17:30-20:30**.
  - One constant, `TEXT_WINDOWS` (3.7), drives both the alert's "text now / text at" line and the parent-facing "may text you today / tomorrow morning" line.
  - Vicente decides whether a parent who just asked to be contacted is exempt from the windows (section 10). His answer changes only that constant.
- **Sender:** no sending number appears in the copy until Vicente confirms which number his texts come from (`TEXT_FROM_NUMBER = null`). `(929) 394-0349` is IvyPath's call line; nobody has confirmed his texts come from it.
- **STOP:** the SMS draft ends with "Reply STOP and I won't text again." The opt-out procedure is in 5.7. privacy.html gains a text-message paragraph before any ad points at the quiz.
- **Introduction:** before the gate, the page introduces the person who texts, with a photo and a one-line role that Vicente writes. No role is invented here. The texter card is a launch prerequisite (9.1).

**D13. The quiz collects no personal data about the student.**
- Draft 1's optional student-first-name field is dropped. That keeps a minor's name off the Pixel page, out of the alert inboxes and out of the platform, and it cuts the gate to three fields.
- All copy keeps a `{who}` token, which renders as "your student", so a name field could come back later if Vicente wants one (section 10).

**D14. The plan is worth a mobile number.**
- **Before the gate:** a real preview (plan name, countdown to the test, registration dates), the tutors, and the 606 offer.
- **After the gate:**
  - a dated week-by-week outline for students testing this fall
  - three takeaways, each opening with something a parent can do tonight without IvyPath
- **IvyPath mentions:**
  - at most one per takeaway
  - no takeaway mentions the diagnostic, which is named once, in its own block
- **Plan copy:** the plan is emailed to the parent right away (`PLAN_COPY`). That email is also the first proof, before Vicente's text arrives, that IvyPath is a real company.

**D15. The diagnostic gives an estimated score, not "a real number".**
- The platform labels its result "Estimated SHSAT composite (200-700 scale)", and sometimes "Provisional". All copy says "estimated score".
- The lint bans "real number".
- The schools line no longer says "We don't show cutoff scores here", because the diagnostic's results page shows them one click later.

**D16. Chinese is not promised until someone is confirmed to answer in Chinese.**
- The 中文 texting line is off (`ZH_TEXTS = false`).
- The approved "English or 中文" consultation reassurance stays, with a small 中文预约 link to `cn-book.html`.
- When Vicente confirms, the flag adds a text-language choice and a native-written Chinese draft (2.10).

### 0.2 Critique resolution index

| # | Lens | Blocker | Resolved in |
|---|---|---|---|
| B1 | Brand | "Real number" overclaims the diagnostic; cutoff mismatch | D15; 2.2, 2.6.1, 2.6.2, 2.6.7; lint 2.11 |
| B2 | Brand | Summaries state facts the parent did not give (`unsure`; unregistered after Oct 30) | 2.6.3 conditional summaries; `T1_REG_CLOSED`; tests 8.1 |
| B3 | Brand | Copy implies we replicate the adaptive format | Length-only wording ("100 questions in 180 minutes, on a computer") in 2.6.3, 2.6.5, 2.6.6; lint 2.11 |
| B4 | Brand | Tutor and 99th-percentile claims too wide | D7; 2.2, 2.5, 2.6.9 |
| B5 | Brand | Texting hours break Vicente's windows | D12; `TEXT_WINDOWS` 3.7; 2.5, 2.6.4, 2.8; owner decision in 10 |
| B6 | Brand | Unconfirmed sender number | D12; `TEXT_FROM_NUMBER = null` (5.5); AC12; 10 |
| B7 | Brand | STOP is promised but not handled or recorded | 2.8 draft; 5.7 opt-out procedure and privacy.html paragraph; platform item A (`sms_opted_out_at`) |
| B8 | Brand | "Not an automated system" is unenforced | D12; 5.7; platform item L |
| B9 | Brand | Meta AAM or Google user-provided-data detection can send form data | D13; 6.5; AC11 |
| B10 | Brand | A known minor is processed by ad tags | D2; 6.2 minor mode; 8.2 flow 2 |
| B11 | Brand | Under-button privacy promise narrower than reality | 2.5 wording; 5.7 outreach exclusion |
| P1 | Parent | "Readiness check" reads as bait-and-switch | D1; 1.4, 1.6, 2.2, 2.4, 2.8 |
| P2 | Parent | The plan is not worth a phone number | D14; 2.6.5, 2.6.6, 3.4, 3.5; tests 8.1 |
| P3 | Parent | No proof before the ask; nobody knows Vicente | 2.2 trust line; 2.5 proof row and texter card; 9.1 prerequisite |
| P4 | Parent | The gate is a "results ready, enter details" trap | 2.5 preview and honest H2; plan copy email (2.9, 5.3.1) |
| P5 | Parent | Chinese-first families | D16; 2.10 |
| P6 | Parent | Too many next steps, and none suits 9 PM | 2.6.4 time-aware "What happens next", second on the page |
| P7 | Parent | "Hi Chen," greeting | 2.8 draft opens "Hi, this is Vicente" |
| E1 | Eng | Phase 1 backend unproven (key, unverified sender) | D3; 5.3.1; 9.1 deploy gate and inversion; 2.7 no-backend text |
| E2 | Eng | Booking API requires the quiz file at module load | 7.3 guarded lazy require; 8.1 test |
| E3 | Eng | Phase 2 400 has no fallback (contract skew) | D4; 5.4; shared fixture 8.1 |
| E4 | Eng | E2E harness cannot run | 8.2 local server; 5.3.1 `QUIZ_RESEND_URL`, dev-only localhost origin |
| A1 | A11y | Double tap skips a question | 4.3; 8.2 flow 15 |
| A2 | A11y | Back-button trap after capture | 4.4 one-entry history; 8.2 flow 3 |
| A3 | A11y | Disclaimer and footer contrast 3.73:1 | 4.2 |
| A4 | A11y | Focus ring invisible on dark blocks; inputs lose it | 4.2 |
| A5 | A11y | Selection state not perceivable | 4.2, 4.3; 8.2 flow 19 |
| A6 | A11y | Tap targets under 44px | 4.2, 4.5; 8.2 flow 17 |
| A7 | A11y | Focus lost when controls change | 4.5; 8.2 flow 21 |
| A8 | A11y | Results start at opacity 0 (print, focus) | 4.7, 4.9 |
| A9 | A11y | Slow network dead ends and duplicate alerts | 5.3.1 idempotency; 5.4 timeouts; 2.7 (429 also offers the plan); 8.2 flow 16 |

### 0.3 Improvements considered and not adopted

- **"Ask us about past cutoffs on the consultation"** in the schools line: conflicts with B1. The line keeps only the adaptive-format sentence.
- **Moving the student first name to Q2:** the field is dropped instead (D13).
- **Making the gate optional for grade 5:** growth requires the phone number. Instead, grade 5 gets a no-rush SMS draft and an "(early)" label in the alert subject.
- **A separate `api/_quiz-codes.js` for the booking API:** replaced by a guarded lazy require of the logic file (7.3), which keeps a single source of codes.
- **Turnstile, enhanced conversions, a WeChat option, follow-up email sequences:** not in v1 (section 10).

Every other improvement from the critiques is adopted in the sections below.

---

## 1. Flow and routes

### 1.1 Flow

```
Ad click (parent-intent keywords) --> https://www.ivypathacademy.com/shsat/quiz
  [Intro] --Start--> [Q1 Who] --student--> [Student exit]  (minor mode; no lead, no gate)
                        | parent
                        v
  [Q2 Grade] -> [Q3 Schools (multi)] -> [Q4 Prep] -> [Q5 Practice test] -> [Q6 Worry]
                        v
  [Gate: plan preview + proof + texter card + name, mobile, email, consent]
     --submit (client-valid)--> write ivp_quiz_handoff, then
        Phase 1: POST /api/quiz-lead  {delivery: alert_and_copy}  -> alert to Vicente + plan copy to parent
        Phase 2: POST app/api/funnel/quiz-lead                    -> lead row + ops alert
                 then POST /api/quiz-lead {delivery: copy_only}    -> plan copy to parent
                 (anything but 200 / 429 / fixable 400 -> POST /api/quiz-lead {delivery: alert_and_copy}, reason tagged)
                        v
  [Results: header -> What happens next (Book) -> week by week -> 3 takeaways -> diagnostic -> trust -> save]
     --"Book a free 15-minute consultation"--> /book.html (prefilled from the handoff)
     --"Email the diagnostic link"--> Phase 1: app/api/funnel/send-link (v=parent)
                                      Phase 2: app/api/funnel/quiz-lead/send-link (lead_ref; expired -> Phase 1 path)
     --tel:--> call
  Vicente texts the parent by hand from the alert, inside TEXT_WINDOWS. Nothing automated texts a quiz family.
```

### 1.2 Files

| File | New or changed | Purpose |
|---|---|---|
| `shsat-quiz.html` | new | Markup for every screen, inline CSS, head tags, the Meta Pixel, the `<noscript>`/fallback block. |
| `shsat-quiz-logic.js` | new | Public UMD logic with no DOM access and no alert template: constants, labels, dates, `bandFor`, `bandCopy`, `weekPlan`, `takeawaysFor`, `textWindowState`, phone normalization, the school-email check, payload validation. Loaded by the browser from `/shsat-quiz-logic.js?v=1`, and by `api/quiz-lead.js`, `api/_quiz-alert.js` and (lazily) `api/book-consultation.js`. |
| `shsat-quiz.js` | new | The DOM controller: state machine, rendering, history, network calls, analytics. |
| `api/quiz-lead.js` | new | Phase 1 alert and plan copy; Phase 2 plan copy (`copy_only`) and fallback; `GET` health check (5.3.1). |
| `api/_quiz-alert.js` | new | Server-only helpers: `WORRY_PHRASE`, `smsDraft`, `looksLikeTestLead`, `buildAlertEmail`, `buildPlanEmail`, `deviceFromUA`. `api/_*.js` files are neither functions nor served (`/api/_calendar.js` returns 404 live), so the alert template and test-lead heuristics never ship to visitors. |
| `assets/logo-white-120.png` | new | About 121×64 export of `logo-white-transparent.png` (about 4 KB), shown at 60×32. |
| `assets/reviews/stuyvesant-offer-thumb.jpg` | new | 112 px wide thumbnail of the 606 screenshot for the gate proof row (about 6 KB). |
| `assets/vicente.jpg` | new (Vicente supplies) | 96×96 photo for the texter card. |
| `vercel.json` | changed | Rewrites and `X-Robots-Tag` headers (1.3). |
| `.vercelignore` | new | `docs/`, `tests/`, `playwright.config.js`, so specs, fixtures and tests are never served. |
| `tracking.js` | changed | `CFG.labels.quizLead`, `window.ivypathTrackQuizLead()`, a `quiz` kind in `ctaKind()`, `window.ivpGa4Id`, and minor mode, in which its own GA4 events go to GA4 alone (6.2). |
| `book.html` | changed | Handoff prefill in its own script block, the SHSAT hero line, the answers note, `quiz` in the POST, and the line-200 hint fix (section 7). |
| `book.css` | changed | `.link-button` (44 px text button). |
| `api/book-consultation.js` | changed | Accepts `quiz` for the default 15-minute type through a guarded lazy require (7.3). |
| `privacy.html` | changed | "Text messages" paragraph, a retention sentence, and a new "Last updated" date (5.7.3). |
| `shsat-diagnostic.html` | changed | One secondary hero link (1.6). Nothing else. |
| `sticky-cta.js` | changed (defensive) | Adds `'quiz'` and `'shsat-quiz.html'` to `hidden` (line 16). The quiz page does not load it. |
| `tests/shsat-quiz-logic.test.js`, `tests/quiz-alert.test.js`, `tests/quiz-lead-api.test.js`, `tests/book-consultation-quiz.test.js` | new | `node --test`, no new runtime dependencies. |
| `tests/fixtures/quiz-payload.json` | new | Shared payload fixtures. The platform tests copy the same file (5.6 H). |
| `tests/e2e/server.js`, `tests/e2e/shsat-quiz.spec.js`, `playwright.config.js` | new | Local harness and Playwright flows (8.2). |
| `package.json` | changed | `"test": "node --test tests/*.test.js"`, `"test:e2e": "playwright test tests/e2e"`; devDependencies `@playwright/test`, `@axe-core/playwright`. |

`sitemap.xml` and `robots.txt` are **not** changed. robots.txt stays `Allow: /`, so crawlers can see the noindex.

### 1.3 `vercel.json`

Add to `rewrites`, after the `/shsat` entry. `/shsat` matches exactly, so it does not catch these. The trailing-slash entry is required, because `/shsat/` returns 404 today.

```json
{ "source": "/shsat/quiz",  "destination": "/shsat-quiz.html" },
{ "source": "/shsat/quiz/", "destination": "/shsat-quiz.html" }
```

Add to `headers`:

```json
{ "source": "/shsat/quiz",      "headers": [{ "key": "X-Robots-Tag", "value": "noindex" }] },
{ "source": "/shsat/quiz/",     "headers": [{ "key": "X-Robots-Tag", "value": "noindex" }] },
{ "source": "/shsat-quiz.html", "headers": [{ "key": "X-Robots-Tag", "value": "noindex" }] }
```

`cleanUrls` stays unset, so `/shsat-quiz.html` is also reachable directly. The header covers it, and the head script normalizes the path (1.5).

### 1.4 Indexing and sharing

- `<meta name="robots" content="noindex">` in the head (the `thank-you.html:8` precedent), plus the header above.
- No `<link rel="canonical">`.
- OG tags:
  - `og:title` "A 2-minute SHSAT plan for parents | IvyPath Academy"
  - `og:description` "Six quick questions and a clear SHSAT plan for your student: the dates that matter, where to start, and what to focus on first."
  - `og:image`: `https://www.ivypathacademy.com/assets/ivypath-shsat-vsl-poster.jpg`, **only after** the frame check in 9.1 (no burned-in caption with banned words or claims). Otherwise leave `og:image` out.
- AdsBot ignores noindex for landing-page review, so the ads are not affected.

### 1.5 Paths, head and scripts

**Every URL on the page is root-absolute**, because the page is served under `/shsat/`:
- `/tracking.js`, `/school-email-guard.js?v=1`, `/shsat-quiz-logic.js?v=1`, `/shsat-quiz.js?v=1`
- `/assets/logo-white-120.png`, `/assets/ben.JPG`, `/assets/edison-sq.jpg`, `/assets/vicente.jpg`, `/assets/reviews/stuyvesant-offer.jpg`, `/assets/reviews/stuyvesant-offer-thumb.jpg`
- `/favicon-32.png`, `/apple-touch-icon.png`
- `/book.html`, `/cn-book.html`, `/privacy.html`, `/terms.html`

**Head order:**
1. `<meta charset="utf-8">` and the viewport meta.
2. The notrack snippet, copied verbatim from `shsat-diagnostic.html:4`.
3. One small inline script:
   - `document.documentElement.className += ' js';`
   - Path normalization, so `ivp_lp`, `ivp_ft.landing` and the link decorators all see one path: `if (location.pathname !== '/shsat/quiz') history.replaceState(null, '', '/shsat/quiz' + location.search + location.hash);`
   - The early-tap catcher: a capture-phase click listener that sets `window.__ivpEarlyStart = 1` when `#startBtn` is tapped before `window.IVP_QUIZ_READY` exists. The controller replays it (4.8).
4. Title, description, robots, OG, fonts, inline `<style>`.
5. The Meta Pixel, inline. Before `fbq('init','1550873539731081')`, add `try { if (sessionStorage.getItem('ivp_minor') === '1') fbq('consent','revoke'); } catch (e) {}` and then `fbq('set', 'autoConfig', false, '1550873539731081');`. Automatic configuration is on by default, and it sends a `SubscribedButtonClick` with the button's text for every `<button>` click, so every answer chip ("I'm a student", "5th grade or younger") would reach Meta. Then `PageView`, then `ViewContent {content_name:'SHSAT Plan Landing'}`.

**Page title:** `2-Minute SHSAT Plan for Parents | IvyPath Academy`

**Meta description:** "Answer six quick questions and get a clear SHSAT plan for your student: the dates that matter, where to start, and what to focus on first."

**Fonts** are the families of `shsat-diagnostic.html:27`, trimmed to the weights used, with no italics:
`https://fonts.googleapis.com/css2?family=Lora:wght@600&family=Instrument+Sans:wght@400;500;600&display=swap`

**End of body:** four `defer` scripts in this order: `tracking.js`, `school-email-guard.js?v=1`, `shsat-quiz-logic.js?v=1`, `shsat-quiz.js?v=1`. Deferred scripts run in document order, so the controller runs after `window.gtag`, `window.ivpAttribution` and `window.IVP_QUIZ` exist. The controller sets `window.IVP_QUIZ_READY = true` when it has bound its handlers.

**Not loaded:**
- `sticky-cta.js`: its relative `book.html` link would 404 under `/shsat/`, and a sticky bar would compete with the quiz.
- `style.css`, `pill-nav.*`, lenis, gsap.

### 1.6 The one /shsat change

In `shsat-diagnostic.html`, directly after the existing `.hero-alt-link` paragraph, add:

```html
<p class="hero-alt-link fade-in delay-3">Not sure where to start? <a href="/shsat/quiz" class="js-quiz-cta">Get a free 2-minute SHSAT plan <span aria-hidden="true">&rarr;</span></a></p>
```

Nothing else on /shsat changes. The click is tracked through the new `quiz` kind in `tracking.js` `ctaKind()` (6.2).

---

## 2. Copy (exact)

**Conventions**
- In HTML, apostrophes are typographic (`&rsquo;`), as on the live page. The strings below use `'` for readability.
- No em dashes, en dashes or `!` in quiz copy. This is Vicente's style preference for this page, **not** an IvyPath brand rule (brand-rules memory, PR #80). The lint that enforces it is scoped to the quiz files only.
- Arrows in buttons and links sit in `<span aria-hidden="true">`, so screen readers do not say "right arrow".
- No italic accent words (`.gi`), no pill or bubble chips.

**Tokens.** The quiz collects no student name (D13), so these render as fixed text. They stay as tokens so a name could be added later.
- `{who}`: "your student"
- `{Who}`: "Your student"
- `{who's}`: "your student's"
- `{Who's}`: "Your student's"

**Copy flags** (constants in `shsat-quiz.js`, section 5.5): `TEXT_FROM_NUMBER`, `TEXTER`, `PLAN_COPY`, `ZH_TEXTS`, `G9_NOTE`, `T3_PROCESS_VERIFIED`.

### 2.1 Chrome (every screen)

**Top bar** (`header.top-bar`, `--forest-deep` strip, `min-height: 56px`):
- Left: `<img src="/assets/logo-white-120.png" width="60" height="32" alt="IvyPath Academy">`. It is **not linked**, so the landing page has no exit.
- Right: `<a href="tel:+19293940349" class="top-phone">(929) 394-0349</a>`

**Disclaimer** (bottom of the results and exit screens, `.disclaimer-section`):
> This page builds a plan from your answers. It is not a score, a prediction, or an assessment of your student. Results shown reflect the experiences of individual IvyPath students and are not a guarantee of any particular score or admissions outcome. Individual results vary.
>
> IvyPath Academy is not affiliated with or endorsed by Stuyvesant High School, the Bronx High School of Science, Brooklyn Technical High School, the other specialized high schools, the New York City Department of Education, or any university. Tutor credentials reflect schools individual tutors have attended.

**Footer:** `shsat-diagnostic.html:969` verbatim, with `/privacy.html` and `/terms.html`.

**Fallback block** (`#fallback`). It sits inside `<noscript>`, and the controller also shows it if it fails (4.8):
> This page needs JavaScript to build your plan. You can [book a free 15-minute consultation](/book.html) or call or text (929) 394-0349.

### 2.2 Intro screen

| Element | Copy |
|---|---|
| Eyebrow (`.eyebrow`, `--gold-label` on cream) | SHSAT plan for parents |
| H1 | Get a clear SHSAT plan for your student in 2 minutes |
| Sub | Six quick questions about grade, schools and prep so far. You'll see the dates that matter, where to start, and what to focus on first. |
| Disclosure (16 px body text, **above** the button) | With `PLAN_COPY`: "At the end, we'll ask for your name, email and mobile number. You'll see your plan right away, we'll email you a copy, and Vicente from IvyPath may text you to go over it." Without: "At the end, we'll ask for your name, email and mobile number. You'll see your plan right away, and Vicente from IvyPath may text you to go over it." |
| Button (`#startBtn`, `.btn-primary`; hidden under `html:not(.js)`) | Start my plan → |
| Honesty line (14 px, muted) | This is a plan built from your answers, not a score. The free 35-minute diagnostic gives an estimated score from your student's own work. |
| Date line (`introDateLine(today)`, 3.3; empty from 2026-11-19) | See the table below |
| Trust line (14 px), with the Benjamin and Edison photos at 32 px | Built with SHSAT tutors who are Stuyvesant '24 graduates, now at Cornell and Princeton. |

**Date line by date** (DOE dates, verified 2026-09-23):

| Date | Copy |
|---|---|
| Before 2026-10-06 | SHSAT registration opens Tuesday, October 6 and closes Friday, October 30. The school-day test is Wednesday, November 18. |
| 2026-10-06 to 2026-10-30 | SHSAT registration is open until Friday, October 30. The school-day test is Wednesday, November 18. |
| 2026-10-31 to 2026-11-18 | The school-day SHSAT is Wednesday, November 18, the first year of the computer-adaptive format. |
| From 2026-11-19 | (none) |

### 2.3 Questions

Every question screen shows:
- `← Back` (`.q-back`). On Q1 it returns to the intro.
- The step label "Question N of 6". It is `aria-hidden="true"`, because the heading carries it for screen readers (4.5).
- The title as `h2.q-title` (`tabindex="-1"`), with the hint below it.
- On single-select screens, a visually hidden hint joined to the group through `aria-describedby`: "Choosing an answer moves to the next question."

| # | id | Title | Hint | Options: label → code |
|---|---|---|---|---|
| 1 | `role` | Who's filling this out? | (none) | I'm a parent or guardian → `parent` · I'm a student → `student` |
| 2 | `grade` | What grade is your student in this school year? | 8th graders and first-year 9th graders who live in NYC can take the SHSAT. | 5th grade or younger → `5` · 6th grade → `6` · 7th grade → `7` · 8th grade → `8` · 9th grade (first year of 9th) → `9` |
| 3 | `targets` (multi) | Which specialized high schools is your student aiming for? | Pick all that apply. | Stuyvesant → `stuyvesant` · Bronx Science → `bronx_science` · Brooklyn Tech → `brooklyn_tech` · Brooklyn Latin → `brooklyn_latin` · Staten Island Tech → `staten_island_tech` · Queens Science at York → `queens_science_york` · American Studies at Lehman → `american_studies_lehman` · Math, Science & Engineering at City College → `hsmse_ccny` · Not sure yet → `not_sure` (exclusive) |
| 4 | `prep` | What SHSAT prep is your student doing now? | (none) | Nothing yet → `none` · Practicing on their own (books or free sites) → `self` · A group program or prep center → `group` · A 1-on-1 tutor → `tutor` |
| 5 | `practice_test` | Has your student taken a full-length, timed practice SHSAT? | (none) | Not yet → `no` · Yes, once → `once` · Yes, two or more → `multiple` · I'm not sure → `unsure` |
| 6 | `worry` | What's your biggest worry about the SHSAT? | Pick the one that matters most. | Finishing all 100 questions in time → `timing` · Math → `math` · Reading and ELA → `ela` · The new computer-adaptive format → `adaptive` · Keeping prep consistent week to week → `consistency` · Not knowing where my student stands → `where_stands` · Understanding registration and how offers work → `process` |

**Q3 details**
- Button: `Continue →`. It is never `disabled`.
- Picking "Not sure yet" clears the other picks and announces "School picks cleared." through `#quizStatus`. Picking a school clears "Not sure yet".
- Pressing Continue with nothing selected shows, inline in the Q3 error element (`role="alert"`): "Pick at least one school, or choose Not sure yet."
- The hint "Pick all that apply." is joined to the group through `aria-describedby`.
- LaGuardia is left out on purpose: it admits by audition, not the SHSAT.

**Labels used on results, in the alert and in the calendar block**
- Short school names are the Q3 labels.
- Worry short labels (T3 title): `timing` finishing in time · `math` math · `ela` reading and ELA · `adaptive` the new format · `consistency` staying consistent · `where_stands` knowing where things stand · `process` registration and offers.

### 2.4 Student exit screen (Q1 = student)

Entering this screen calls `window.ivpMinorMode()` first (6.2).

| Element | Copy |
|---|---|
| H2 | This page is written for parents |
| Body | It asks about plans and schedules a parent usually decides. Here are two good next steps. |
| Button (`.btn-primary`, `js-diagnostic-cta`, `data-exam="SHSAT"`) | Take the free 35-minute diagnostic → |
| Button (`.btn-secondary`) | Share this with a parent |
| Link (`.q-back`) | I'm a parent, go back |
| After a copy succeeds (`#quizStatus`) | Link copied. Send it to a parent. |

**The exit diagnostic link**
- The link is static markup in the page, so the tracking.js decorators see it at load.
- On entering the exit screen, the controller resets its `href` to `https://app.ivypathacademy.com/free-diagnostic-shsat/?utm_source=…&utm_medium=…&ivp_lp=%2Fshsat%2Fquiz&v=student`.
  - It keeps only the `utm_*` values from `quizAttribution()`.
  - It drops `gclid`, `fbclid`, `wbraid`, `gbraid`, `first_*` and `ref`. No ad click identifier travels with a known minor.
  - `v=student` sets contact_role `student` in the platform (`lead-attribution.ts:49`).

**What the share button does**
- It calls `navigator.share({ title: '2-minute SHSAT plan for parents', url })`.
- If that is unavailable, it tries `navigator.clipboard.writeText(url)`.
- If both fail (in-app WebViews), it shows the URL in a read-only input that selects its text on focus.
- `url = location.origin + '/shsat/quiz?utm_source=student_share&utm_medium=quiz'`. It never uses `ref`.

### 2.5 Gate

Order, top to bottom:
1. Step label
2. H2 and sub
3. Plan preview
4. Proof row
5. Fields, each with its help text; the texter card sits under the mobile help
6. Consent
7. Submit
8. Under-button line
9. Back

| Element | Copy |
|---|---|
| Step label | Last step |
| H2 | Where can we reach you? |
| Sub | With `PLAN_COPY`: "Your plan is ready. We'll show it right away and email you a copy." Without: "Your plan is ready. We'll show it right away." |
| Plan preview (`.plan-preview`, `aria-label="Plan preview"`) | Line 1: the eyebrow line (2.6.1). Line 2: the band name (2.6.3). Line 3: for `final_weeks_*` bands on or before Oct 30, the registration sentence ("Registration opens Tuesday, October 6 and closes Friday, October 30." or "Registration closes Friday, October 30."); for other bands, the first sentence of the band summary. |
| Proof row | Benjamin and Edison photos (40 px), with the text "Our SHSAT tutors are Stuyvesant '24 graduates, now at Cornell and Princeton." Next to it, the 606 thumbnail (`stuyvesant-offer-thumb.jpg`, 56 px, alt "NYC MySchools screenshot: an SHSAT score of 606 and a Stuyvesant offer") captioned "A real Stuyvesant offer, SHSAT 606". Small line below: "Tutor credentials reflect schools individual tutors have attended." |
| Field 1 label | Your name (parent or guardian) |
| Field 2 label | Mobile number |
| Field 2 help | With `TEXT_FROM_NUMBER`: "US mobile, for example (917) 555-0142. Vicente from IvyPath texts from (929) 394-0349, never before 8 AM or after 8:30 PM ET." Without: "US mobile, for example (917) 555-0142. Vicente from IvyPath texts you himself, never before 8 AM or after 8:30 PM ET." |
| Texter card (under the field 2 help, only when `TEXTER.role` and `TEXTER.photo` are set) | 32 px photo, then "{TEXTER.name}, {TEXTER.role}, IvyPath Academy". The role is written by Vicente (section 10). |
| Field 3 label | Email |
| Field 3 help | With `PLAN_COPY`: "We'll email you a copy of this plan, and the diagnostic link if you ask for it." Without: "So we can reach you if a text doesn't get through, and to send the diagnostic link if you ask for it." |
| Consent checkbox (required, **unchecked by default**; version `quiz-2026-09-28`) | IvyPath Academy (Perevalis Tutoring LLC) may text and email me about my student's SHSAT plan. Texts come from a person at IvyPath, not an automated system, and there will only be a few. Reply STOP to opt out. Message and data rates may apply. Agreeing isn't required to book a consultation or enroll. |
| Submit (`.btn-primary`, full width) | Show my plan |
| Under the button (13 px, muted) | We use your details to follow up about your student's SHSAT prep, and we never sell them. [Privacy policy](/privacy.html) (opens in a new tab). Prefer to talk first? Call (929) 394-0349. |
| Back | ← Back |

**Field attributes**
- **Name:**
  - `name="parent_name"`, `autocomplete="name"`, `autocapitalize="words"`
  - required, 2 to 120 characters after `sanitizeName`
- **Mobile:**
  - `type="tel"`, `name="phone"`, `autocomplete="tel"`, `inputmode="tel"`
  - required
  - **No placeholder.** The example lives in the help text.
- **Email:**
  - `type="email"`, `name="parent_email"`, `autocomplete="email"`, `inputmode="email"`, `autocapitalize="off"`, `spellcheck="false"`
  - required
- **Consent:**
  - `name="consent"`
  - The `label` wraps the input and the text. The consent error sits **outside** the label and is joined to the checkbox through `aria-describedby`.
- **Honeypot:**
  - `<input name="ivp_hp_x" class="sendlink-hp" tabindex="-1" autocomplete="off" aria-hidden="true">`
  - The name is one that browser autofill does not match (`company_name` is matched to Organization).
  - The controller maps it to `company_name` in the JSON.
- **Form:**
  - `novalidate`, with no `data-school-email` attribute, so the guard's default block mode applies.
  - **Exactly one** `[role="alert"]` element: the `.quiz-alert` summary directly above the submit button (4.6).

### 2.6 Results

The results screen, in DOM order:
1. Plan header (2.6.1), including the plan-copy status line
2. Schools line (2.6.2)
3. What happens next (2.6.4)
4. Week by week (2.6.5, `final_weeks_*` only)
5. Three things to know (2.6.6)
6. Diagnostic block (2.6.7)
7. VSL block (2.6.8, off)
8. Trust row (2.6.9)
9. Save or print (2.6.10)
10. Disclaimer and footer

#### 2.6.1 Plan header

- **H1** (`tabindex="-1"`, first in the DOM): `{Who's} SHSAT plan`, which renders as "Your student's SHSAT plan".
- **Eyebrow**: placed **after** the H1 in the DOM and shown above it visually (`display: flex; flex-direction: column` with `order`).
  - For `final_weeks_*` bands, `countdownLine(today)` (3.3).
  - For every other band: "SHSAT plan for parents".
- **Band name** (`p.plan-type`, 18 px, weight 600): the band name from 2.6.3.
- **Summary:** the band summary (2.6.3).
- **Plan note** (`.plan-note`, 14 px, muted, 2 px sage left rule): "Built from your answers: a plan, not a score or a measurement."
- **Plan-copy status** (`p.plan-copy-status`, `role="status"`, 14 px; shown only when captured and `PLAN_COPY` is on):
  - Sending: "Emailing a copy to {address}…"
  - Sent: "A copy of this plan is on its way to {address}."
  - Failed: "We couldn't email your copy just now. You can save or print it below."
  - `{address}` is rendered with `textContent` and wraps with `overflow-wrap: anywhere`.

#### 2.6.2 Schools line

- If `targets` is `['not_sure']`: "Schools: still deciding. We can go over the options on the consultation."
- Otherwise: "Aiming for: {short names, joined with commas and a final 'and'}."
- For grades 6 to 9, one more sentence follows. It is the only permitted use of "cutoffs" (lint exception): "Fall 2026 is the first computer-adaptive SHSAT, so past cutoffs are only a rough guide."

#### 2.6.3 Bands (name and summary)

`{prefix}` applies to the three `final_weeks_*` bands:
- On or before 2026-10-30: "{Who} is in the right grade to take the SHSAT this fall."
- From 2026-10-31: "If {who} registered by October 30, the test is this fall."

| Band code | Name | Summary |
|---|---|---|
| `final_weeks_baseline` | Before November 18: begin with one timed practice test | {prefix} If {who} hasn't taken a timed, full-length practice test yet, that's the first step, so the weeks that are left go where they're needed most. |
| `final_weeks_focus` | Before November 18: work on what the practice test showed | {prefix} There's already a practice test to learn from, so the plan is to spend the remaining weeks on the question types that were missed or took longest, with timed practice at the new 100-question length. |
| `final_weeks_sharpen` | Before November 18: timed practice and review | {prefix} {Who} already has structured prep, so the plan now is timed practice at the new 100-question length, on a computer, with extra time on the question types that still take longest. |
| `full_year` | Fall 2027: a steady year of practice | {Who} would take the SHSAT in fall 2027. A year out is a good time to start: enough time to build skills at a steady pace, without a rush at the end. |
| `foundation` | Fall 2028: strong reading and math basics | {Who} would take the SHSAT in fall 2028. For now, the plan is strong reading and math basics, with a little practice to get familiar with the test. |
| `early_start` | Early years: everyday reading and math | {Who} is still a few years away from the SHSAT. The most useful work now is everyday reading and math. There's no need for test prep yet. |
| `after_test` | After the fall 2026 test | The fall 2026 SHSAT dates have passed. If {who} took the test, a free 15-minute consultation can help you think through what comes next. |

The `final_weeks_baseline` summary is conditional for both `no` and `unsure` answers (B2). No summary says "can take" without the grade qualifier or the registration condition.

#### 2.6.4 What happens next (consultation)

`section.next-step` on `--forest-deep` with cream text. It is the one dark block on the results screen, sits directly under the header, and holds the single primary button.

| Element | Copy |
|---|---|
| H2 | What happens next |
| Body | Book a free 15-minute consultation with an IvyPath tutor who went to Stuyvesant. We'll go over what you've seen so far, what to work on first, and a recommendation only if it fits. We'll also walk you through the options and the investment, so you can compare. No pressure either way. |
| Button (`.btn-primary`, gold as on `.hero-dark`; `href="/book.html"`; class `js-quiz-consult`) | Book a free 15-minute consultation → |
| Reassurance (`.reassurance`) | Free · 15 minutes on Google Meet · English or 中文 · [中文预约](/cn-book.html) (`lang="zh-Hans"`) |
| Text note (only when captured and the honeypot was empty) | "Or wait for a text: Vicente from IvyPath may text you {when} to find a time." With `TEXT_FROM_NUMBER`, add: "Texts come from (929) 394-0349, so you may want to save it." The texter card follows when `TEXTER` is complete. |
| Call line | From 09:00 to 20:30 ET: "Prefer to talk now? [Call (929) 394-0349](tel:+19293940349)." Otherwise: "Prefer to talk? [Call (929) 394-0349](tel:+19293940349) after 9 AM ET." |

`{when}` comes from `textWindowState(now).parentPhrase` (3.7): `today`, `later today`, `this morning` or `tomorrow morning`.

#### 2.6.5 Week by week (`final_weeks_*` bands only)

- The heading is H2 "Week by week".
- It is an `ol.week-plan` of rows from `weekPlan(answers, today)` (3.4). Each row has a label (`strong`) and one sentence.
- No row mentions the diagnostic or IvyPath.

Example for 2026-09-28, `final_weeks_baseline`, worry `math`:

| Label | Text |
|---|---|
| This week | One timed, full-length practice test (100 questions in 180 minutes), then list the question types that were missed or took longest. |
| Oct 6 to Oct 30 | Register for the SHSAT. Your student's school counselor can tell you how it works at their school. |
| Weeks of Oct 5 to Nov 2 | Most practice time on the math topics that take longest, plus one timed section each week. |
| Week of Nov 9 | One last timed run early in the week, then light review. |
| Test dates | Wednesday, November 18 is the school-day test. Charter, private and homeschool students test on November 14, 15 or 21. |

#### 2.6.6 Takeaways

- The heading is H2 "Three things to know". The takeaways are an `ol.takeaways`.
- Each item has an H3 that starts with `<span class="takeaway-n">1</span><span class="sr-only">. </span>` (Lora 600, `--gold-label`, not in a circle), then the title, then a body paragraph.
- `after_test` shows no takeaways and no heading.
- **Rules:**
  - Every body opens with something the parent can do without IvyPath.
  - At most one IvyPath or consultation mention per body.
  - No body contains "diagnostic".
- Selection is in 3.5.

**T1: title "The dates that matter" (grades 8 and 9)**

| id | Body |
|---|---|
| `T1_REG_SOON` | Registration opens Tuesday, October 6 and closes Friday, October 30. The school-day test is Wednesday, November 18. The weekend dates, November 14, 15 and 21, are for charter, private and homeschool students. This week, ask {who's} school counselor how registration works at their school. |
| `T1_REG_OPEN` | Registration is open now and closes Friday, October 30. The school-day test is Wednesday, November 18. The weekend dates, November 14, 15 and 21, are for charter, private and homeschool students. This week, ask {who's} school counselor how registration works at their school. |
| `T1_REG_CLOSED` | Registration closed on Friday, October 30. The school-day test is Wednesday, November 18, and the weekend dates, November 14, 15 and 21, are for charter, private and homeschool students. If {who} isn't registered, ask the school counselor right away about options. |
| `T1_G9_NOTE` (appended for grade 9 only when `G9_NOTE` is verified; otherwise omitted) | For 9th graders, the test is for 10th-grade seats, and there are far fewer of those than 9th-grade seats. |

Under the grade 8 and 9 T1 body, add a link line: "Official dates and how to register: [the DOE's specialized high schools page](https://www.schools.nyc.gov/enrollment/enroll-grade-by-grade/specialized-high-schools) (opens in a new tab)." Re-check that the URL returns 200 at merge.

**T1: title "When {who} takes the SHSAT" (grades 5 to 7)**

| id | Body |
|---|---|
| `T1_G7` | Students usually take the SHSAT in the fall of 8th grade. For {who}, that's fall 2027, a full year away, which leaves room to prepare at a steady pace. |
| `T1_G6` | Students usually take the SHSAT in the fall of 8th grade, so for {who} that's fall 2028. The test became computer-adaptive in fall 2026, so any practice should match the new length: 100 questions in 180 minutes, on a computer. |
| `T1_G5` | Students usually take the SHSAT in the fall of 8th grade. For {who}, that's at least three years away. |

**T2: title "Where to start"**

| id | Body |
|---|---|
| `T2_BASELINE` | Start with one timed, full-length practice test: 100 questions in 180 minutes, on a computer if you can. Afterward, list the question types that were missed or took longest. That list shows where practice time should go first. |
| `T2_USE_TEST` | Go back through the practice test {who} already took. Mark each question that was missed or took too long, and group them by type. Build each week around the two or three biggest groups. |
| `T2_CHECK_FORMAT` | Keep what's working, and check that practice matches the new test: 100 questions in 180 minutes, on a computer. Ask {who's} current program whether its practice tests use the new length. |
| `T2_HABITS` | Build everyday habits: reading longer books and articles, and steady practice with fractions, ratios and word problems. These give {who} a strong base for later. |

**T3: title "Your biggest worry: {worry short label}"** (grade 5 uses the title "Your biggest worry" with no label)

| id | Body |
|---|---|
| `T3_TIMING` | Practice pacing with timed sets rather than extra untimed work. On the new test there's no penalty for a wrong answer, and math questions and stand-alone ELA questions can't be revisited once answered, so practice making a best guess and moving on. |
| `T3_MATH` | Pick the math topics that come up most and the ones that take {who} longest, and practice a few of each every week. Short, regular practice on those topics usually helps more than long weekend sessions. |
| `T3_ELA` | Reading and ELA build more slowly than math, so regular practice with longer passages matters. Have {who} check each answer against the text before moving on. |
| `T3_ADAPTIVE` | Fall 2026 is the first year the SHSAT is computer-adaptive: each answer changes which question comes next. Practicing on a computer, at the new 100-question length, helps test day feel familiar. |
| `T3_CONSISTENCY` | Pick two or three fixed practice times each week and keep them, even in busy weeks. With IvyPath, you also get automated progress reports after sessions, so you can see what {who} worked on. |
| `T3_WHERE` | A timed, full-length practice test is the clearest way to find out. Afterward, look at which question types were missed or took longest, not only the total. |
| `T3_PROCESS` (when `T3_PROCESS_VERIFIED`) | On the application, you list the specialized high schools {who} would attend, in order of preference. The order matters: offers go by score, then by the order you listed the schools. The DOE's specialized high schools page explains each step. |
| `T3_PROCESS_BASIC` (until verified) | Start with the DOE's specialized high schools page: it explains registration, the test and how offers are made. On a free 15-minute consultation, we can go over any step you're unsure about. |
| `T3_EARLY` (grade 5) | It's early, and that helps. For now, reading for fun and everyday math matter more than test prep. When {who} reaches 6th or 7th grade, a free 15-minute consultation can help you decide when to start. |

The timing, no-penalty, no-revisit, 100-question and 180-minute facts are DOE-sourced (brand-rules memory, verified 2026-09-09/10 and re-verified 2026-09-25). None of this copy claims IvyPath replicates the new format.

#### 2.6.7 Diagnostic block

A white `.sendlink-card`. Visibility rules are in 3.6. This is the only place on the results screen that names the diagnostic.

| Element | Copy |
|---|---|
| H2 | Want an estimated score? The free 35-minute diagnostic |
| Body | {Who} takes it online, any time in the next 14 days. It gives an estimated score from {who's} own answers, and the report is emailed to you when {who} finishes. |
| Field label | Student's email (optional) |
| Field | `type="email"`, `name="student_email"`, `autocomplete="off"`, `autocapitalize="off"`, `spellcheck="false"` |
| Field help | Leave blank and we'll send the link to you to forward. School accounts ending in @nycstudents.net can't receive it. |
| Button (`.btn-secondary`) | Email the diagnostic link |
| Sending state | Sending… |
| Success (replaces the form; `tabindex="-1"`, focused; not in a live region, so it is announced once through focus) | Link sent to {address}. It works for 14 days, and the report still comes to you when {who} finishes. |
| Error | The server's `error` string, else: "We couldn't send the link just now. Please try again." |
| Error, second line (static link, `js-diagnostic-cta`) | Or start it here yourself → `https://app.ivypathacademy.com/free-diagnostic-shsat/` |
| Grade 9 while the diagnostic is not available for 9 (replaces the form) | For 9th graders, ask about the diagnostic on your free consultation. |
| Link variant (not captured, or no handoff email; static link, `js-diagnostic-cta`) | Start the free diagnostic → (same app URL) |

"The report is emailed to you" depends on platform item F (5.6). AC6 checks it.

#### 2.6.8 VSL block (`SHOW_VSL = false`; built but not rendered)

- `<figure>` with the H2 "What the SHSAT actually takes" and a `<figcaption>`: "Benjamin · Stuyvesant '24 · Cornell '28 · 1 min 21 s".
- `<video controls playsinline preload="none" poster="/assets/ivypath-shsat-vsl-poster-800.jpg" width="1280" height="720">` with `<source src="/assets/ivypath-shsat-vsl.mp4?v=3" type="video/mp4">`. There is no autoplay.
- **Captions:** PRODUCT.md requires burned-in captions, so there is no `default` VTT track (it would show two sets). Below the video, a `<details>` "Read the transcript" holds the full narration, including on-screen text.
- The poster is an 800 px wide version (about 40 KB), not the 1600×900 one.
- **Turn it on only when all of these hold:**
  - (a) the narration no longer contains the D6 lines
  - (b) the transcript is corrected (the ASR hears "Stuyvesant" as "Stubborn")
  - (c) Vicente confirms
- **Event:** `quiz_vsl_play` on the first `play`.

#### 2.6.9 Trust row

- The heading is H2 "Who your student would work with". The layout is `.proof-grid` of `.proof-item`: a 2 px gold top rule, an H3 and a `p`. No chips, no circles.

| H3 | p |
|---|---|
| Stuyvesant graduates | Our SHSAT tutors are Stuyvesant '24 graduates, now at Cornell and Princeton. (Two mini cards follow: Benjamin Nudelman, Stuyvesant '24 · Cornell '28; Edison Zhu, Stuyvesant '24 · Princeton '28, with the photos at 48 px.) |
| A real result | An IvyPath student's SHSAT score of 606 and an offer from Stuyvesant, on the official NYC MySchools portal, shared with permission. That was on the SHSAT before the fall 2026 format change. Individual results vary. |
| Automated parent reports | You get automated progress reports after sessions, so you can see what {who} worked on. |
| English and 中文 | Consultations in English or Chinese. |

- Below the grid: "Tutor credentials reflect schools individual tutors have attended."
- **Screenshot:**
  - `<img src="/assets/reviews/stuyvesant-offer.jpg" loading="lazy" decoding="async" width height alt="NYC MySchools portal screenshot showing an SHSAT score of 606 and an offer from Stuyvesant High School">`, at most 280 px wide.
  - If Vicente supplies the year (section 10), the p reads "...shared with permission, from the {year} SHSAT, before the fall 2026 format change."

#### 2.6.10 Save or print

- A text button (`.text-btn`): "Save or print this plan". It calls `window.print()`.
- Help: "Opens your device's print or save-as-PDF screen."
- **Hidden in in-app browsers** (UA matches `/FBAN|FBAV|Instagram|GSA\//`), where `print()` does nothing. The emailed copy covers them.
- Print CSS is in 4.9.

### 2.7 Loading, error and empty states

| Where | Trigger | Copy and behavior |
|---|---|---|
| Gate | Name missing or shorter than 2 characters | Inline under the field: "Please enter your name." |
| Gate | Phone fails `normalizeUsMobile` | "Please enter a 10-digit US mobile number." |
| Gate | Email fails the basic regex | "Please enter a valid email address." |
| Gate | `@nycstudents.net` or a near miss | The guard (block mode) stops the submit and writes its own message into the form's one `[role="alert"]`. Our handler does not run. |
| Gate | Consent unchecked | "Please check the box so we can follow up." |
| Gate | Submitting | The button gets `aria-disabled="true"` (not `disabled`, so it keeps focus) and reads "Saving…". An in-flight guard ignores further submits. `#quizStatus` says "Saving your answers." There is no `aria-busy`. |
| Gate | Still saving after 5 s | The button reads "Still saving…". |
| Gate | First failure: network error, timeout, 5xx, 413 or another unexpected status | Summary in `.quiz-alert`: "We couldn't save that just now. Please try again. If it keeps happening, call or text (929) 394-0349." All values are kept, and focus stays on the button. Fires `quiz_lead_failed`. |
| Gate | Second failure in a row | The same message, plus two things below it. (1) The text button "Show my plan anyway", which gets focus. (2) On touch devices (`pointer: coarse`), a link "Or text us yourself" to `sms:+19293940349?&body={encodeURIComponent('Hi, I just did the SHSAT plan on your site. My student is in ' + gradeLabel + '. Please text me back.')}`. On other devices, the line "Or call or text (929) 394-0349." "Show my plan anyway" renders the results with `captured=false`: no text note, no plan-copy line, and the diagnostic block shows the link variant. |
| Gate | 400 with a `field` in the body | The inline message goes on that field, and focus moves there. |
| Gate | 400 without a known `field` | Treated as a failure (row above). In Phase 2 it falls back first (5.4). |
| Gate | 429 | The server `error` if present, else: "Too many tries in a short time. Please call or text (929) 394-0349." "Show my plan anyway" appears at once, because the plan is not secret. |
| Q3 | Continue with nothing selected | "Pick at least one school, or choose Not sure yet." |
| Results | Plan copy failed | The plan-copy status line in 2.6.1. |
| Any | Storage blocked, and the page reloaded | The quiz starts at the intro again. Nothing is thrown. |
| Any | An answer is missing when the band or gate needs it | The controller goes to the first unanswered question. It never throws. |
| Any | JavaScript off, or the controller not ready 8 s after load | The fallback block from 2.1. |

### 2.8 Ops alert and SMS draft

The Phase 1 site function (`api/_quiz-alert.js`) and the Phase 2 platform alert (5.6 item D) use the same template.

**SMS draft** (`smsDraft({ band, worry })`, at most 320 characters, no `!`, no emoji, no em or en dashes):

```
Hi, this is Vicente from IvyPath Academy. Thanks for requesting an SHSAT plan on ivypathacademy.com. {worrySentence} {ask} Reply STOP and I won't text again.
```

- It never guesses a first name (surname-first names such as "Chen Li" would read "Hi Chen,"). The parsed name appears only in the alert table, so Vicente can personalize on purpose.
- It makes sense to a parent who never saw the page (for example, when a student entered a parent's number).
- `{worrySentence}` is "You mentioned {worryPhrase} as the biggest worry." It is left out for `early_start` and `after_test`. The `worryPhrase` values:
  - `timing` → finishing on time
  - `math` → math
  - `ela` → reading and ELA
  - `adaptive` → the new computer-adaptive format
  - `consistency` → keeping prep consistent
  - `where_stands` → knowing where your student stands
  - `process` → registration and how offers work
- `{ask}` by band:
  - `final_weeks_*`: "Happy to go over the plan on a free 15-minute consultation. Would today or tomorrow work?"
  - `full_year`, `foundation`: "Happy to go over a plan for the year on a free 15-minute consultation, whenever it suits you."
  - `early_start`: "Happy to answer any questions whenever it's useful. There's no rush."
  - `after_test`: "Happy to talk through what comes next on a free 15-minute consultation, whenever it suits you."
- The longest combination is about 295 characters. If a future edit goes over 320, the worry sentence is dropped first.
- **Opt-out confirmation**, sent once by hand: "Got it. You won't get more texts from IvyPath Academy."

**Alert email**
- **From:** `IvyPath Alerts <hello@noreply.ivypathacademy.com>` (env `QUIZ_ALERT_FROM` may override)
- **To:** env `QUIZ_ALERT_TO`, split on commas into an array. It defaults to the two addresses in the platform's `OPS_ALERT_RECIPIENTS` (`ops-diagnostic-alert.ts:35`), copied into `api/_quiz-alert.js`.
- **Reply-To:** the parent's email.
- **Subject:** `Quiz lead · {parent_name} · gr {grade label} · {first two short school names | schools undecided} · {text now | text at 12:00 PM | text tomorrow 8:00 AM}`
  - Grade labels: `5 or younger (early)`, `6`, `7`, `8`, `9 (first year)`.
  - Prefix `[TEST?] ` when `looksLikeTestLead` matches. The alert is still sent; nothing is suppressed on a heuristic, because a real "Demopoulos" or "latestnews@" would otherwise be lost.
  - Prefix `[HONEYPOT?] ` when the honeypot was filled (Phase 1 sends these, since a lost parent costs more than bot noise).

**Body, HTML and a text part, everything HTML-escaped:**
1. "{parent_name} (self-declared parent) finished the SHSAT plan. No diagnostic yet."
2. Two buttons:
   - `Text {phone display} with this message` → `sms:{E164}?&body={encodeURIComponent(draft)}`
   - `Call {phone display}` → `tel:{E164}`, with the note "They agreed to texts and email. Call if they ask for a call."
3. Texting window line, from `textWindowState(receivedAt)`: "Received {h:mm AM/PM} ET. Inside a texting window: text now." or "Received {h:mm AM/PM} ET. Next texting window: {time} {today | tomorrow}."
4. "Draft text:" followed by the draft in a quote block.
5. A table:
   - Parent (as typed), Mobile, Email, Grade
   - Aiming for, Prep now, Practice test, Biggest worry
   - Plan shown (band name)
   - Diagnostic link: "not sent yet"
   - Plan copy emailed: yes / no / off
6. **Consent record:**
   - `consent_version`
   - the exact consent text for that version
   - the time in New York and in ISO UTC
   - the IP (first `x-forwarded-for` entry)
   - the device (a short UA parse: iPhone, Android, Mac, Windows or other)
7. **Source:**
   - `utm_source / utm_medium / utm_campaign / utm_term`
   - `gclid: yes/no`
   - `first_referrer`, `first_landing`
   - landing page `/shsat/quiz`
8. `quiz_id`, and `backend: site | site_fallback (reason platform_<status>)`.
9. Footer:
   - "These are the parent's own answers, not a score."
   - "Keep this email: it is the consent record."
   - "If they reply STOP, confirm once and add the number to the texting opt-out list (quiz spec 5.7)."

### 2.9 Plan copy email (to the parent)

Sent by `api/quiz-lead.js` when `delivery` includes the copy (5.3.1).

- **From:** `IvyPath Academy <hello@noreply.ivypathacademy.com>` (env `QUIZ_PLAN_FROM` may override)
- **To:** the parent's email.
- **Reply-To:** env `QUIZ_REPLY_TO`. It defaults to `info@ivypathacademy.com`, the contact address privacy.html already publishes.
- **Subject:** "Your student's SHSAT plan from IvyPath Academy"
- **Content:** no user-supplied text at all (no names, no free text), so the endpoint cannot be used to relay a message. The body is built with `buildPlanEmail(answers, today)` from the same logic functions as the screen:
  1. "Here's the SHSAT plan you asked for on ivypathacademy.com. It's built from your answers: a plan, not a score or a measurement."
  2. The eyebrow line, the band name and the summary.
  3. "Week by week" rows, when there are any.
  4. "Three things to know".
  5. "Next step: a free 15-minute consultation. Pick a time at https://www.ivypathacademy.com/book.html or call (929) 394-0349." The link is bare: no `ref`, no attribution.
  6. Footer: "You're getting this email because you asked for your SHSAT plan on ivypathacademy.com. IvyPath Academy is operated by Perevalis Tutoring LLC, New York, NY. Privacy: https://www.ivypathacademy.com/privacy.html". The postal address is added when Vicente supplies it (section 10).
- It carries no marketing beyond the one consultation line, so it is the transactional copy the parent asked for.

### 2.10 Chinese (flag `ZH_TEXTS`, off at launch)

- **At launch:**
  - No 中文 texting promise anywhere.
  - The "English or 中文" consultation reassurance and the 中文预约 link to `/cn-book.html` stay (approved bilingual claim).
  - All `lang` attributes on Chinese text are `zh-Hans`.
- **When Vicente confirms who answers Chinese texts, and how fast:**
  - (a) A line under the top bar: "需要中文服务？可以预约中文咨询。" linking `/cn-book.html` (a native speaker approves the wording).
  - (b) An optional one-tap choice on the gate, "Text me in: English / 中文", sent as `lang: 'en' | 'zh'` in the payload and shown in the alert subject and the handoff.
  - (c) A Chinese SMS draft written and approved by a native speaker (not machine-translated), stored as `SMS_DRAFT_ZH` in `api/_quiz-alert.js`.
  - (d) When 中文 is chosen, the consultation button goes to `/cn-book.html`.

### 2.11 Copy lint (unit tests plus the E2E sweep)

**Scope** (every customer-facing string of the quiz):
- every string exported from `shsat-quiz-logic.js`
- the output of `smsDraft`, `buildAlertEmail` and `buildPlanEmail`
- the page's static text, including `<title>`, meta and OG content, `alt`, `aria-label` and `<noscript>`
- the calendar SHSAT block
- the new book.html strings

**Case-insensitive regexes that must not match:**
- `\bkids?\b`
- `\b(costs?|fees?|prices?|pricing)\b`
- `discount|cheap|affordable`
- `\bcourses?\b` and `\bclass(es)?\b`
- `\b(teachers?|instructors?)\b`
- `sales call`
- `guarantee`
- `\bexact(ly)?\b`
- `\d+\s*points?\b` and `\bpoints?\s+(away|gain|higher|increase|more)\b`
- `\bcutoffs?\b`
- `real number`
- `readiness`
- `\b(behind|not ready|struggl\w*|weak|weakness(es)?|falling)\b`
- `\b(raise|boost|jump|increase|improve)\w*\b.{0,40}\bscores?\b` and `\bscores?\b.{0,40}\b(raise|boost|jump|increase|improve)\w*`
- `(practice|practicing)[^.]{0,30}in the (new|computer-adaptive) format`, `help you set (one|it) up`, `replicat`
- `\baced\b`, `ivy league`, `\bref=`, `\balways\b`
- `—`, `–` and `!` (quiz files only; see the conventions in section 2)

**Exceptions, as exact strings only:**
- the disclaimer sentence containing "not a guarantee"
- the schools-line sentence "Fall 2026 is the first computer-adaptive SHSAT, so past cutoffs are only a rough guide."

**Structural checks:**
- no takeaway body contains `diagnostic`
- each takeaway body matches `IvyPath|consultation` at most once
- no rendered string contains `{`

---

## 3. Results logic

### 3.1 Inputs

- `answers = { role, grade, targets[], prep, practice_test, worry }`, using the codes in 2.3.
- `today = todayNY()`: a `'YYYY-MM-DD'` string from `new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())`.
- `nowMinutesNY()`: the minutes after midnight in New York, used by 3.7.
- **Test hooks:** only Playwright sets these, through `addInitScript`. There is no URL parameter for them.
  - If `window.__IVP_QUIZ_TODAY` matches `^\d{4}-\d{2}-\d{2}$`, it replaces `today`.
  - If `window.__IVP_QUIZ_NOW_MIN` is an integer from 0 to 1439, it replaces the minutes.
- Dates are compared as strings.

**Constants**
- `REG_OPENS = '2026-10-06'`
- `REG_CLOSES = '2026-10-30'`
- `SCHOOL_DAY = '2026-11-18'`
- `AFTER_FROM = '2026-11-19'`
- `LAST_PREP_WEEK = '2026-11-09'`
- `TEST_WEEK = '2026-11-16'`
- `CONSENT_VERSION = 'quiz-2026-09-28'`, with `CONSENT_TEXT[version]` holding the exact gate wording

### 3.2 Band decision table

The first matching row wins. `bandFor(answers, today)` is total over the valid domain and throws on invalid codes. The controller never calls it with missing answers (2.7).

| # | role | grade | today | practice_test | prep | band |
|---|---|---|---|---|---|---|
| 1 | `student` | any | any | any | any | `null` (student exit, no gate) |
| 2 | `parent` | 8, 9 | ≥ `2026-11-19` | any | any | `after_test` |
| 3 | `parent` | 8, 9 | ≤ `2026-11-18` | `no`, `unsure` | any | `final_weeks_baseline` |
| 4 | `parent` | 8, 9 | ≤ `2026-11-18` | `once`, `multiple` | `none`, `self` | `final_weeks_focus` |
| 5 | `parent` | 8, 9 | ≤ `2026-11-18` | `once`, `multiple` | `group`, `tutor` | `final_weeks_sharpen` |
| 6 | `parent` | 7 | any | any | any | `full_year` |
| 7 | `parent` | 6 | any | any | any | `foundation` |
| 8 | `parent` | 5 | any | any | any | `early_start` |

`targets` and `worry` never change the band. The valid domain is 2 roles × 5 grades × 4 prep × 4 practice-test answers = 160 combinations. A unit test enumerates all of them at each test date.

### 3.3 Date lines

**`countdownLine(today)`** (the results eyebrow and the gate preview for `final_weeks_*`), with `days = (Date.UTC(2026,10,18) - Date.UTC(y,m-1,d)) / 86400000`:
- `days >= 14`: "About {Math.floor(days/7)} weeks to the school-day test"
- `1 <= days <= 13`: "Less than two weeks to the school-day test"
- `days == 0`: "The school-day test is today"

Examples:
- 2026-09-28 is 51 days out: "About 7 weeks".
- 2026-11-04 is 14 days out: "About 2 weeks".
- 2026-11-05 is 13 days out: "Less than two weeks".

**`introDateLine(today)`** follows the table in 2.2.

**`registrationLine(today)`** (gate preview):
- Before `REG_OPENS`: "Registration opens Tuesday, October 6 and closes Friday, October 30."
- Up to `REG_CLOSES`: "Registration closes Friday, October 30."
- After that: empty.

### 3.4 `weekPlan(answers, today)`

It returns `[]` unless the band is `final_weeks_*`. `mon(d)` is the Monday on or before `d`. `fmt(d)` gives a short month and day ("Oct 5"). Let `M = mon(today)`. Rows are built in this order:

1. **"This week"** (always):
   - `today >= TEST_WEEK`: "Light review, and plenty of sleep before Wednesday."
   - `M == LAST_PREP_WEEK`: "One last timed run early in the week, then light review."
   - `final_weeks_baseline`: "One timed, full-length practice test (100 questions in 180 minutes), then list the question types that were missed or took longest."
   - `final_weeks_focus`: "Go back through the practice test {who} took and list the question types that were missed or took longest."
   - `final_weeks_sharpen`: "One timed, full-length practice test at the new length, then review every missed question."
2. **Registration** (only if `today <= REG_CLOSES`):
   - Label: "Oct 6 to Oct 30" before `REG_OPENS`, otherwise "By Fri, Oct 30".
   - Text: "Register for the SHSAT. {Who's} school counselor can tell you how it works at their school."
3. **Middle weeks** (only if `M + 7 days <= '2026-11-02'`):
   - Label: "Week of Nov 2" when `M + 7 == '2026-11-02'`, otherwise "Weeks of {fmt(M + 7)} to Nov 2".
   - Text: "Most practice time on {FOCUS[worry]}, plus one timed section each week."
4. **"Week of Nov 9"** (only if `M < LAST_PREP_WEEK`): "One last timed run early in the week, then light review."
5. **"Test dates"** (always): "Wednesday, November 18 is the school-day test. Charter, private and homeschool students test on November 14, 15 or 21."

`FOCUS` values:
- `timing` → timed sets and pacing
- `math` → the math topics that take longest
- `ela` → longer reading passages and ELA questions
- `adaptive` → timed practice on a computer at the new length
- `consistency` → a fixed weekly schedule
- `where_stands` → the question types the practice test shows need the most time
- `process` → the question types that take longest

### 3.5 Takeaway selection

`takeawaysFor(answers, today)` returns `[{ id, title, body }]` with exactly 3 items, or `[]` for `after_test`.

| Slot | Rule (first match) | id |
|---|---|---|
| T1 | grade 8 or 9 and `today < REG_OPENS` | `T1_REG_SOON` |
| T1 | grade 8 or 9 and `REG_OPENS <= today <= REG_CLOSES` | `T1_REG_OPEN` |
| T1 | grade 8 or 9 and `today > REG_CLOSES` (and not `after_test`) | `T1_REG_CLOSED` |
| T1 | grade 7 / 6 / 5 | `T1_G7` / `T1_G6` / `T1_G5` |
| T1 add-on | grade 9 and `G9_NOTE` verified | append `T1_G9_NOTE` |
| T2 | grade 5 | `T2_HABITS` |
| T2 | practice_test `no` or `unsure` | `T2_BASELINE` |
| T2 | practice_test `once` or `multiple`, prep `none` or `self` | `T2_USE_TEST` |
| T2 | practice_test `once` or `multiple`, prep `group` or `tutor` | `T2_CHECK_FORMAT` |
| T3 | grade 5 (any worry) | `T3_EARLY` |
| T3 | `timing` / `math` / `ela` / `adaptive` / `consistency` / `where_stands` | `T3_TIMING` / `T3_MATH` / `T3_ELA` / `T3_ADAPTIVE` / `T3_CONSISTENCY` / `T3_WHERE` |
| T3 | `process` | `T3_PROCESS` if `T3_PROCESS_VERIFIED`, else `T3_PROCESS_BASIC` |

Titles are in 2.6.6. The tokens are substituted after selection. Draft 1's DIAG and NODIAG variants are gone, because no takeaway names the diagnostic.

### 3.6 Diagnostic availability

```
DIAG_GRADES = [6, 7, 8]  in Phase 1 (send-link's GRADE_RANGE.SHSAT)
In Phase 2: diagAvailable = response.diagnostic_link_allowed when lead_ref is set,
            else DIAG_GRADES.includes(grade)
```

| Grade | Diagnostic block |
|---|---|
| 5 | Never rendered. |
| 9, while not available | Shows the grade 9 line. |
| All others | Shows the form. It becomes the link variant when not captured, or when `ivp_quiz_handoff` has no email. |

### 3.7 Texting windows

```
TEXT_WINDOWS = [[480, 540], [720, 810], [1050, 1230]]   // minutes after midnight ET: 08:00-09:00, 12:00-13:30, 17:30-20:30
textWindowState(minutesNY) -> { inWindow, nextStartMin, nextDay, alertPhrase, parentPhrase }
```

| Now (ET) | `alertPhrase` (alert subject) | `parentPhrase` (2.6.4) |
|---|---|---|
| Inside a window | `text now` | `today` |
| Before 08:00 | `text at 8:00 AM` | `this morning` |
| Between windows | `text at 12:00 PM` or `text at 5:30 PM` | `later today` |
| After 20:30 | `text tomorrow 8:00 AM` | `tomorrow morning` |

- The table is Vicente's 2026-09-28 windows (07:00-09:00, 12:00-13:30, 17:30-20:30) with an 08:00 floor.
- If Vicente decides that parents who just asked to be contacted are exempt, the constant becomes `[[480, 1230]]` and nothing else changes.
- The platform alert (5.6 item D) uses a copy of the same table, checked by a test.

### 3.8 API

**`shsat-quiz-logic.js`** (UMD: `window.IVP_QUIZ` in the browser, `module.exports` in Node; no DOM access; safe to `require` in Node because it touches no browser global at load):

```
QUESTIONS, CODES, LABELS, SCHOOL_SHORT, WORRY_SHORT, FOCUS, BANDS, DATES, TEXT_WINDOWS, CONSENT_VERSION, CONSENT_TEXT
todayNY(now?: Date): string
nowMinutesNY(now?: Date): number
bandFor(answers, today): BandCode | null
bandCopy(band, today): { name, summary }
countdownLine(today): string
introDateLine(today): string
registrationLine(today): string
weekPlan(answers, today): Array<{ label, text }>
takeawaysFor(answers, today): Array<{ id, title, body }>
schoolsLine(targets, grade): string[]              // 1 or 2 sentences
textWindowState(minutesNY): { inWindow, nextStartMin, nextDay, alertPhrase, parentPhrase }
sanitizeName(raw, max): string                     // letters (\p{L}), spaces, - ' . ; collapses spaces; trims; max chars
normalizeUsMobile(raw): string | null              // E.164 or null (5.1)
formatUsPhone(e164): string                        // (917) 555-0142
isSchoolEmail(email): boolean                      // port of school-email-guard.js isSchoolAddress, edit distance included
validateQuizPayload(body): { ok: true, value } | { ok: false, field?, error }
```

**`api/_quiz-alert.js`** (server only):

```
WORRY_PHRASE, ASK_BY_BAND
smsDraft({ band, worry }): string                  // <= 320 chars
looksLikeTestLead({ parent_email, parent_name, phone }): boolean   // mirrors ops-diagnostic-alert.ts:176
deviceFromUA(ua): 'iPhone' | 'Android' | 'Mac' | 'Windows' | 'other'
buildAlertEmail(value, meta): { subject, html, text }
buildPlanEmail(answers, today): { subject, html, text }
```

### 3.9 Invariants (unit-tested)

- Every valid combination returns a band from `BANDS`, or `null` only when `role` is `student`.
- `takeawaysFor` returns 3 items for every band except `after_test`, which returns 0.
- `weekPlan` returns 2 to 5 rows for `final_weeks_*` bands and `[]` otherwise. Labels are unique, and the last row is "Test dates".
- No returned string contains `{`.
- Every string passes the lint in 2.11.
- `smsDraft` is at most 320 characters for every band and worry.
- `isSchoolEmail` agrees with `school-email-guard.js` on a shared list of addresses.

---

## 4. UX and UI

### 4.1 Layout

**Mobile first**
- Body: `--cream` background, `--ink` text, `--body` at 16 px, line height 1.6.
- Top bar: `min-height: 56px` (not `height`, so text spacing never clips), on a `--forest-deep` strip.
- `main.quiz-shell`: `max-width: 560px; margin: 0 auto; padding: 24px 16px 48px`. Results use `max-width: 720px`.
- A 320 px viewport never scrolls sideways:
  - long labels wrap
  - no element has a fixed width over 288 px
  - `overflow-wrap: anywhere` on `.plan-copy-status` and the diagnostic success message
- Below 640 px, `.btn-primary` is `width: 100%; padding: 16px 24px` (the `shsat-diagnostic.html:505` override).

**At 640 px and up**
- The shell padding becomes `32px 24px`, and cards get 32 px padding.
- Q3 options go to 2 columns, and so does `.proof-grid`.

**Screens**
- Intro content sits on cream. The H1 is Lora 600 at `clamp(28px, 6.5vw, 40px)`, line height 1.15.
- Questions and the gate sit in one white `.sendlink-card`: 12 px radius, 1 px `--line` border, padding 24 px (32 px from 640 px).
- **Only one screen is ever rendered.** Inactive screens carry the `hidden` attribute, so screen readers never read all six questions at once. The results markup stays `hidden` until it is rendered.

### 4.2 Tokens and classes

**Tokens.** Copy the `:root` block from `shsat-diagnostic.html:29-44` verbatim: `--sage`, `--sage-deep`, `--forest`, `--forest-deep`, `--gold`, `--gold-deep`, `--cream`, `--ink`, `--muted`, `--line`, `--white`, `--cream-on-dark`, `--display`, `--body`. Then add `--gold-label: #8F6B37` (the AA-on-cream label color from `consulting.html:34`).

**Copied from `shsat-diagnostic.html`:**
- `.top-bar`, `.wordmark`, `.top-phone`
- `.eyebrow` (color set to `--gold-label` on cream)
- `.btn-primary`: gold with `--forest-deep` text inside `.next-step`. On cream it gets `background: var(--sage); color: var(--white)` (4.9:1).
- `.btn-secondary`, `.reassurance`, `.proof-item`
- `.sendlink-card`, `.sendlink-label`, `.sendlink-optional`, `.sendlink-input`, `.sendlink-help`, `.sendlink-consent`, `.sendlink-submit`, `.sendlink-hp`
- `.disclaimer-section`, `.site-footer`
- `[hidden]`

**Changes to the copied rules** (these fix A3 and A4):
- Delete `outline: none` from the copied `.sendlink-input:focus`.
- `.disclaimer-section p, .site-footer p { color: rgba(253,248,240,0.7); font-size: 13px; }` gives 6.8:1 on `--forest-deep`, up from 3.73:1.
- `.site-footer a, .disclaimer-section a { color: var(--cream-on-dark); text-decoration: underline; }`
- `.fade-in` is **not** copied (4.7).

**Copied from `consulting.html:518-601`:**
- `.book-progress`
- `.q-title` (22 px; 24 px from 640 px) and `.q-hint` (14 px)
- `.choice-list`
- `.choice-chip`, changed to 16 px, `min-height: 52px`, padding `14px 16px`, **with the `.chip-key` letter badges removed**
- `.q-panel.q-anim` and `@keyframes qIn`, including the reduced-motion block
- The step label uses the `.cal-step-label` rule at **13 px** (was 11 px), color `--gold-label`.

**New and overriding rules**

| Selector | Style |
|---|---|
| `:focus-visible` (every interactive element) | `outline: 2px solid var(--sage-deep); outline-offset: 2px` |
| `.top-bar :focus-visible, .next-step :focus-visible, .disclaimer-section :focus-visible, .site-footer :focus-visible` | `outline-color: var(--cream)` (12.2:1 on `--forest-deep`) |
| `.sendlink-input:focus-visible` | `outline: 2px solid var(--sage-deep); outline-offset: 2px` |
| `.chip-radio` (single-select indicator, leading) | An 18 px circle with a 1.5 px `--muted` border (5.3:1). When selected, it holds an 8 px `--sage` dot. |
| `.chip-check` (multi-select indicator, leading) | An 18 px square, 1.5 px `--muted` border, 4 px radius. When selected: `--sage` fill with a white SVG check. |
| `.choice-chip[aria-pressed="true"]` | `border: 2px solid var(--sage); background: #EDF3EE` (padding reduced by 1 px so nothing shifts) |
| `@media (forced-colors: active)` | Selected chips get `border: 3px solid Highlight`. The indicators use `CanvasText` for the border and `Highlight` for the dot and check. |
| `.q-back` | `min-height: 44px; padding: 10px 12px 10px 0; font-size: 15px` |
| `.top-phone` | `display: inline-flex; align-items: center; min-height: 44px; padding: 0 4px` |
| `.text-btn` (Save or print, Show my plan anyway) | `min-height: 44px; font-size: 15px; text-decoration: underline; color: var(--sage-deep); background: none; border: 0` |
| `.quiz-alert` (the gate's single `role="alert"` summary) | Always rendered, never `hidden` and never a `display: none` class. `.quiz-alert:empty { padding: 0; border: 0; margin: 0 }`. The guard's `clearInline` sets inline `display: none`, so our handler sets `el.style.display = ''` before writing. |
| `.field-error` | 14 px, `#B3261E`, `margin-top: 6px`. **No `role`**: it is referenced only through `aria-describedby`. |
| `.plan-preview` | White, 1 px `--line` border, 12 px radius, 16 px padding |
| `.plan-note` | 14 px, `--muted`, `border-left: 2px solid var(--sage)`, `padding-left: 12px` |
| `.takeaway` | A `.proof-item` variant, numbered as in 2.6.6 |
| `.week-plan li` | A two-column grid from 640 px (label 180 px, text), stacked below that |
| `.next-step` | `background: var(--forest-deep); color: var(--cream-on-dark); border-radius: 12px; padding: 28px 24px` |
| `.proof-grid` | `display: grid; gap: 24px` (2 columns from 640 px) |
| `.sr-only` | The standard visually hidden utility |

**Forbidden:**
- `.gi` italic accent words
- `.trust-chips` and `.chip` pills
- `.school-chip .rank` circles
- drop shadows at rest
- gradients
- emoji

### 4.3 Question interaction

- Every option is a `<button type="button" class="choice-chip" aria-pressed="false|true" data-v="{code}">` with its leading indicator (`.chip-radio` or `.chip-check`, `aria-hidden="true"`).
- Options sit in `<div class="choice-list" role="group" aria-labelledby="qTitle" aria-describedby="{hint id}">`.
- **Activation:** only the native `click` event, with no `keydown` handler. Enter and Space already synthesize a click, so a keydown handler would advance twice.
- **Single-select** (Q1, Q2, Q4, Q5, Q6):
  - A click sets `aria-pressed="true"`, fires `quiz_question_answered`, and advances after 260 ms.
  - **Re-entry lock:** the first activation sets `advancing = true`, and every chip activation is ignored until the next screen has rendered.
  - Pointer clicks (`event.detail > 0`) that land within 300 ms of a render are ignored, so a double tap cannot answer the next screen.
  - The next step is computed from the **rendered** step (`go(renderedIndex + 1)`), never from a counter.
- **Multi-select** (Q3):
  - Each click toggles `aria-pressed` **in place**, with no re-render, no `qIn` replay and no focus move.
  - Continue validates, fires `quiz_question_answered` with the codes joined by `,`, and advances under the same lock.
- **Revisits:** a revisited question shows the saved answer as pressed. On a single-select screen, choosing the same answer again advances.
- **No letter keyboard shortcuts.** They collide with screen-reader quick keys.

### 4.4 Progress, history and resume

**Progress bar**
- `.book-progress` is `aria-hidden="true"`.
- Widths: intro 0%; Qn at `(n-1)/7`; the gate at 6/7. The bar is hidden on results.

**History: one entry for the whole quiz.** This removes the draft 1 back-button trap.
- **Start:** pressing "Start my plan" calls `history.pushState({ quiz: 1, step: 'q1' }, '')`, unless `history.state?.quiz === 1` already. The URL never changes, so GA4 sends no extra `page_view`. AC8 checks this in DebugView.
- **Step changes:** every later step change calls `history.replaceState({ quiz: 1, step }, '')`.
- **Browser Back before capture:** the browser pops to the landing entry, and `popstate` arrives with `state === null`. The controller then:
  - on the intro, does nothing (the next Back leaves the page)
  - on Q1, renders the intro and pushes nothing
  - otherwise, renders the previous step and calls `pushState({ quiz: 1, step: prev }, '')` again
- **At capture:** if `history.state?.quiz === 1`, set `collapsing = true` and call `history.back()`. On the `popstate` that follows, call `history.replaceState({ step: 'results' }, '')`, clear `collapsing` and render the results. If no `popstate` arrives within 500 ms, render the results and `replaceState` anyway. **One Back from the results leaves the page.**
- **Forward after capture:** `popstate` with any state renders the results. The gate is never shown again.

**Resume** (sessionStorage `ivp_quiz_v1`, 5.1). On load:
- A captured state under 24 hours old renders the results directly. No events fire again, and no email is sent again.
- An uncaptured state under 2 hours old resumes at its step.
- Otherwise the intro shows.

### 4.5 Focus, announcements and targets

- **First load of the intro:** focus is not moved.
- **Every step change and every resume:**
  - `window.scrollTo(0, 0)`, then focus the new screen's heading with `{ preventScroll: true }`: the `h2.q-title`, the gate H2 or the results H1, each with `tabindex="-1"`.
  - Update `document.title`, for example "Question 3 of 6 · SHSAT plan for parents", "Last step · SHSAT plan for parents", "Your plan · SHSAT plan for parents".
- **Question headings** contain `<span class="sr-only">Question N of 6: </span>` before the title. The visible step label is `aria-hidden="true"`, so the step is announced once.
- **Field errors:**
  - Focus moves to the first invalid field.
  - That field gets `aria-invalid="true"` and `aria-describedby="{error id} {help id}"`, error first.
- **Live regions:**
  - The gate summary is the form's single `role="alert"`.
  - `#quizStatus` (`aria-live="polite"`, `.sr-only`) announces "Saving your answers." and "School picks cleared."
  - The diagnostic success is announced once, through focus (2.6.7).
- **Controls that disappear or change:**
  - Diagnostic success replaces the form: focus the success message (`tabindex="-1"`).
  - Gate submit: `aria-disabled` plus an in-flight guard, never `disabled`, so focus stays on the button through "Saving…" and any error.
  - "Show my plan anyway" appearing: move focus to it.
  - book.html "Not you? Clear": focus `#leadName` after clearing.
- **Takeaways** are an `ol`, and the number span is followed by an `sr-only` ". ".
- **Tap targets:** every button and every link outside running text is at least 44×44 px. Choice chips are at least 52 px tall. The consent checkbox's 20×20 input sits in a label at least 44 px tall.
- **Tab order** follows the visual order. The results eyebrow sits after the H1 in the DOM (2.6.1).

### 4.6 Forms

**Gate**
- `<form id="gateForm" novalidate>` with a `submit` handler. **It must be a real form `submit`, not a button click**, so `school-email-guard.js` (capture-phase `submit`, `stopImmediatePropagation`) can block `@nycstudents.net` and its near misses before our handler runs.
- The form contains **exactly one** `[role="alert"]`: the `.quiz-alert` summary directly above the submit button. The guard writes into the first one it finds.
- Our handler validates with the logic functions, writes `ivp_quiz_handoff` (7.1), then posts (section 5).

**Diagnostic**
- `<form id="diagForm" novalidate>` with its own single `.quiz-alert[role=alert]`, and the student field `type="email"`, so the guard covers it.

**Rendering**
- All user text is rendered with `textContent`, never `innerHTML`.

### 4.7 Motion

- `qIn` (0.32 s) runs on question renders only (not on Q3 toggles).
- **Results content never starts at opacity 0**, so `.fade-in` is not used (PRODUCT.md: "Content must never be gated behind scroll-reveal animation"). If an entrance is wanted, use a one-shot keyframe that ends visible, turned off under reduced motion.
- Under `prefers-reduced-motion: reduce`: no `qIn`, no progress transition, no smooth scroll.

### 4.8 Performance and slow networks

**Budget.** The first load is at most 90 KB, not counting Google Fonts:
- HTML with inline CSS: about 30 KB
- logic.js: about 15 KB
- the controller: about 20 KB
- the logo: about 4 KB

No video or poster is requested. Images outside the intro (tutor photos, 606 images, texter photo) are `loading="lazy"` inside `hidden` screens, so they load only when shown.

**Measurement profile:** Lighthouse mobile (simulated Slow 4G: 150 ms RTT, 1.6 Mbps, 4x CPU slowdown).
- LCP under 2.5 s
- TBT under 200 ms
- CLS under 0.05 (the logo and every image have `width` and `height`)

**Early taps**
- The Start button is static HTML. A tap before the controller runs is recorded by the inline catcher (1.5) and replayed once `IVP_QUIZ_READY` is set.
- If the controller fails (script `onerror`, or no `IVP_QUIZ_READY` 8 s after `load`), an inline watchdog shows the `#fallback` block.

**Phase 2 preconnect.** When the gate renders, add `<link rel="preconnect" href="https://app.ivypathacademy.com" crossorigin>`.

### 4.9 Print

`@media print`:
- **Forced:** `* { opacity: 1 !important; transform: none !important; animation: none !important; }`, and `.next-step, .disclaimer-section, .site-footer { color: #000 !important; background: none !important; }`.
- **Hidden:** the top-bar phone, all forms and buttons, the trust images, and the diagnostic block.
- **Kept:**
  - the header
  - the schools line
  - week by week
  - the takeaways
  - the disclaimer
  - the line "Questions? Call or text (929) 394-0349."

---

## 5. Data contract

### 5.1 Client state

**sessionStorage `ivp_quiz_v1`** (every read and write wrapped in try/catch; no contact details):

```json
{ "v": 1, "quiz_id": "uuid-v4", "started_at": 1759060000000, "step": "q3",
  "answers": { "role": "parent", "grade": 8, "targets": ["stuyvesant"], "prep": "self", "practice_test": "no", "worry": "timing" },
  "band": "final_weeks_baseline", "captured": true, "captured_at": 1759060120000, "backend": "site",
  "lead_ref": null, "lead_ref_at": null, "diag_allowed": null, "plan_emailed": true, "hp": false,
  "fired": { "quiz_started": true, "quiz_lead_captured": true, "quiz_completed": true } }
```

- **`quiz_id`:**
  - Comes from `crypto.randomUUID()`. The fallback builds 16 bytes with `crypto.getRandomValues`, then sets the version and variant bits (`b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80`) and formats them 8-4-4-4-12.
  - The fallback's output is in the shared fixture, so zod's `.uuid()` is known to accept it.
  - It is created when "Start my plan" is tapped.
- **Expiry:**
  - uncaptured state: 2 hours after `started_at`
  - captured state: 24 hours after `captured_at`

**Normalization**
- **Phone** (`normalizeUsMobile`):
  - Strip every non-digit.
  - With 11 digits and a leading `1`, drop the `1`.
  - The result must match `^[2-9]\d{2}[2-9]\d{6}$`.
  - Reject any number made of one repeated digit.
  - Return `+1XXXXXXXXXX` or `null`. This is the platform's `usMobile` rule.
- **Parent name:** `sanitizeName`, 2 to 120 characters.
- **Emails:** trimmed and lowercased.

**PII rules**
- Name, email and phone never go into a URL, an analytics parameter, `dataLayer`, the console, or `ivp_quiz_v1`.
- They live only in `ivp_quiz_handoff` (7.1), in the POST bodies, and in the alert.

### 5.2 Shared gate payload

This is the POST body for both backends. `validateQuizPayload` enforces it on the site, and zod on the platform. `tests/fixtures/quiz-payload.json` holds valid and invalid examples that both sides must agree on.

```json
{
  "quiz_id": "3b1f0c9e-6a0e-4f2d-9d6b-2f4f7b0c1a11",
  "test_type": "SHSAT",
  "parent_name": "Sam Rivera",
  "parent_email": "sam.rivera@example.com",
  "phone": "+19175550142",
  "student_grade": 8,
  "consent": true,
  "consent_version": "quiz-2026-09-28",
  "quiz": {
    "version": 1,
    "role": "parent",
    "targets": ["stuyvesant", "bronx_science"],
    "prep": "self",
    "practice_test": "no",
    "worry": "timing",
    "band": "final_weeks_baseline"
  },
  "attribution": { "utm_source": "google", "utm_medium": "cpc", "utm_campaign": "…", "gclid": "…", "ivp_lp": "/shsat/quiz", "first_landing": "/shsat/quiz", "first_referrer": "google.com", "referrer": "https://www.google.com", "v": "parent" },
  "company_name": "",
  "delivery": "alert_and_copy"
}
```

- The body is at most 4 KB.
- `targets` holds 1 to 9 unique codes, and `not_sure` must be alone.
- `band` must be a valid band code. The server accepts it as reported: it is a UI fact, not a score.
- Every attribution value is a string (the builder guarantees it). The platform also tolerates other types (5.6 B).
- `delivery` is read only by the site function: `alert_and_copy`, `alert_only` or `copy_only`. The platform ignores it.
- `company_name` carries the honeypot value from the `ivp_hp_x` field.

### 5.3 Phase 1 (`QUIZ_BACKEND = 'site'`)

The client posts to `/api/quiz-lead` with a **15 s** `AbortController` timeout, and only one request is in flight at a time. `delivery` is `alert_and_copy` when `PLAN_COPY` is on, else `alert_only`.

#### 5.3.1 `api/quiz-lead.js` (new site function, CommonJS, same-origin)

**Methods**
- `GET` returns 200 `{ ok: true, resend_configured: Boolean(process.env.RESEND_API_KEY) }`. It never sends anything. This is the deploy-gate probe.
- `OPTIONS` returns 204 with no CORS headers.
- `POST` is handled below. Anything else returns 405.

**Origin.** If an `Origin` header is present, it must be one of these, or the function returns 403 `{ok:false}`:
- `https://www.ivypathacademy.com`
- `https://ivypathacademy.com`
- `https://*.vercel.app` (previews)
- `http://localhost:*` or `http://127.0.0.1:*`, **only** when `VERCEL_ENV` is unset or `development`

**POST checks, in order:**
1. A body over 4 KB returns 413.
2. `delivery` must be one of the three values. It defaults to `alert_and_copy`.
3. A `validateQuizPayload` failure returns 400 `{ok:false, field, error}`. The errors:
   - Name: "Please enter your name."
   - Phone: "Please enter a 10-digit US mobile number."
   - Email: "Please enter a valid email address."
   - School address (via `isSchoolEmail`, near misses included): "Please use a personal or parent email. We can't deliver to @nycstudents.net school accounts."
   - Consent or an unknown `consent_version`: "Please check the box so we can follow up."
   - Anything else: "Please check your entries and try again."
4. **Idempotency:**
   - An in-memory map keyed by `quiz_id + delivery` keeps successful responses for 1 hour (best effort, per warm instance).
   - A repeat returns the stored response, sends nothing, and does not count toward any limit.
   - Duplicates across cold starts are acceptable: both alerts carry the same `quiz_id`.
5. **Honeypot** (non-empty `company_name`):
   - For `alert_and_copy` or `alert_only`, send the alert with the `[HONEYPOT?] ` prefix and no plan copy, then return 200 `{ok:true, plan_emailed:false}`.
   - For `copy_only`, return 200 and send nothing.
6. **Rate limits** (in memory per warm instance; **counted only after a successful send**, so a Resend failure plus retries never locks a parent out):
   - Alerts: 5 per hour per IP (first `x-forwarded-for` entry) and 2 per day per E.164 number.
   - Plan copies: 2 per day per recipient email, and 5 per hour per IP.
   - Over a limit, the function returns 429 `{ok:false, error:'Too many tries in a short time. Please call or text (929) 394-0349.'}`.
7. **Missing `RESEND_API_KEY`:** return 503 `{ok:false, error:"We couldn't save that just now. Please try again."}` and log `quiz-lead: RESEND_API_KEY missing`. With `QUIZ_ALERT_DRY_RUN=1`, log the would-be send and return success without any network call.
8. **Attribution allowlist:** it matches the platform's `ATTRIBUTION_KEYS`: utm_*, fbclid, gclid, ref, referrer, ivp_lp, page, v, mc, mc_sub, first_landing, first_referrer, heard_from. Values must be strings; control characters are stripped and each value is cut to 300 characters. Other keys are dropped.
9. **Alert** (unless `copy_only`):
   - `buildAlertEmail` goes to `QUIZ_RESEND_URL` (default `https://api.resend.com/emails`) with a 5 s timeout.
   - Success means a 2xx **and** an `id` in the response body. Anything else returns 502 `{ok:false, error:"We couldn't save that just now. Please try again."}`, and no plan copy is sent.
10. **Plan copy** (for `alert_and_copy` after the alert succeeded, or `copy_only`):
    - `buildPlanEmail` is sent with a timeout of `min(4 s, 9 s minus the elapsed time)`, so the function stays inside its 10 s `maxDuration`.
    - A failure never fails the request.
    - The function returns 200 `{ok:true, plan_emailed: true|false}`.

**Logs:** one line per request, `quiz-lead {status} {quiz_id} delivery={d} backend={b}`, with no PII.

**Env**

| Variable | Status |
|---|---|
| `RESEND_API_KEY` | Required. Ben sets it for Production and Preview, from the Resend account where `noreply.ivypathacademy.com` is verified. |
| `QUIZ_ALERT_TO`, `QUIZ_ALERT_FROM`, `QUIZ_PLAN_FROM`, `QUIZ_REPLY_TO` | Optional overrides |
| `QUIZ_RESEND_URL`, `QUIZ_ALERT_DRY_RUN` | Tests and harness only |

**Not in Phase 1:** Turnstile, and any platform write.

#### 5.3.2 "Email the diagnostic link" in Phase 1

This path is also used in Phase 2 whenever `lead_ref` is null or has expired.

`POST https://app.ivypathacademy.com/api/funnel/send-link`

```json
{ "test_type": "SHSAT", "parent_email": "<from ivp_quiz_handoff>", "student_email": "<field or ''>",
  "student_grade": 8, "consent": true, "company_name": "", "attribution": { "...same builder...", "v": "parent" } }
```

- It only runs for grades where the diagnostic is available (3.6), and only when the handoff holds an email. Without one, the block shows the link variant instead of posting an empty email.
- `consent: true` carries over from the gate checkbox, which covers email about the plan.
- **On success** (`body.ok`): show the success copy with `body.sentTo`, and fire `diagnostic_link_sent`.
- **On error:** show `body.error` and the fallback link.

**Known Phase 1 gap.** This creates a platform lead (contact_role `parent`) without a phone number. If that family then finishes the diagnostic, the platform's scored-diagnostic alert says NO PHONE. Vicente has the number from the earlier quiz alert, which shares the same email. Phase 2 removes the gap.

### 5.4 Phase 2 (`QUIZ_BACKEND = 'platform'`)

**Gate**
- `POST https://app.ivypathacademy.com/api/funnel/quiz-lead` with the 5.2 body and a **15 s** timeout. The button reads "Still saving…" after 5 s.
- After a 200, and when `PLAN_COPY` is on, the client posts the same body to `/api/quiz-lead` with `delivery: 'copy_only'` and a 10 s timeout. It does not wait for that call before showing the results; the plan-copy status line updates when it returns.

**Fallback matrix (gate)**

| Platform result | Site action | Results state |
|---|---|---|
| 200 `{ok:true, lead_ref, diagnostic_link_allowed}` | `copy_only` POST | captured; `backend='platform'`; `lead_ref`, `lead_ref_at` and `diag_allowed` stored |
| 200 `{ok:true, lead_ref:null}` (honeypot) | none | captured; no conversion fired (the client knows `hp` was filled) |
| 400 with `field` in `parent_name`, `phone`, `parent_email` | show the field error; **no fallback** | stays on the gate |
| 429 | show the error and "Show my plan anyway"; **no fallback** | stays on the gate |
| Anything else: network `TypeError` (includes CORS), abort at 15 s, 5xx, 413, other 4xx, 400 without a known field | POST `/api/quiz-lead` with `delivery: alert_and_copy` (or `alert_only`), `attribution.v='parent'`, and a `fallback_reason: 'platform_<status or network>'` field | on 200: captured, `backend='site_fallback'`, `lead_ref=null`; on failure, the 2.7 flow. Fires `quiz_lead_failed {status, backend:'platform'}` either way. |

**Duplicates.** If the platform inserted the row but the response was lost, the fallback sends a second alert. Both alerts carry the same `quiz_id`. Acceptable.

**Results diagnostic button**
- If `lead_ref` is set and under 2 hours old: `POST https://app.ivypathacademy.com/api/funnel/quiz-lead/send-link` with `{ "lead_ref": "...", "student_email": "" | "x@y.com", "company_name": "" }`, returning `{ok, sentTo, toParent}`.
- If that returns the expired-token 400, or the token is already over 2 hours old, the client retries once through the 5.3.2 path without telling the parent.
- Otherwise: the 5.3.2 path.

### 5.5 Flags

Constants at the top of `shsat-quiz.js` (plus `TEXT_WINDOWS` in the logic file). Each flip is a one-line PR.

| Flag | Launch value | Changes when |
|---|---|---|
| `QUIZ_BACKEND` | `'site'` (or `'platform'` if the rollout inverts, D3) | `'platform'` after the Phase 2 smoke test (AC-P1 to AC-P8) passes on production |
| `PLAN_COPY` | `true` only after the deploy gate shows a plan copy arriving (9.1); otherwise `false` | |
| `DIAG_GRADES` | `[6,7,8]` | Phase 2 prefers `diagnostic_link_allowed`; add 9 only when the platform confirms item E |
| `SHOW_VSL` | `false` | D6 |
| `TEXT_FROM_NUMBER` | `null` | Vicente confirms the number his texts come from |
| `TEXTER` | `{ name: 'Vicente', role: null, photo: null }` | Vicente supplies the role and photo (a 9.1 prerequisite) |
| `ZH_TEXTS` | `false` | 2.10 |
| `G9_NOTE` | `null` | The sentence is verified on the DOE page |
| `T3_PROCESS_VERIFIED` | `false` | Every sentence of `T3_PROCESS` is verified on the DOE page |
| `TEXT_WINDOWS` (logic file) | three windows (3.7) | Vicente's exemption decision |
| `PLATFORM_BASE` | `https://app.ivypathacademy.com` | |
| `PLATFORM_TIMEOUT_MS`, `SITE_TIMEOUT_MS` | `15000`, `15000` | |

The E2E tests override flags through a `window.__IVP_QUIZ_FLAGS` init script.

### 5.6 Platform ask (exact; for the platform session)

This supersedes draft 1 and the recon draft wherever they differ. Paths are relative to the platform repo.

**A. Migration** `supabase/migrations/00112_leads_quiz_answers.sql`. The number is free on main, base-0927 and all worktrees. Apply it before the deploy that writes the columns.

```sql
alter table public.leads add column if not exists quiz_answers jsonb
  check (quiz_answers is null or (jsonb_typeof(quiz_answers) = 'object' and pg_column_size(quiz_answers) <= 2048));
alter table public.leads add column if not exists sms_opted_out_at timestamptz;
create unique index if not exists leads_shsat_quiz_id_uidx
  on public.leads ((quiz_answers->>'quiz_id')) where source = 'shsat_quiz';
comment on column public.leads.quiz_answers is 'Self-reported SHSAT plan answers (source shsat_quiz). A plan input, not a score.';
comment on column public.leads.sms_opted_out_at is 'Set when the family replies STOP to a text. No text may be sent after this.';
```

**B. Schemas** in `src/lib/funnel-schemas.ts`. Enums, not free regex, so the answers match the site's codes exactly. The limits match the site's.

```ts
import { toE164 } from '@/lib/sms'
export const QUIZ_TARGETS = ['stuyvesant','bronx_science','brooklyn_tech','brooklyn_latin','staten_island_tech','queens_science_york','american_studies_lehman','hsmse_ccny','not_sure'] as const
export const QUIZ_WORRIES = ['timing','math','ela','adaptive','consistency','where_stands','process'] as const
export const QUIZ_BANDS = ['final_weeks_baseline','final_weeks_focus','final_weeks_sharpen','full_year','foundation','early_start','after_test'] as const
export const shsatQuizAnswersSchema = z.object({
  version: z.literal(1),
  role: z.literal('parent'),
  targets: z.array(z.enum(QUIZ_TARGETS)).min(1).max(9)
    .refine((t) => new Set(t).size === t.length && (!t.includes('not_sure') || t.length === 1)),
  prep: z.enum(['none','self','group','tutor']),
  practice_test: z.enum(['no','once','multiple','unsure']),
  worry: z.enum(QUIZ_WORRIES),
  band: z.enum(QUIZ_BANDS),
}).strict()
const usMobile = z.string().trim().max(40)
  .refine((v) => /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(toE164(v) ?? '') && !/^\+1(\d)\1{9}$/.test(toE164(v) ?? ''), 'US mobile')
export const shsatQuizLeadSchema = z.object({
  quiz_id: z.string().uuid(),
  test_type: z.literal('SHSAT'),
  parent_name: z.string().trim().min(2).max(120),
  parent_email: z.string().trim().email().max(200),
  phone: usMobile,
  student_grade: z.coerce.number().int().min(5).max(9),   // 5 = "5th or younger" -> stored null
  consent: z.literal(true),
  consent_version: z.string().regex(/^quiz-\d{4}-\d{2}-\d{2}$/),
  quiz: shsatQuizAnswersSchema,
  attribution: z.record(z.string(), z.unknown()).optional(),   // sanitizeAttribution drops non-strings
  turnstile_token: z.string().max(4096).optional(),
  company_name: z.string().max(200).optional(),
})
export const shsatQuizFollowupSchema = z.object({
  lead_ref: z.string().min(10).max(2048),
  student_email: z.union([z.string().trim().email().max(200), z.literal('')]).optional(),
  company_name: z.string().max(200).optional(),
})
```

There is no `student_first_name`: the quiz does not collect it (D13).

**C1. Route `src/app/api/funnel/quiz-lead/route.ts`**
- Copy these from `send-link/route.ts`: the CORS block (production origins only, `Vary: Origin`, OPTIONS 204), the honeypot, optional Turnstile, 400 and 429 handling, and IP extraction.
- Responses:
  - 400: `{ ok:false, error:'Please check your entries and try again.', field? }`. Map a zod path of `phone`, `parent_email` or `parent_name` to `field`, and use no `field` for anything else. The site falls back on those (D4).
  - 200: `{ ok:true, lead_ref, diagnostic_link_allowed }`.

**C2. Core `src/lib/shsat-quiz-lead.ts`** (not a `'use server'` file). Steps, in order:
1. Refuse school emails (`SCHOOL_EMAIL_ERROR`).
2. Rate limits, most specific first:
   - `quiz-lead:phone:<e164>:day` 2
   - `email:<parent>:day` 3 (shared)
   - `quiz-lead:ip:<ip>:hour` 5
   - `quiz-lead:ip:<ip>:day` 15
3. `attribution = sanitizeAttribution({ ...raw, v: 'parent' })`. The **site's `v` wins**, because it is the parent's own Q1 answer.
4. Insert the lead:
   - `source 'shsat_quiz'` and `...leadContactColumns(email, attribution)` (which gives `parent`)
   - `parent_name` (control characters stripped) and `phone` as E.164
   - `student_grade`: the grade if it is 6 or higher, else null
   - `consent_at`, `ip_inet`, `user_agent`, `attribution`
   - `quiz_answers = { ...quiz, quiz_id, grade: student_grade, consent_version, contact_role_basis: 'self_declared' }`
   - `admin_notes`, a one-line summary. Example: `SHSAT plan 2026-09-28 (self-declared parent): grade 8 · targets stuyvesant, bronx_science · prep self · practice test no · worry timing · plan final_weeks_baseline · consent quiz-2026-09-28`
   - **Idempotency:** on a unique violation (`23505`) of `leads_shsat_quiz_id_uidx`, select the existing row and return a fresh `lead_ref` for it. Do not alert again. This is race-safe, unlike a check before the insert.
5. Log `activity_log` `funnel_quiz_lead_created` with the answers.
6. `after(() => sendOpsQuizLeadAlert(admin, leadId))`.
7. Return `lead_ref` (C3) and `diagnostic_link_allowed`: true when `student_grade` is a platform-supported SHSAT diagnostic grade (6 to 8 until E is confirmed).
8. **No Meta CAPI event.**

**C3. Token.** Add the purpose `'quiz_followup'` to `FunnelLinkPurpose` in `src/lib/funnel-link-token.ts`, bound to `lead_id`, with a 2-hour TTL.

**C4. Route `src/app/api/funnel/quiz-lead/send-link/route.ts`.** Same CORS. Steps:
1. Parse `shsatQuizFollowupSchema`.
2. Check the honeypot.
3. Verify the token. An invalid or expired token returns 400 `{ ok:false, error:'expired', field:'lead_ref' }`. The site handles it silently (5.4).
4. Load the lead. It must be `source='shsat_quiz'` with a grade the diagnostic supports.
5. Refuse a school `student_email`.
6. Rate limits: `send-link:to:<recipient>:day` 2, `email:<parent>:day` 3, `send-link:marketing:ip:<ip>:hour` 3 and `:day` 8.
7. `sendFunnelStartLink({ to, leadId, testType:'SHSAT', toParent: !student_email })` for **this** lead.
8. Log `funnel_quiz_link_sent`.
9. Return `{ ok, sentTo, toParent }`.

**D. Alert changes in `src/lib/ops-diagnostic-alert.ts`**
- Add a `'quiz'` `AlertKind`, with entity `quiz:<leadId>` and type `ops_diagnostic_alert`.
- `gatherQuizAlertFacts` returns null unless `source === 'shsat_quiz'`.
- `quizOpeningText` is the **exact 2.8 template** (per-band ask and STOP line), passed through `sanitizeSms(brandScrub(...))`. It is fixed text with no model call.
- `buildQuizAlertEmail` uses the 2.8 layout. That includes:
  - the texting window line, computed from a copy of `TEXT_WINDOWS`
  - "self-declared parent"
  - the consent record
  - a loud warning if `contact_role !== 'parent'`
  - a loud "OPTED OUT OF TEXTS on {date}. Do not text." when `sms_opted_out_at` is set
- `sendOpsQuizLeadAlert` claims, sends through Resend directly (not `send.ts`) from `FROM`, and releases the claim on failure.
- **Test leads:** for the quiz kind, `looksLikeTestLead` does **not** suppress the alert. It adds a `[TEST?] ` subject prefix instead, because unanchored substring matching would drop real parents.
- `sweepUnalertedAttempts` also picks up `shsat_quiz` leads created between 2 minutes and 48 hours ago that have no `quiz:` claim.

**E. Grade 9 end to end.** Confirm, or make true, the following for a `shsat_quiz` lead with `student_grade = 9`:
- The resume link creates a SHSAT attempt.
- The post-test profile step (`leadProfileSchema` in `completeLeadProfile`) accepts grade 9.

Until then, `diagnostic_link_allowed` is `false` for grade 9. Do not widen `GRADE_RANGE` generally: the in-app dropdown and two tests depend on it, and the SAT freeze applies.

**F. Post-test profile step and results email.**
- For a lead that already has `parent_name` and `phone`, prefill them or skip the step. Never overwrite them with blanks.
- Confirm that the resume-link results email goes to `leads.parent_email`, which is what the quiz's "the report is emailed to you" copy promises (AC6).

**G. Reporting.**
- `src/actions/funnel-analytics.ts` reports `shsat_quiz` leads separately.
- The daily Discord digest shows "Quiz leads: n" and "Quiz texts opted out: n".

**H. Tests to add.** Copy `tests/fixtures/quiz-payload.json` from the site repo. Every fixture marked valid must parse, including the output of the UUID fallback.
- `api/funnel/quiz-lead/__tests__/route.test.ts`:
  - CORS allowed and refused; OPTIONS 204
  - honeypot, consent false, `test_type: 'SAT'` rejected, bad `consent_version`
  - fake phones (`1234567890`, `2222222222`, 9 digits)
  - an unknown target code, `not_sure` combined with a school, an extra key in `quiz` (strict)
  - `field` present only for the three fields
  - a non-string attribution value accepted and dropped
  - Turnstile, 429
- `lib/__tests__/shsat-quiz-lead.test.ts`:
  - the inserted row: `shsat_quiz`, `parent`, E.164, grade 5 stored as null and 9 kept, `quiz_answers` including `quiz_id` and `consent_version`, `admin_notes`
  - the unique-violation path returns the existing lead with no second alert
  - a school email refused with nothing inserted
  - no link sent at creation
- `quiz-lead/send-link` tests: a bad or expired token, the wrong source, the link sent with the same `leadId`, the rate limit.
- `ops-diagnostic-alert.test.ts`:
  - `quizOpeningText` is at most 320 characters for every band and worry, brand-clean, and ends with the STOP line
  - the email has `sms:` and `tel:`, the window line, the consent record, the role warning and the opt-out warning
  - `[TEST?]` is a prefix, not a suppression
  - the sweep includes quiz leads
  - the `TEXT_WINDOWS` copy equals the site's

**I. Do not change:** `/api/funnel/send-link`, `sendStartLinkForLead`, `GRADE_RANGE`, SAT paths (`GATE_EXPERIMENT_LIVE`), or CORS origins. QA runs on production with `?notrack=1`.

**J. Order:** migration, then deploy, then the platform smoke test (AC-P1 to AC-P8), then tell the site session to flip `QUIZ_BACKEND`.

**K. CutoffLadder caveat.** On the SHSAT diagnostic results page, the "Where this falls vs. specialized HS cutoffs" block gains one line: "Cutoffs shown are from past years. Fall 2026 is the first computer-adaptive SHSAT, with scoring that weights question difficulty, so treat them as a rough guide." Without it, the funnel contradicts the quiz one click later.

**L. No automated text to a quiz family.**
- Add `assertSmsAllowed(lead)` in `src/lib/sms/index.ts`. It refuses `source === 'shsat_quiz'` and any lead with `sms_opted_out_at`.
- Call it from every `sendSms` caller. Today the only caller is `src/lib/mock-exam-completion.ts`.
- Add a test that a `shsat_quiz` lead is refused even when `smsConfigured()` is true.

**M. Side issue, report only.** `src/actions/funnel-leads.ts:178` and `:357`, and `src/actions/referrals.ts:34`, send from `noreply@ivypathacademy.com`, which the production Resend account has not verified. The "New diagnostic lead" ops emails are probably failing silently, because the SDK returns `{error}` and does not throw. The site's booking confirmation uses the same sender and never checks the response.

### 5.7 Texting guards, opt-out, and privacy.html

#### 5.7.1 Guards (growth session; must be live before any ad points at the quiz)

- **`~/muse-inbox/tools/can_contact.py`:**
  - Add `source,attribution,sms_opted_out_at` to both `leads` selects.
  - Return **BLOCKED** with the reason "SHSAT plan family: Vicente texts them himself" when any related lead has `source = 'shsat_quiz'` or `attribution->>'ivp_lp' = '/shsat/quiz'`. The second condition covers Phase 1 families whose only row came from the diagnostic send-link.
  - Return **BLOCKED** with "opted out of texts" when `sms_opted_out_at` is set, or when the phone appears in `suppressed.txt`. That file then accepts E.164 phone lines as well as emails.
- **Outreach sender** (`~/.ivypath-agent/outreach`): exclude the same leads from every automated segment, SAT promotions and SHSAT alike. Vicente handles these families personally, and the consent covers only messages about the student's SHSAT plan.
- **Muse:** never write quiz alert content or quiz PII into `~/muse-inbox`. Use masked lead IDs only (`can_contact.py` already prints masked output).
- **Platform:** item L.
- **Record:** add the rule to `growth/operations/decisions.md`: quiz families are texted only by Vicente, by hand; any automated texting needs new consent wording and a new `consent_version`.

**Phase 1 limitation.** A quiz family that never asks for the diagnostic link has no platform row, so `can_contact.py` cannot see it. Its number exists only in the alert emails, which never go to the Muse inbox. Phase 2 closes this.

#### 5.7.2 Opt-out procedure (Vicente)

When a parent replies STOP, "stop", "unsubscribe", or anything meaning "don't text me":
1. Send the one confirmation from 2.8 and nothing more.
2. Add the E.164 number to `~/.ivypath-agent/outreach/suppressed.txt` with a comment, for example `+19175550142  # sms-stop 2026-10-01 quiz`.
3. In Phase 2, also set `leads.sms_opted_out_at = now()` on the quiz lead (SQL or a later admin button). The alert and `can_contact.py` show it.
4. Count it for the metrics (9.2).

Email opt-outs stay separate, and are handled as today.

#### 5.7.3 `privacy.html` (same site PR, shipped before the ads switch)

Add after "Analytics and advertising":

> **Text messages.** If you give us your mobile number and agree to be contacted, a person at IvyPath, not an automated system, may text you about your student's SHSAT plan. Expect only a few messages. Reply STOP at any time and we won't text you again. You can also email info@ivypathacademy.com or call (929) 394-0349. Message and data rates may apply. We never sell mobile numbers or share them with anyone for their own marketing.

- Add to "Retention and your choices": "This includes SHSAT plan answers and the texts we've exchanged."
- Set "Last updated" to the merge date.

---

## 6. Attribution and analytics

### 6.1 Attribution builder (`quizAttribution()` in `shsat-quiz.js`)

This is the /shsat builder (`shsat-diagnostic.html:1108-1126`), with these differences:

```
KEYS = utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid, ref
out[k] = current URL param, else window.ivpAttribution()[k]      (strings only)
out.ivp_lp = '/shsat/quiz'                          // constant; the head script already normalized the path
out.referrer = document.referrer origin only (if any)
out.first_landing, out.first_referrer from ivpAttribution()
out.v = 'parent'                                    // from the Q1 answer
```

- `ref` is forwarded **only** when it arrived on the incoming URL or in session attribution. It is someone else's referral code, passed through untouched.
- The quiz never creates `ref`, and never appends `?ref=` or any other attribution to its own links.
- `/book.html` and `/cn-book.html` are linked bare. book.html reads `ivpAttribution()` from same-tab sessionStorage.
- Student share links use `utm_*` only.
- Answers never go into attribution.
- `wbraid` and `gbraid` are not sent to the platform, because its `ATTRIBUTION_KEYS` would drop them. The booking API keeps them.
- **App links:** every app link on the page (the exit diagnostic button, "Or start it here yourself", the link variant) is **static markup present at load**, so the tracking.js decorators add gclid, utm and `ivp_lp`. The controller never creates app links. It only shows, hides, or (on the student exit, 2.4) resets them.

### 6.2 Events and minor mode

**The `track()` helper**
- It returns immediately if `window.__ivpNoTrack === 1` or the `ivp_notrack=1` cookie is set.
- It wraps every call in try/catch.
- **GA4 only.** gtag sends an event with no `send_to` to every configured tag, the Google Ads tag `AW-18428932469` included, where it becomes a remarketing event. Every quiz event is therefore sent as `gtag('event', name, { send_to: <GA4 id>, …params })`, with the id that tracking.js publishes as `window.ivpGa4Id`. When no GA4 id is configured, nothing is sent. This keeps the answers, and the grade and band on `quiz_gate_viewed`, `quiz_lead_captured` and `quiz_completed`, out of Google Ads for every visitor, parent or student.
- Events marked "once" fire at most once per `quiz_id` (the `fired` map).
- No parameter ever holds PII.

| Moment | GA4 (`gtag('event', …)`) | Meta | Google Ads | Once? |
|---|---|---|---|---|
| Page load | automatic `page_view` | `PageView` + `ViewContent {content_name:'SHSAT Plan Landing'}` (inline head) | page tag only | per load |
| Tap "Start my plan" | `quiz_started {quiz:'shsat_plan', quiz_version:1}` | `trackCustom('QuizStarted')` | none | yes |
| Each answer | `quiz_question_answered {question_id, question_index, answer}`; `answer` is codes, comma-joined for Q3, at most 100 characters | none | none | once per question per `quiz_id` |
| Q1 = student | minor mode **on the tap**, synchronously, before the answer event is pushed (so the answer goes out with ad consent already denied, and a Back inside the 260 ms advance cannot skip it); then `quiz_student_exit {}` when the exit renders, which enters minor mode again after a reload | none (revoked) | none | yes |
| Gate rendered | `quiz_gate_viewed {grade}` | none | none | yes |
| Save failed | `quiz_lead_failed {status, backend, attempt}` | none | none | per failure |
| Captured (site, platform or fallback) | `quiz_lead_captured {grade, band, backend}`, **a GA4 key event** | `trackCustom('QuizLead')` with **no parameters** (the band reveals grade, and grade 5 or younger means under 13) | `window.ivypathTrackQuizLead(quiz_id)` | yes; **not fired when the honeypot was filled** |
| Results rendered | `quiz_completed {band, grade, captured}` | none | none | yes |
| "Book a free 15-minute consultation" | `consultation_clicked {source:'shsat_quiz', band}`; tracking.js also fires `cta_click {cta_type:'consultation'}` | none | none | per click |
| Diagnostic link sent (`ok`) | `diagnostic_link_sent {exam:'SHSAT', source:'shsat_quiz'}` | `trackCustom('DiagnosticLinkSent', {content_name:'SHSAT Diagnostic Link Sent'})` | none | per send |
| `.js-diagnostic-cta` click | `diagnostic_cta_click {exam:'SHSAT', source:'shsat_quiz', placement}` (the handler is inline on /shsat, so the quiz controller carries its own) | `trackCustom('DiagnosticCTAClick')`, skipped in minor mode | none | per click |
| "Or text us yourself" | `quiz_sms_fallback_clicked {}` (tracking.js also fires `cta_click {cta_type:'sms'}`) | none | none | per click |
| `tel:` tap | automatic `phone_click` | automatic `PhoneClick` (skipped in minor mode) | automatic Click-to-call conversion (skipped in minor mode) | per click |
| Student share | `quiz_share {method:'share'/'copy'/'manual'}` | none | none | per click |
| Save or print | `quiz_plan_saved {band}` | none | none | per click |
| VSL play (when on) | `quiz_vsl_play {}` | none | none | yes |
| /shsat hero link | `cta_click {cta_type:'quiz'}` through the new `ctaKind` branch | none | none | per click |

**Muse's event names map as follows:**
- `quiz_started`, `quiz_question_answered`, `quiz_lead_captured`, `quiz_completed` and `consultation_clicked`: kept.
- `diagnostic_sent`: becomes the existing `diagnostic_link_sent`, with `source` telling the quiz and /shsat apart.

**tracking.js changes**
- **Quiz kind:** in `ctaKind()`, before the `book.html` check, add `if (h.indexOf('/shsat/quiz') > -1) return 'quiz';`
- **`ivypathTrackQuizLead`:** the 6.3 helper, which also returns early when `ADS_OFF` is set.
- **Minor mode:**
  - At load: `var ADS_OFF = false; try { ADS_OFF = sessionStorage.getItem('ivp_minor') === '1'; } catch (e) {}`. When it is set, call `gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'})` **before** the `gtag('config', …)` calls, and call `fbq('consent','revoke')` if `fbq` exists.
  - Add `window.ivpMinorMode = function () { ADS_OFF = true; try { sessionStorage.setItem('ivp_minor','1'); } catch (e) {} try { gtag('consent','update',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'}); } catch (e) {} try { if (hasFbq()) window.fbq('consent','revoke'); } catch (e) {} };`
  - `ivypathTrackLead`, `ivypathTrackBooking`, `ivypathTrackPurchase`, `ivypathTrackQuizLead`, the phone-click Ads conversion and `PhoneClick` all skip their Ads and Meta calls when `ADS_OFF`. GA4 analytics events continue, and when `ADS_OFF` they are sent with `send_to` set to the GA4 id (`ga4Event()`), so `generate_lead`, `schedule`, `purchase`, `cta_click` and `phone_click` never reach the Ads tag either. Outside minor mode these calls are unchanged.
  - `window.ivpGa4Id` publishes `CFG.ga4Id` (empty when not configured) for the quiz's GA4-only events.
  - **Limitation:** other pages' inline Pixel snippets fire `PageView` before tracking.js runs. The quiz page's own snippet checks the flag (1.5). Counsel decides whether that is enough, and whether `analytics_storage` should also be denied (section 10).

Every call happens after a user action, apart from the inline head events. Nothing fires at parse time.

### 6.3 Google Ads conversion (Vicente, in the Ads UI; saving needs his re-auth)

1. **Goals → Conversions → New → Website → Add manually with code.**
   - Name "SHSAT quiz lead"
   - Category **Submit lead form**
   - Value: don't use a value
   - Count: **One**
   - Click-through window 30 days
   - Attribution: data-driven (default)
2. Copy the label into `tracking.js` as `CFG.labels.quizLead = '<label>'`.
3. Add the helper:

   ```js
   window.ivypathTrackQuizLead = function (quizId) {
     if (SUPPRESS || ADS_OFF) return;
     try {
       if (configured(CFG.googleAdsId) && configured(CFG.labels.quizLead))
         gtag('event', 'conversion', { send_to: sendTo(CFG.labels.quizLead), transaction_id: String(quizId || '') });
     } catch (e) {}
   };
   ```

   Until the label is pasted, the `XXXX` placeholder keeps the helper inert (the existing `configured()` behavior).
4. Set the action as **Primary**.
5. **Right after saving, confirm the campaign bid strategy is still Maximize clicks with its existing CPC cap.** Do not accept a "Maximize conversions" suggestion. The conversion wizard switched it silently once before (`growth/ads/tracking.md`).
6. Leave these untouched:
   - "Submit lead form" (page load, `thank-you.html`)
   - "SAT/SHSAT diagnostic completed" (app `/results/` URLs)
   - "Phone call lead" ×2
7. If GA4 is linked to this Ads account, do **not** import `quiz_lead_captured` as a conversion. It would count every lead twice.

**Enhanced conversions** (hashed email and phone): off in v1 (section 10).

### 6.4 Meta

- The quiz does **not** fire the standard `Lead`. By site convention, `Lead` is reserved for a diagnostic that actually starts in the app, and for book.html's contact step.
- If a parent books from the quiz, book.html fires `Lead` there as it does today.
- If Meta ads are ever pointed at the quiz, create a Custom Conversion on the `QuizLead` custom event in Events Manager. No code change is needed.

### 6.5 GA4 admin and tag settings (Vicente, before launch)

- Mark `quiz_lead_captured` as a key event.
- Register event-scoped custom dimensions `band`, `question_id`, `question_index`, `answer`, `source`, `backend`, `captured`, `status`.
- **Meta Events Manager, dataset 1550873539731081:** confirm that **Automatic Advanced Matching is off**. Otherwise the Pixel reads form fields and sends hashed email, phone and name with events.
- **Meta Events Manager, same dataset:** confirm that **Automatic events** ("Track events automatically without code") is **off**. The page also sets `fbq('set','autoConfig',false,…)` before `init` (1.5), but that call covers only this page.
- **Google tag settings:** confirm that **automatic detection of user-provided data is off**.
- **Manual check (AC11):** fill and submit the gate on the preview with the real tags loaded (no `?notrack`). Confirm that no `facebook.com/tr` request carries `ud[...]` parameters and that no Google collect request carries `em`, `ph` or `fn` user data. While answering Q1 to Q6, confirm that no `facebook.com/tr` request has `ev=SubscribedButtonClick`, and that no `googleads.g.doubleclick.net`, `googleadservices.com` or `google.com/pagead` request carries a quiz event name.
- **DebugView:** confirm that the quiz's `pushState` and `replaceState` calls send no extra `page_view` under enhanced measurement's history-change setting.

### 6.6 Explicitly unchanged

- `thank-you.html` and its URL conversion
- the app results URLs
- the /shsat send-link events
- the tracking.js phone conversion and link decorators, which only gain the `ADS_OFF` guard
- the notrack behavior

---

## 7. Booking handoff

**Goal:** the tutor on the consultation sees the answers, and the parent does not retype their details.

### 7.1 Quiz side

Write sessionStorage `ivp_quiz_handoff` as soon as the gate passes client validation, **before** the POST. That way a parent who ends at "Show my plan anyway" still gets the prefill. After capture, update it with `captured: true`.

```json
{ "v": 1, "quiz_id": "…", "saved_at": 1759060000000, "captured": false,
  "name": "Sam Rivera", "email": "sam.rivera@example.com", "phone": "+19175550142",
  "grade": 8, "targets": ["stuyvesant","bronx_science"], "prep": "self", "practice_test": "no", "worry": "timing", "band": "final_weeks_baseline" }
```

- It stays in the same tab and origin, and never goes into a URL. This follows the precedent of book.html keeping `ivp_booked_email` in sessionStorage.
- The consultation button is a plain `/book.html` link.

### 7.2 `book.html` changes

1. **A new, separate `<script>` block**, placed before the booking IIFE (`book.html:414-806`), with its own try/catch. A failure here can never break the calendar widget.
   - On `DOMContentLoaded`, read `ivp_quiz_handoff`. If it parses and `Date.now() - saved_at < 24h`:
     - Prefill `#leadName`, `#leadEmail` and `#leadPhone`, but only fields that are empty. The phone is formatted by a 3-line inline E.164 to `(xxx) xxx-xxxx` formatter (book.html does not load the logic file).
     - Change `.book-hero-subtitle` to "A free 15-minute call about your student's SHSAT plan, with a tutor who went to Stuyvesant."
     - Hide the SAT 1370 to 1500 outcome card (the container of the `parent-text-1370…` image; PR #45 renames it to `parent-text-1370-to-1500.jpg`, so match on the `parent-text-1370` prefix), so the Stuyvesant card leads.
     - Insert above the form: `<p class="form-hint" id="quizHandoffNote">We'll bring your SHSAT plan answers to the consultation. <button type="button" id="quizHandoffClear" class="link-button">Not you? Clear</button></p>`
   - "Clear" empties the three fields, removes the key and the note, restores the subtitle and the SAT card, and **moves focus to `#leadName`**.
   - Expose `window.__ivpQuizHandoff = function () { return valid ? { version: 1, quiz_id, grade, targets, prep, practice_test, worry, band } : null; }`.
2. **Line 200 hint:** change "Mobile, so we can text your Meet link and a reminder." to "**Mobile, so we can reach you if anything changes.**" (D9).
3. **POST at line 687** (inside the IIFE, one guarded line): `let quiz = null; try { quiz = typeof window.__ivpQuizHandoff === 'function' ? window.__ivpQuizHandoff() : null; } catch (e) {}`. Add `quiz` to the body when it is non-null.
4. **On booking success:** `sessionStorage.removeItem('ivp_quiz_handoff')`, before the redirect to `thank-you.html`. The redirect URL is unchanged, so the URL-based booking conversion still counts.
5. **`book.css`:** add `.link-button { min-height: 44px; padding: 10px 4px; font: inherit; font-size: 15px; text-decoration: underline; color: var(--sage-deep, #3A6347); background: none; border: 0; cursor: pointer; }` and a visible `:focus-visible` outline.
6. **`cn-book.html`:** gets the same changes only when `ZH_TEXTS` is turned on (2.10).

### 7.3 `api/book-consultation.js` changes

1. **Guarded lazy require.** No top-level require is added. Inside the default-type branch only:

   ```js
   let quizBlock = null, quizPrivate = null;
   if (!isConsulting && body.quiz && typeof body.quiz === 'object') {
     try {
       const Q = require('../shsat-quiz-logic.js');
       ({ quizBlock, quizPrivate } = buildQuizBooking(Q, body.quiz));   // local helper, below
     } catch (e) { quizBlock = null; quizPrivate = null; }
   }
   ```

   - A missing file, a syntax error or a browser-only global therefore can never turn a booking into a 500.
   - The static string lets Vercel's file trace include the file.
   - `buildQuizBooking` validates every code against `Q.CODES`, requires `quiz_id` to be a UUID, and drops anything invalid. A booking never fails over quiz data.
2. **Description** (default type). Append:

   ```
   SHSAT PLAN (the parent's own answers, not a score):
   - Grade: 8th grade
   - Aiming for: Stuyvesant, Bronx Science
   - Prep now: Practicing on their own (books or free sites)
   - Timed practice test: Not yet
   - Biggest worry: Finishing all 100 questions in time
   - Plan shown: Before November 18: begin with one timed practice test
   ```

   The description is also visible on the parent's copy of the invite (`book-consultation.js:180-183`), so the block uses the parent-facing labels from 2.3 and nothing internal.
3. **Private extended properties** (info@ copy only): `quiz_id`, `quiz_band`, `source: 'shsat_quiz'`.
4. **The platform relay** (`/api/bookings/site`) is unchanged.
   - In Phase 2, the relay's "newest lead by parent_email" match links the booking to the quiz lead, which holds `quiz_answers` and `admin_notes`.
   - In Phase 1, the calendar event and the ops alert are where the answers live.

### 7.4 Where the tutor sees the answers

| Phase | Places |
|---|---|
| Phase 1 | (a) The ops alert email. (b) The calendar event description on the info@ calendar. |
| Phase 2 | Both, plus (c) `/admin/leads/[id]` (`admin_notes` and `quiz_answers`). |

---

## 8. Test plan and acceptance criteria

### 8.1 Unit tests (`node --test`, no runtime dependencies)

**`tests/shsat-quiz-logic.test.js`**
- `bandFor` over all 160 answer combinations at 2026-09-28, 2026-10-05, 2026-10-06, 2026-10-30, 2026-10-31, 2026-11-18 and 2026-11-19. Assert every row of 3.2. Invalid codes throw.
- **B2 checks:**
  - With `practice_test: 'unsure'`, the `final_weeks_baseline` summary contains "If your student hasn't taken" and never "With no timed practice test".
  - At 2026-10-31, no `final_weeks_*` summary contains "in the right grade to take the SHSAT this fall", and all contain "If your student registered by October 30".
- **`takeawaysFor`:** 3 items for every non-`after_test` combination and 0 for `after_test`. Assert the exact ids per 3.5. No body contains `diagnostic`. Each body matches `IvyPath|consultation` at most once.
- **`weekPlan`:** assert exact rows at 2026-09-28 (5 rows, labels "This week", "Oct 6 to Oct 30", "Weeks of Oct 5 to Nov 2", "Week of Nov 9", "Test dates"), and at 2026-10-06, 2026-10-26, 2026-10-31, 2026-11-02, 2026-11-10, 2026-11-17 and 2026-11-18. Also assert `[]` for non-`final_weeks_*` bands.
- **Date lines:**
  - `countdownLine` at 2026-09-28 (7 weeks), 2026-11-04 (2 weeks), 2026-11-05 (less than two) and 2026-11-18 (today).
  - `introDateLine` and `registrationLine` at each boundary.
- **`textWindowState`** at 07:59, 08:00, 08:59, 09:00, 11:59, 12:00, 13:29, 13:30, 17:29, 17:30, 20:29, 20:30 and 23:00. Assert `alertPhrase` and `parentPhrase` for each.
- **Copy lint:** every exported string and every rendered combination against 2.11.
- **`normalizeUsMobile`:**
  - Accepts: `(917) 555-0142`, `917.555.0142`, `+1 917 555 0142`, `19175550142`.
  - Rejects: `1234567890`, `0175550142`, `9171555014`, `2222222222`, 9 digits, 12 digits.
- **`isSchoolEmail`:** the same table as `school-email-guard.js` (exact domain, subdomain, one edit, two edits after "nyc", unrelated domains).
- **`sanitizeName`** strips tags, digits and control characters, keeps `陈丽` and `O'Neil-Smith`, and caps the length.
- **`validateQuizPayload`:** every error branch, the `field` mapping, and every fixture in `tests/fixtures/quiz-payload.json`, including a UUID produced by the fallback generator.

**`tests/quiz-alert.test.js`**
- **`smsDraft`:**
  - at most 320 characters for every band and worry
  - starts with "Hi, this is Vicente from IvyPath Academy."
  - ends with "Reply STOP and I won't text again."
  - no worry sentence for `early_start` and `after_test`
  - passes the lint
- **`buildAlertEmail`:**
  - `sms:+19175550142?&body=` and `tel:+19175550142`
  - the window line
  - "self-declared parent"
  - the consent record (version, text, time, IP)
  - `[TEST?]` for `@example.com`, `[HONEYPOT?]` for a honeypot hit
  - everything escaped (a name containing `<script>` renders as text)
- **`buildPlanEmail`:** it contains no user-supplied string, the book link is bare, and the plan text equals the on-screen functions' output.

**`tests/quiz-lead-api.test.js`** (the handler with mock `req`/`res`; `QUIZ_RESEND_URL` points at a stub)
- `GET` health returns `resend_configured` true and false; 405; 413.
- A bad origin returns 403. `http://localhost:3000` is allowed only when `VERCEL_ENV` is unset.
- Each 400 field, the school email and a near miss.
- **Honeypot:** the alert is sent with `[HONEYPOT?]` and no plan copy; for `copy_only`, nothing is sent.
- **Idempotency:** the same `quiz_id` twice produces one send, and the second call does not count toward limits.
- **Rate limits:** 429 on the 6th successful send from one IP; a failed Resend call does not count.
- A missing key returns 503. `QUIZ_ALERT_DRY_RUN` sends nothing and returns ok.
- Resend 500, a 2xx without `id`, or a timeout returns 502, and no plan copy is sent.
- **Happy path:** `to` is the default array, `reply_to` is the parent, and the subject contains the grade and schools; the plan copy goes to the parent from the `noreply.` subdomain; `plan_emailed: true`.
- **Plan-copy failure:** returns 200 with `plan_emailed: false`.
- `console.log` output contains no email or phone.

**`tests/book-consultation-quiz.test.js`**
- A valid `quiz` renders the block with parent-facing labels.
- Unknown codes are dropped.
- The consulting type ignores `quiz`.
- **The booking still returns 200** with junk `quiz`, **and** when `require('../shsat-quiz-logic.js')` throws (module mocked to throw). Calendar and Resend are stubbed.

### 8.2 E2E (Playwright, `tests/e2e/shsat-quiz.spec.js`)

**Harness (`tests/e2e/server.js`).** No `vercel dev`, no project linking, no real env.
- A small Node server serves the repo root and applies the `vercel.json` rewrites and headers.
- It mounts `api/quiz-lead.js` with env `RESEND_API_KEY=test`, `QUIZ_RESEND_URL=http://127.0.0.1:<stub>/emails`, and `VERCEL_ENV` unset. The stub records every email body for assertions.
- `page.route` stubs:
  - `app.ivypathacademy.com/api/funnel/*`
  - `/api/book-consultation`
  - `googletagmanager.com` and `connect.facebook.net` (recording stubs that capture `gtag`, `dataLayer` and `fbq` calls)
- `addInitScript` sets `window.__IVP_QUIZ_TODAY`, `window.__IVP_QUIZ_NOW_MIN` and `window.__IVP_QUIZ_FLAGS`.

**Projects:** iPhone 12 (390×844), a 320×568 viewport, and Desktop Chrome 1280×800.

**Flows:**
1. **Happy path, grade 8, Phase 1, today 2026-09-28:**
   - The gate shows the preview, then validation errors, then succeeds.
   - The results show:
     - "About 7 weeks to the school-day test"
     - the `final_weeks_baseline` copy
     - "What happens next" second, with the text note
     - 5 week-plan rows and 3 takeaways
     - the diagnostic form and the trust row
     - the plan-copy status line
   - The stub received one alert and one plan copy.
   - Events fire once each, in order, and `ivypathTrackQuizLead` is called with `quiz_id`.
   - Every quiz event carries `send_to` = the GA4 id, and no modeled Google Ads request carries a quiz event name. The gtag.js stub models gtag's routing: an event with no `send_to` goes to every configured tag, the Ads tag included, as a request to the Ads host.
   - `fbq('set','autoConfig',false,'1550873539731081')` is recorded before `init`, and no `SubscribedButtonClick` is recorded.
2. **Student exit and minor mode:**
   - No gate; `quiz_student_exit` fires.
   - After that, no `fbq` event and no Ads `conversion` call are recorded, including after a `tel:` tap.
   - The ad-consent denial is pushed before the Q1 answer event, which is GA4 only. No `doubleclick.net`, `googleadservices.com` or `google.com/pagead` request fires between the student tap and the exit screen, or after it (the `tel:` tap and the diagnostic button included).
   - A Back inside the 260 ms advance still leaves the tab in minor mode.
   - The exit link has no `gclid` and carries `v=student`.
   - Share falls back to copy, then to the read-only input.
   - "I'm a parent, go back" returns to Q1.
3. **History:**
   - UI Back and browser Back keep the answers, and browser Back from Q4 shows Q3.
   - After capture, **one** `page.goBack()` leaves `/shsat/quiz`, and forward never shows the gate.
4. **Reload:** mid-quiz resumes at the same step; on results it re-renders without re-firing events or re-sending email.
5. **Gate errors:**
   - `@nycstudents.net` and `@nycstudent.net` are blocked by the guard, no request is sent, and the message lands in `.quiz-alert` and is visible.
   - A 5xx gives the retry message. A second 5xx gives "Show my plan anyway", which is focused and leads to results with `captured:false` and the diagnostic link variant. On the touch projects, the `sms:` link is present.
   - 429 gives "Show my plan anyway" at once.
6. **Grades:**
   - Grade 9: the diagnostic block shows the grade-9 line.
   - Grade 5: no diagnostic block, the `early_start` copy, and the `T3_EARLY` title with no label.
   - Grades 6 and 7: `foundation` and `full_year`, with no week plan.
7. **Dates and times:**
   - 2026-10-06 gives `T1_REG_OPEN`.
   - 2026-10-31 gives `T1_REG_CLOSED` and the conditional summary.
   - 2026-11-19 with grade 8 gives `after_test`, with 0 takeaways and no week plan.
   - At 22:00 the text note says "tomorrow morning", and the call line says "after 9 AM ET".
8. **Diagnostic send:**
   - Phase 1 posts to `send-link` with `v:'parent'`, `student_grade:8`, `ivp_lp:'/shsat/quiz'` and the handoff email.
   - The success message shows `sentTo` and is focused.
   - A 400 shows the error and the fallback link.
9. **Phase 2** (flags overridden):
   - A platform 200 stores `lead_ref`, fires a `copy_only` call, and the diagnostic button posts to `quiz-lead/send-link`.
   - An expired-token 400 there retries silently through `send-link`.
   - A platform abort (the route hangs 16 s) falls back to `/api/quiz-lead` with `backend='site_fallback'`.
   - A 400 without `field` falls back.
   - A 400 with `field:'phone'` does **not** fall back.
10. **Booking handoff:**
    - The consultation button loads `/book.html` with name, email and phone prefilled, the note visible, and the SHSAT subtitle.
    - "Clear" empties the fields and focuses `#leadName`.
    - The stubbed `/api/book-consultation` POST contains `quiz`, and the key is removed on success.
    - After "Show my plan anyway", the prefill still works.
11. **Privacy sweep:** no request URL, `dataLayer` entry or `fbq` argument contains the test email, phone or name. `QuizLead` has no parameters. No URL the quiz creates contains `ref=`.
12. **Paths:**
    - `/shsat/quiz` and `/shsat/quiz/` return 200.
    - `/shsat-quiz.html` is normalized to `/shsat/quiz`, and `ivp_lp` on the app links is `/shsat/quiz`.
    - Every subresource returns 200, with no request under `/shsat/…` except the page.
    - The page has `X-Robots-Tag: noindex` and the robots meta.
    - `sticky-cta` is absent.
13. **/shsat regression:** the only DOM difference on /shsat is the new `.hero-alt-link` paragraph. The send-link form still posts the same body.
14. **Copy sweep:** the visible text, `<title>`, meta and OG content, `alt`, `aria-label` and `<noscript>` of every screen, at every grade, date and time variant, plus the recorded alert and plan emails and the new book.html strings, all pass 2.11 apart from the two exact exceptions.
15. **Double tap:** a double click on a Q4 chip lands on Q5 with Q5 unanswered. With reduced motion, a second click within 300 ms of the render does nothing.
16. **Slow save:** with the site route delayed 10 s, one alert is recorded, one captured result shows, and the button read "Still saving…" at 5 s.
17. **Tap targets:** at 320 px, every button and every link outside running text has a bounding box at least 44 px tall.
18. **One screen:** on every step, the accessibility tree contains exactly one screen.
19. **Forced colors:** `emulateMedia({ forcedColors: 'active' })` screenshots of Q3 with picks and of a revisited Q2 show the selection.
20. **Reduced motion:** `emulateMedia({ reducedMotion: 'reduce' })` runs no animations, and the results are fully visible at once.
21. **Focus:** `document.activeElement` is checked after each step (the heading), after diagnostic success (the message), after a save error (the button), when "Show my plan anyway" appears (that button), and after book.html Clear (`#leadName`).

### 8.3 Accessibility

- **axe:** `@axe-core/playwright` on the intro, each question, the gate (empty and with errors), the results for each band, and the student exit: **0 serious or critical violations**.
- **Keyboard-only run:** complete the whole flow with Tab, Shift+Tab, Enter and Space, including the dark "What happens next" block, the top bar and the footer. Focus is always visible.
- **Manual screen-reader pass** (VoiceOver on iOS Safari, NVDA with Firefox). Check that:
  - "Question N of 6" is announced once, with the title
  - the pressed state is announced
  - errors are announced, and the guard message is heard
  - "Saving your answers" and the diagnostic success are each heard once
- **Contrast** (a unit test computes each pair):

  | Pair | Ratio |
  |---|---|
  | `#8F6B37` on cream and on white | at least 4.5:1 |
  | `#5C6B60` muted on cream and on white | 5.3:1 |
  | the `--muted` indicator borders | at least 3:1 |
  | cream at 0.7 on `--forest-deep` (disclaimer, footer) | 6.8:1 |
  | the cream focus ring on `--forest-deep` | 12.2:1 |
  | the `--sage-deep` focus ring on cream | at least 3:1 |
  | white on sage | 4.9:1 |

- **Zoom and text spacing:** at 200% zoom, at 320 px width, and with WCAG 1.4.12 text spacing, nothing scrolls horizontally or clips.
- **Motion:** with `prefers-reduced-motion`, there are no animations.

### 8.4 Acceptance criteria

**Site (Phase 1)**
- **AC1.** `https://www.ivypathacademy.com/shsat/quiz` renders the intro at 320, 390 and 1280 px with no horizontal scroll. Every asset loads from a root path.
- **AC2.** A parent can finish the 6 questions and the gate in under 2 minutes on a phone. Every screen matches section 2 word for word.
- **AC3.** A submitted gate with a real mobile number delivers the alert to both recipients within 60 s. In it:
  - "Text … with this message" opens Messages on an iPhone with the draft filled in
  - "Call" dials
  - the answers, the source, the window line and the consent record are correct
- **AC4.** No path shows or sends a message claiming that the system texts anyone. The only texting statements are that Vicente, a person, may text, and the consent line.
- **AC5.** Results match 3.2, 3.4 and 3.5 across the test matrix. The honesty note is always present.
- **AC6.** "Email the diagnostic link" delivers the standard start-link email. The lead shows `contact_role = parent`. After a test diagnostic, the report email goes to the parent's address (platform item F).
- **AC7.** The booking handoff prefills book.html. The calendar event on info@ shows the "SHSAT PLAN" block. A real preview booking reaches `thank-you.html`, so the existing conversion is unaffected.
- **AC8.** GA4 DebugView shows the 6.2 sequence with no extra `page_view` on step changes. With the label set, Tag Assistant shows one `conversion` hit with `transaction_id`. `?notrack=1` suppresses all of it.
- **AC9.** Unit and E2E tests pass, and axe reports 0 serious or critical issues. `/shsat` is unchanged apart from the one link.
- **AC10.** The page is noindex by both meta and header, is not in the sitemap, and loads no sticky bar. After the `.vercelignore` merge, `/docs/specs/...` and `/tests/...` return 404.
- **AC11.** With real tags on the preview, the 6.5 manual check passes: no `ud[...]` on Pixel requests, no `em`, `ph` or `fn` on Google requests, and no `facebook.com/tr` request with `ev=SubscribedButtonClick` while answering Q1 to Q6. Vicente has confirmed that Automatic events is off for dataset 1550873539731081. After a student answer, no Pixel event and no Google Ads request (conversion or remarketing) is sent.
- **AC12.** A test text from Vicente arrives on a second phone and shows the sender the copy promised (or no number was promised, when `TEXT_FROM_NUMBER` is null). An opt-out dry run adds the number to `suppressed.txt`, and `can_contact.py --phone` returns BLOCKED.
- **AC13.** With `PLAN_COPY` on, the plan copy arrives within 60 s in a Gmail inbox and an iCloud inbox, not in spam, and matches the screen.

**Platform (Phase 2) smoke test on production**

Use a non-test-looking name, Vicente's own phone, and `?notrack=1`. Delete the rows afterwards, per the prod-smoke cleanup list.
- **AC-P1.** The POST returns `{ok:true, lead_ref, diagnostic_link_allowed:true}` for grade 8.
- **AC-P2.** A `leads` row exists with `source='shsat_quiz'`, `contact_role='parent'`, an E.164 phone, `parent_name`, `quiz_answers.quiz_id`, `quiz_answers.consent_version` and `admin_notes`.
- **AC-P3.** The ops alert arrives with a working `sms:` link, the exact template text and the window line.
- **AC-P4.** Re-posting the same `quiz_id`, including two concurrent posts, gives one row and one alert.
- **AC-P5.** `quiz-lead/send-link` with the `lead_ref` sends the start link for the same `lead_id`, and no new row appears.
- **AC-P6.** A grade-5 POST stores `student_grade` as null, and `diagnostic_link_allowed` is false.
- **AC-P7.** A forced `sendSms` for the quiz lead is refused by `assertSmsAllowed`.
- **AC-P8.** `can_contact.py --lead <masked id>` returns BLOCKED for the quiz lead (growth session).

---

## 9. Rollout, metrics and rollback

### 9.1 Order

1. **Prerequisites.** Nothing below step 3 happens until these are done.
   - **Ben:** set `RESEND_API_KEY` for Production and Preview on the site project, from the Resend account where `noreply.ivypathacademy.com` is verified.
   - **Vicente:**
     - the texter card (photo and one-line role)
     - which number his texts come from
     - the texting-window exemption decision
     - approval of the consent text
     - the 606 year and a check that the screenshot shows no student name or ID
     - the og:image poster frame check
     - Meta AAM off, and Google user-provided-data detection off
     - the "SHSAT quiz lead" conversion action created, with its label handed to the site session
     - the GA4 key event
   - **Counsel** (arranged by Vicente): the Child Data Protection Act reading of minor mode, and the consent language. The launch can proceed on the conservative implementation while this is pending.
   - **Growth session:** the 5.7.1 guards live, and the decisions.md entry written.
2. **Site PR** (bnudelman4/ivypath).
   - Contents: everything in 1.2, including `privacy.html` and `.vercelignore`, with `QUIZ_BACKEND='site'`, `PLAN_COPY=false`, `SHOW_VSL=false` and the flags in 5.5.
   - QA on the preview. The site function is real there; the send-link calls are stubbed, because of CORS.
   - Merge.
3. **Deploy gate** (production, `?notrack=1`):
   - `GET https://www.ivypathacademy.com/api/quiz-lead` returns `resend_configured: true`.
   - A real `[TEST?]` alert arrives in both ops inboxes, and its `sms:` link opens Messages with the draft (AC3).
   - Flip `PLAN_COPY=true` in a one-line PR, then confirm AC13.
   - Run AC1 to AC13.
4. **Ads** (Vicente or the ads session, on a weekday morning, because edits send ads back to review):
   - Set **keyword-level** final URLs in the four parent-intent ad groups to `https://www.ivypathacademy.com/shsat/quiz`. Use the www host, which saves a 307 hop.
   - Add one new RSA per ad group with plan-scent headlines, for example "Free 2-Minute SHSAT Plan", "SHSAT Plan for NYC Parents", "Dates, Where to Start, What to Focus On". They must follow the brand rules and must not say "readiness". Existing ads stay; sitelinks keep their own URLs.
   - Keep the tracking template. Auto-tagging carries `gclid`.
   - Announce the change to the other sessions: /shsat's traffic mix changes, which matters for the session-ownership contract.
5. **Platform** (platform session): 5.6, then AC-P1 to AC-P8. Then the site PR flips `QUIZ_BACKEND='platform'`.
6. **Record** the launch and each read-out in `growth/operations/decisions.md` and `growth/metrics/progress-log.md` (shared records rule).

**If Ben cannot set the key on Monday:** skip steps 3 and 4, and do step 5 first. Then launch with `QUIZ_BACKEND='platform'` and `PLAN_COPY=false`: `copy_only` needs the site key, and the fallback is unavailable, though the parent's own `sms:` path in 2.7 still works. Then do step 4. Turn `PLAN_COPY` on once the key is set.

### 9.2 Metrics (judged on the four parent-intent ad groups; no A/B)

**Primary: phone leads per paid click**
- `quiz_lead_captured` divided by Ads clicks on the quiz final URLs.
- Cross-check against the alert emails (Phase 1) and against `leads.source='shsat_quiz'` (Phase 2), excluding `[TEST?]` and `[HONEYPOT?]`.

**Secondary**
- **Consultations booked per click:** `thank-you` conversions from sessions with `first_landing=/shsat/quiz`, plus calendar events carrying the SHSAT PLAN block.
- **Parent reply rate:** texts answered divided by quiz leads, logged by Vicente. Also log the STOP count.
- **Step conversion:** `quiz_started / page_view`, drop-off by `question_index`, and `quiz_gate_viewed → quiz_lead_captured`.
- **Failures:** `quiz_lead_failed` count by `status` and `backend`.
- **Student exit share:** `quiz_student_exit / quiz_started`.
- **Diagnostic links sent per lead.**

**Read-outs** (at about 4 parent-intent clicks a day, 60 clicks is roughly 2 weeks):
- **Health check at 30 clicks.** Any of these means something is broken; investigate before spending more:
  - `quiz_started` below 1 in 5 clicks
  - any `quiz_lead_failed` spike
  - 0 leads with 10 or more gate views
- **Decision at 60 clicks, or on 2026-10-16, whichever comes first** (two weeks before registration closes):
  - **Keep** if phone leads per click is at least 5% (3 or more leads) **or** at least 1 consultation is booked.
  - **Revert** if there is 1 lead or fewer and no consultations.
  - Otherwise extend to 100 clicks.
- The comparison is /shsat's phone taps plus bookings per click on the other ad groups, over the same days.
- These are judgment thresholds on small numbers, not significance tests. Growth confirms them before launch.

**Season end**
- Before 2026-11-14, decide whether to pause quiz traffic for 8th-grade intent.
- From 2026-11-19 the page shows `after_test` to 8th and 9th graders. Update or retire it for the 2027 cycle.

### 9.3 Rollback

1. **Normal:** set the keyword final URLs back to `https://www.ivypathacademy.com/shsat`. The quiz page can stay live: it is noindex and harmless.
2. **Page broken while ads still point at it:** a one-line site PR adds to `redirects`: `{"source":"/shsat/quiz","destination":"/shsat","permanent":false}`, plus the `/shsat/quiz/` variant. Redirects run before rewrites. Confirm with `curl -I "https://www.ivypathacademy.com/shsat/quiz?gclid=test"` (the www host; the apex only shows the domain 307) that the query string survives.
3. **Platform path misbehaving:** flip `QUIZ_BACKEND` back to `'site'`, and `DIAG_GRADES` back to `[6,7,8]`.
4. **Plan copy misbehaving:** flip `PLAN_COPY` to `false`.
5. **Remove the /shsat hero link** by reverting its one line.

---

## 10. Open questions and owner decisions

Items marked **(launch)** block the ads switch in 9.1.

1. **Texter card (Vicente, launch).** A 96×96 photo and a one-line role, in his own words. PRODUCT.md names Benjamin as the founder face, and no approved descriptor for Vicente exists, so none is invented here.
2. **Sender number (Vicente, launch).** Which number do his texts actually come from? If it is (929) 394-0349, set `TEXT_FROM_NUMBER`. If it is not, the copy keeps naming no number, and the SMS draft already opens with "Vicente from IvyPath Academy".
3. **Texting windows (Vicente, launch).** Is a parent who just asked to be contacted exempt from the 07:00-09:00, 12:00-13:30 and 17:30-20:30 windows? The default applies the windows with an 08:00 floor. Record the answer in decisions.md.
4. **Consent and counsel (Vicente, launch):**
   - Approve the consent text (2.5), including the "Message and data rates may apply" line.
   - Have counsel confirm the Child Data Protection Act reading: minor mode on a self-declared student; whether `analytics_storage` should also be denied; and that other pages' inline Pixel `PageView` fires before the flag is read.
5. **VSL (D6), for Vicente or the ad-edit session.** Listen to the live /shsat VSL. If it still says "kids", "20 points away ... or 200", "full-length", "this year's real cut-offs" or "about an hour", it breaks brand rules on /shsat today. Re-cut or re-voice those lines before `SHOW_VSL` is turned on.
6. **9th grade.** Confirm that "9th grade (first year of 9th)" matches the DOE's "first-time 9th grade students". Verify `T1_G9_NOTE` on the DOE page, or leave it off.
7. **DOE copy to verify before merge:**
   - every sentence of `T3_PROCESS` (ranking order and how offers are assigned); until then `T3_PROCESS_BASIC` ships
   - that both DOE URLs return 200
   - The dates, weekend-site groups, 100 questions, 180 minutes, no penalty and no revisiting are already DOE-verified (brand-rules memory).
8. **Chinese (D16).** Who answers Chinese texts, and how fast? Until confirmed, `ZH_TEXTS` stays off. Is there a WeChat account worth offering, optionally and never in a URL?
9. **99th percentile.** Is there an SHSAT-true wording, for example which test and which tutors? Until then it is left out.
10. **The 606 proof.** Which year was it? Confirm that the screenshot shows no student name or ID.
11. **Student first name (D13).** It is dropped for data minimization and a shorter gate. Re-add it only if Vicente wants it; every template keeps the `{who}` token.
12. **Postal address.** The plan copy is transactional. Before quiz leads receive any commercial follow-up email, the footer needs a postal address (CAN-SPAM). The outreach sender's footer lacks one too.
13. **Enhanced conversions** (hashed email and phone to Google): off in v1. It is Vicente's call on privacy versus match rate.
14. **Turnstile:** not in v1. Add it to the quiz and the platform route if the per-phone and per-IP limits prove too weak.
15. **After-hours calls.** A 9 PM call to (929) 394-0349 reaches voicemail. A greeting that names IvyPath Academy and offers a callback in English or 中文 would keep that call from feeling like a dead end.
16. **Retention.** Delete `[TEST?]` alerts after QA. Keep non-test alerts: they are the Phase 1 consent record. The privacy.html retention line covers deletion requests.
17. **Side issues found, not fixed here:**
    - The /shsat hero says "full-length diagnostic", "a real number" and "prior-year ... cutoffs", and shows the bare guarantee chip. The /shsat FAQ says "aced", "calibrated" and "exactly where to focus".
    - The /shsat form never sends a top-level `ref_code`, so referrals are never credited.
    - book.html says "Ivy League" without "Top 20".
    - The platform's and the booking API's `noreply@ivypathacademy.com` sender is unverified (5.6 M), so those emails are probably failing silently.
    - `PRODUCT.md`, `DESIGN.md`, `server/` and `docs/` are publicly served from the site. The `.vercelignore` here covers `docs/` and `tests/`; the site owner decides on the rest.
