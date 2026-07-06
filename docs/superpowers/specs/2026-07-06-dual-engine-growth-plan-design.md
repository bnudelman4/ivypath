# Dual-Engine Growth Plan — Design Spec
**Date:** 2026-07-06 · **Status:** **APPROVED** (user, 2026-07-06) — open checks resolved: consulting is
fully remote (national targeting unlocked at Gate 2); written consent covers paid ads (named schools
allowed from day 1). **Amendment:** ad/VSL editing follows the Zenith-teardown edit spec (workflow
`wf_9bc6591a-ef3`; frame-level tactics playbook + IvyPath blueprint) — their tactics, executed better,
on real consented proof.
**Owner:** Vicente (IvyPath) · **Executor:** Claude (build, produce, launch, measure)

## 1. Decision & context

Approach **C — Phased dual-track** was chosen over A (test-prep-first, consulting later) and
B (launch both cold now):

- **Engine 1 (test prep)** exists and needs *tuning + patience*, not more money: CPM already
  fell ~73% after the Jul 4 targeting cleanup; VSL play rate rose ~7% → 22–40%/day after
  muted autoplay; the remaining problem is optimization-event volume (~31 usable events/wk
  vs Meta's ~50/wk appetite) and a not-yet-filled retargeting layer.
- **Engine 2 (college consulting)** is a proven-capability, high-ticket offer
  ($3.5k–$14.5k) with **zero funnel**, in its seasonal buying window (July–Aug for the
  Application Track). Every earlier blocker is resolved: two consultants with 2 years'
  experience and client placements at **Brown, CMU, Princeton, Harvard** (written consent +
  proof docs on file), a full two-track/three-tier price architecture, and 6–10 family
  capacity with a hiring path.
- Budgets are sequenced by readiness: consulting spend starts **only when its funnel is
  live**, as an *addition* (+$20–25/day), never a raid on Engine 1's budget.

### Inputs fixed during brainstorm
| Input | Value |
|---|---|
| Total ad budget | Start ~$50/day once both engines live; **flexible upward if ROI shows** (see gates) |
| Consulting pricing | Foundation (gr 9–10): $3,500 / $6,000 / $10,500 per year (renewable). Application (gr 11–12): $5,500 / $8,500 / $14,500 (up to 18 mo) |
| Capacity | 6–10 new families this cycle; ready to hire more consultants on growth |
| VSL face | **Vicente** (films on phone; Claude scripts + produces) |
| Proof/consent | Written consent + proof docs for client admits and the transformation story |

## 2. Engine 1 — Test prep (tune only)

1. **Consolidate** the two cold ad sets (`SAT — DiagStart v2`, `SHSAT — DiagStart v2`) into
   **one** ad set under a **new campaign** (the legacy campaign `120252316963980119` has a
   mixed-attribution reporting blackout; a fresh campaign guarantees one attribution setting,
   7d-click/1d-view, throughout), optimizing on the **VSL Watched** custom conversion
   (id `1416768190289583`), ~$25–30/day, NYC parents 35–54, FB+IG only (Tier 0 targeting
   retained). Built paused → user approves → live.
2. **Creative:** QC'd vertical videos (`ads916/ad-sat-9x16.mp4`, `ad-shsat-9x16.mp4`) +
   best statics (real Stuyvesant offer). Goal-ladder concept stays retired.
3. **Retargeting ad set** added the day website audiences cross ~100 users
   (audience ids `120253401292620119` all-visitors, `120253401307560119` VSL players,
   `120253401309240119` CTA clickers; lookalike `120253401312620119`).
4. **Judgment date:** ~Jul 20 on CPL trend (real leads, not phantom "Website leads").
   No budget increase before then.

## 3. Engine 2 — Consulting funnel

### 3.1 Page: `ivypathacademy.com/consulting` (ivypath-site repo)
Same design language as `/sat` (dark-forest hero, cream body, Lora accents). Sections:
1. Hero: **Vicente VSL** — muted autoplay, burned captions, tap-for-sound (proven pattern).
   Eyebrow: "For families targeting top colleges."
2. **Proof strip:** consented admits — Brown, CMU, Princeton, Harvard — with
   "Results vary; admissions depend on many factors."
3. **Two doors:** Foundation Track (9–10) vs Application Track (11–12); each shows its three
   tiers with transparent pricing (reuse of the `/sat` pricing-transparency module).
4. **Case study:** Vicente's managed client, anonymized ("a student we work with"):
   1000 SAT / no direction → 1400, Stanford neurology internship, NYC ecology internship,
   8 APs, clear direction. Told as process ("what we actually did"). Numbers verified
   against proof docs before publication (incl. SAT-vs-PSAT scale check on the "1000").
5. **Team:** the two consultants + credentials.
6. FAQ (split-layout accordion) → closing CTA.
7. **Single CTA everywhere:** "Book a free strategy call" → Calendly embed (UTM passthrough);
   booking confirmation fires `StrategyCallBooked` (browser pixel + CAPI w/ `external_id`).

### 3.2 VSL: ~90–120s, six beats (Claude scripts; Vicente reads naturally)
1. **Hook (0–10s):** "Most families start thinking seriously about college applications in
   senior year. That's exactly why most applications look the same."
2. **Authority (10–25s):** consultants who placed students at Brown, CMU, Princeton, Harvard.
3. **Problem (25–45s):** strong grades ≠ compelling application; the profile is built in
   grades 9–11; by senior fall the differentiators are set.
4. **Proof (45–70s):** the client transformation, concrete and anonymized.
5. **De-risk (70–90s):** what the free strategy call actually is — honest read, roadmap
   sketch, no pressure.
6. **CTA (90s+):** book below; limited families per cycle (true: capacity cap).

**Filming specs:** phone, landscape 1080p+, eye-level, window light, quiet room, ~2 min.
Claude handles color, captions, proof-doc cutaways, music, and 9:16 / 4:5 ad cuts from the
same take (pipeline: `VSL-Editing/` + `ad916.py` patterns).

## 4. Campaign structure + budget gates

**Consulting campaign** (Leads objective, CBO, $20–25/day at launch):
- **Cold ad set:** NYC metro + affluent commuter belt (Westchester, Long Island, N. NJ),
  parents ~40–55, broad otherwise. Optimize on `StrategyCallBooked`; week-1 fallback to
  Landing Page Views if delivery stalls (defined: <50% of daily budget delivered on 2
  consecutive days), switching back once ~15–20 bookings accumulate.
- **Warm ad set** (at ≥100 audience): site visitors + VSL watchers + tutoring lead list →
  consulting offer. Likeliest source of first close.
- **Lookalike** (1% seminar list, active @1,000): expansion lever at Gate 2, not launch.
- **Creative:** 2–3 VSL cuts (9:16, 4:5) + admits proof-card static + transformation static;
  Zenith-style long-form story copy on all.

| Stage | Trigger | Action |
|---|---|---|
| Launch | Funnel live | ~$50/day total (both engines) |
| Gate 1 (~2 wks / ~$300 consulting) | ≥8–10 bookings at ≤$40/booking | Consulting → $40/day |
| Gate 1 fail | <4 bookings | Fix creative/page — not budget |
| Gate 2 (~4–6 wks) | ≥1–2 signed families | +50% budget steps; open national geo (if remote delivery confirmed) |
| Cap | 8 signed families | Waitlist framing + trigger consultant hire |
| Kill | ~$1k spend, ≥20 bookings, 0 closes | Ads off; fix the sales call |
| Rework | ~$1k spend, <10 bookings | Rebuild page/creative |

Rationale: one Application-Track close ($5.5k–$14.5k) pays for ~3–6 months of the entire
consulting ad budget; gates exist to find that out cheaply and to distinguish
funnel failure (no bookings) from sales failure (bookings, no closes).

## 5. Measurement

- **`StrategyCallBooked`** — new event, browser + CAPI (external_id = booking/attempt id;
  dedup per PR #21 pattern). Campaign optimization target; CPL definition for consulting.
- **Consulting VSL Watched** — custom conversion = existing `VSLPlay` filtered to URL
  contains `/consulting`. Also used for retargeting audiences.
- **GA4:** mirror events; mark both as key events.
- **UTMs on every ad** (`utm_campaign/adset/content`); funnel stores attribution per
  attempt (already shipped), enabling creative-level attribution of signed families.
- **Offline pipeline (owner: Vicente):** shared sheet, 5 stages —
  booked → showed → call done → proposal → signed. Weekly cost-per-stage readout.
  Show-rate <~60% ⇒ add SMS/email reminders (lever, not redesign).
- **Cadence:** data pulls every 3–4 days; formal reviews at Gate 1 / Gate 2.
  Test-prep checkpoint ~Jul 20 unchanged.

## 6. Compliance (claims policy)

- **Allowed:** naming Brown/CMU/Princeton/Harvard (consent + proof on file); anonymized
  client story; transparent pricing; "limited families per cycle" (true).
- **Verify before use:** every number in the case study against proof docs
  (incl. SAT/PSAT scale of the starting score).
- **Never:** admission guarantees or implication thereof; outcome claims without
  "results vary"; copy addressing the reader's child's deficiency directly
  (Meta personal-attributes policy) — stakes phrased generally.
- If any consent is scoped to website-only (not paid ads): downgrade that element to
  generic phrasing until consent extended. **Open check for Vicente.**

## 7. Timeline & responsibilities

**Vicente:** (1) film VSL within ~72h of receiving script/shot list — the critical path;
(2) run strategy calls + keep pipeline sheet current; confirm (a) remote deliverability,
(b) consent covers paid ads.

**Claude:** Day 1–2: script + shot list; consolidated test-prep ad set (paused → approval);
pipeline sheet template. Day 2–4: `/consulting` page + events. Day 3–5 (on footage):
produce VSL + ad cuts + statics; adversarial QC workflow. Day 5–7: PR → review → merge →
live beacon test; consulting campaign built paused → approval → live. Ongoing: retargeting
flip-on, data pulls, gate reviews.

**Contingencies:** Calendly default for booking (swappable later without campaign changes).
If filming slips >1 week: ship page with proof strip + case study leading; VSL slots in
on arrival.

## 8. Out of scope (v1)
- Consulting cross-sell inside the SAT/SHSAT diagnostic results flow (v2).
- WeChat/Mandarin-language creative variants (revisit at Gate 2 with data).
- Platform-native booking (Calendly first).
- New consultant hiring mechanics (triggered at 8 signed families, handled then).
