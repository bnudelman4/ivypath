# Dual-Engine Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launch IvyPath's college-consulting funnel (`/consulting` + Vicente VSL + StrategyCallBooked tracking + capped Meta campaign) while consolidating the test-prep engine onto the `VSL Watched` optimization event.

**Architecture:** Static funnel page in `ivypath-site` (Vercel) fires browser events and relays CAPI through a new endpoint in `ivypath-platform`; VSL produced by the local ffmpeg/PIL pipeline in `VSL-Editing/` per the Zenith-teardown blueprint; campaigns managed via Meta MCP tools, always created **paused** with a user gate before activation.

**Tech Stack:** Static HTML/CSS/JS + Vercel · Next.js (platform, vitest) · ffmpeg + PIL + mlx-whisper · Meta Marketing API (MCP) · GA4 · Calendly embed.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-06-dual-engine-growth-plan-design.md` (APPROVED). Deviations require user sign-off.
- Compliance: no admission guarantees; outcome mentions carry "Results vary"; no fabricated stats; no copy addressing the reader's child's deficiency directly; named schools (Brown, CMU, Princeton, Harvard) allowed — written consent + proof docs on file.
- Brand: dark-forest `#1F3A2D`-family greens, cream `#FDF8F0`, gold `#C5A572`; fonts Instrument Sans + Lora (already in repo/`VSL-Editing/fonts`). No em-dashes at the start of hero copy (user preference from `/sat` work).
- Budgets: test-prep ~$27/day; consulting +$22/day at launch. Never exceed without a gate from the spec §4 table.
- Git: repo-local identity `Maxblade1234 <117409768+Maxblade1234@users.noreply.github.com>`; feature branches + PRs; user gate before merge and before activating any ad entity. mp4 assets go through Git LFS.
- Meta account `2154711868659656` · pixel `1550873539731081` · VSL Watched custom conversion `1416768190289583` · GA4 `G-EW2RB4F5JB`.
- All new ad entities: attribution 7d-click/1d-view; placements Facebook+Instagram only; `advantage_audience: 0`.

## File Structure

```
ivypath-site/
  consulting.html                     (new — funnel page)
  vercel.json                         (modify — /consulting rewrite)
  docs/consulting-vsl-script.md       (new — Vicente's script + shot list)
  docs/pipeline-template.csv          (new — 5-stage sales pipeline sheet)
ivypath-platform/
  src/app/api/track/strategy-call-booked/route.ts       (new — CAPI relay)
  src/app/api/track/strategy-call-booked/route.test.ts  (new — vitest)
VSL-Editing/
  zenith-ref/BLUEPRINT.md             (new — saved teardown output)
  annotate.py                         (new — animated annotation renderer)
  consult916.py                       (new — consulting ad builder; ad916.py pattern)
  consulting/                         (new — footage in, renders out)
```

---

### Task 1: Vicente's VSL script + shot list (critical path — deliver first)

**Files:**
- Create: `ivypath-site/docs/consulting-vsl-script.md`

**Interfaces:**
- Produces: the shooting script Vicente films from; Task 9 aligns its word timings against this text (same `align()` mechanism as `compose.py`).

- [ ] **Step 1: Write the script file** with exactly this content (six beats, ~105s, compliance-checked):

```markdown
# Consulting VSL — Script + Shot List (Vicente)

## The script (read naturally, ~105 seconds)

**[HOOK]** Most families start taking college applications seriously in senior
year. That's exactly why most applications look the same — and why strong
students get passed over.

**[AUTHORITY]** I'm Vicente, and I lead the college consulting team at IvyPath.
Our consultants have helped students earn admission to schools like Brown,
Carnegie Mellon, Princeton, and Harvard — not by gaming the system, but by
building applications that are impossible to ignore.

**[PROBLEM]** Here's what most families miss: grades and test scores get your
child considered. They don't get them chosen. What gets them chosen is a
profile — the projects, the internships, the story that makes an admissions
officer remember them. And that profile is built in ninth, tenth, and eleventh
grade. By senior fall, you're not building anymore. You're packaging whatever
is there.

**[PROOF]** One student we work with started with a 1000 SAT, two APs, and no
real direction. Today she's at a 1400, she's headed into a Stanford neurology
internship and an ecology internship here in New York, she's on track for
eight AP classes — and she knows exactly where she's going and why. That's
what a real plan looks like. Results vary student to student — but the
process is the same.

**[DE-RISK]** So here's what we do. Book a free strategy call. A consultant —
not a salesperson — will look at where your child is right now, tell you
honestly what's strong, what's missing, and sketch the roadmap we'd build. If
it's not a fit, you walk away with the roadmap anyway. No pressure, no scripts.

**[CTA]** We take on a limited number of families each cycle, so every student
gets real attention. Tap below to book your free strategy call — and let's
find out where your child actually stands.

## Shot list / filming instructions
1. Phone camera, **landscape**, 1080p or 4K, 30fps. Camera at eye level
   (stack books under it), arm's-length-plus distance.
2. Window light in front of you at ~45°, quiet room, no fan/AC hum.
3. Frame: leave headroom and side margins — we center-crop to vertical 9:16,
   so keep your face in the middle third. Solid dark top, plain background.
4. Record the WHOLE script 3 times (full takes — do not stop on stumbles;
   just repeat the sentence and keep going).
5. Extra: record the HOOK and the CTA 2 more times each as standalones.
6. Leave 2 seconds of silence before and after every take.
7. Send back the raw files untrimmed (AirDrop/Drive), named take1/2/3.
```

- [ ] **Step 2: Verify the script against compliance rules**

Run: `grep -ci "guarantee" ivypath-site/docs/consulting-vsl-script.md`
Expected: `0`. And confirm the string "Results vary" appears: `grep -c "Results vary" …` → `1`.

- [ ] **Step 3: Commit and hand to user**

```bash
cd "/Users/vicentexia/Downloads/IvyPath Academy/ivypath-site"
git add docs/consulting-vsl-script.md && git commit -m "Add consulting VSL script + shot list for Vicente"
```
Then message the user: script is ready; filming turnaround target 72h.

---

### Task 2: Sales pipeline sheet template

**Files:**
- Create: `ivypath-site/docs/pipeline-template.csv`

**Interfaces:**
- Produces: the 5-stage tracking file the user copies into Google Sheets; gate reviews (Task 14) read stage conversion from it.

- [ ] **Step 1: Write the CSV template**

```csv
date_booked,parent_name,student_grade,track_interest,utm_campaign,utm_content,showed,call_done,proposal_sent,signed_tier,notes
2026-07-10,EXAMPLE ROW — delete,11,application,consulting-cold,vsl-a,Y,Y,Y,application_essential_5500,booked via /consulting
```

- [ ] **Step 2: Commit**

```bash
git add docs/pipeline-template.csv && git commit -m "Add 5-stage consulting pipeline template"
```
Tell the user: copy into a Google Sheet; one row per booking; ~2 min/day.

---

### Task 3: `/consulting` page

**Files:**
- Create: `ivypath-site/consulting.html` (start from a copy of `sat-diagnostic.html` to inherit head/styles/fonts/pixel/GA4/notrack plumbing)
- Modify: `ivypath-site/vercel.json` (add rewrite)

**Interfaces:**
- Consumes: existing CSS variables/classes from `sat-diagnostic.html` (`--forest-deep`, `.btn-primary`, `.hero-video-wrap`, `.vsl-sound-btn`, FAQ accordion JS, fade-in observer).
- Produces: page sections Task 4 wires events into; DOM hook `id="bookCall"` on every CTA anchor; `<div id="calendlyEmbed">` container.

- [ ] **Step 1: Copy base and strip test-prep content**

```bash
cd "/Users/vicentexia/Downloads/IvyPath Academy/ivypath-site"
cp sat-diagnostic.html consulting.html
```
Then in `consulting.html`: update `<title>` to `College Consulting — IvyPath Academy`, meta description to `Two consulting tracks — build the profile (grades 9–10) or win the application cycle (grades 11–12). Book a free strategy call.`, and og/twitter image to `assets/ivypath-consulting-poster.jpg` (poster generated in Task 9; placeholder file committed as a copy of the SAT poster until then — acceptable because it is replaced by Task 9, not shipped as final).

- [ ] **Step 2: Replace the hero section** — keep `.hero-video-wrap` + `#heroVideo` + `#vslSound` structure exactly (muted-autoplay pattern), swap sources to `assets/ivypath-consulting-vsl.mp4` / poster, eyebrow to `For families targeting top colleges`, headline to:
`Strong grades get your child considered. A real profile gets them <span class="gi">chosen.</span>`
CTA anchor (pattern repeats at every section boundary):

```html
<a href="#book" class="btn-primary js-book-cta">Book a free strategy call &rarr;</a>
<p class="video-note">Free &middot; ~30 minutes &middot; honest assessment &middot; no obligation</p>
```

- [ ] **Step 3: Proof strip** (directly under hero):

```html
<section class="wrap proof-strip">
  <p class="eyebrow">Real results from our consulting students</p>
  <h2>Our consultants have helped students earn admission to</h2>
  <div class="accept-row">
    <span>Brown</span><span>Carnegie Mellon</span><span>Princeton</span><span>Harvard</span>
  </div>
  <p class="accept-note">Individual results vary. Admissions depend on many factors; no outcome is ever guaranteed.</p>
</section>
```
(Reuse the acceptance-strip styles already present from the `/sat` build; add `.accept-row span` pill styling matching `.discount-badge` tone if absent.)

- [ ] **Step 4: Two-doors + tiers section** — two cards (`Foundation Track — Grades 9 & 10` / `Application Track — Grades 11 & 12`), each with a 3-row tier table using the user's verbatim pricing: Foundation $3,500 / $6,000 / $10,500 per year (Essential / Comprehensive / Concierge; renewable annually) and Application $5,500 / $8,500 / $14,500 (Essential / Comprehensive / Concierge; up to 18 months). Include the headline inclusions per tier from the spec's pricing input (session counts, response times, two-consultants-on-Concierge). Every tier row's button = `js-book-cta` anchor to `#book` — **no cart**; the call is the only conversion.

- [ ] **Step 5: Case study section** (anonymized, consented):

```html
<section class="wrap case-study">
  <p class="eyebrow">What the process actually looks like</p>
  <h2>From "no idea where to start" to a plan she's proud of</h2>
  <p>When one of our students started with us, she had a 1000 SAT, two AP
  classes, and no clear direction. Working with her consultant, she rebuilt
  her plan from the ground up: today she's at a 1400, heading into a Stanford
  neurology internship and a New York ecology internship, on track for eight
  AP classes to maximize college credit — and she knows exactly where she's
  going and why.</p>
  <p class="proof-caption">A real IvyPath consulting student, shared with permission. Results vary student to student.</p>
</section>
```

- [ ] **Step 6: Team, FAQ, booking, closing CTA** — team block: two consultants, "2+ years guiding applicants; placements include Brown, CMU, Princeton, Harvard"; FAQ accordion (reuse markup/JS) with these six Q&As verbatim:
1. *Who actually works with my child?* — One of our two dedicated college consultants leads every engagement (both assigned on Concierge). Vicente oversees every family's roadmap.
2. *Is this only for Ivy-bound students?* — No. The goal is the strongest set of real options for your child — the same process applies whether the target list is Ivy League or the best-fit state flagship.
3. *When should we start?* — Grades 9–10: the Foundation Track builds the profile while there's still time to shape it. Grades 11–12: the Application Track runs the cycle itself. Earlier means more room to build; the Application Track exists precisely because senior year still matters.
4. *What happens on the free call?* — A consultant reviews where your child is today, tells you honestly what's strong and what's missing, and sketches the roadmap we'd build. If it's not a fit, you keep the roadmap.
5. *Do you guarantee admission?* — No — and no honest consultant can. We guarantee the process: the sessions, the strategy, and the attention your child's application deserves. Results vary.
6. *Is everything remote?* — Yes, fully remote over Zoom. We work with families nationwide.
Booking section:

```html
<section class="wrap" id="book">
  <h2>Book your free strategy call</h2>
  <p>Free &middot; ~30 minutes &middot; we take a limited number of families each cycle</p>
  <!-- Plain iframe embed on purpose: no third-party script executes in our page
       context (Calendly's widget.js is unversioned, so SRI pinning would break on
       their deploys). The iframe still postMessages calendly.event_scheduled to
       the parent, which Task 4's listener consumes. -->
  <iframe id="calendlyEmbed" title="Book a free strategy call"
    src="CALENDLY_URL_FROM_USER?embed_domain=www.ivypathacademy.com&embed_type=Inline&hide_gdpr_banner=1"
    style="width:100%;min-width:320px;height:700px;border:0;" loading="lazy"></iframe>
</section>
```
(`CALENDLY_URL_FROM_USER` is requested from the user during execution — it is account-specific and cannot be invented; the PR does not merge without it.)

- [ ] **Step 7: vercel.json rewrite** — add to the rewrites array:

```json
{ "source": "/consulting", "destination": "/consulting.html" }
```

- [ ] **Step 8: Verify locally**

```bash
python3 -m http.server 8093 --directory . &
curl -s localhost:8093/consulting.html | grep -c "js-book-cta"   # expect >= 4
curl -s localhost:8093/consulting.html | grep -c "Results vary"  # expect >= 3
curl -s localhost:8093/consulting.html | grep -ci "guarantee admission"  # expect 1 (the FAQ "No")
kill %1
```
Then screenshot desktop+mobile via Playwright MCP and eyeball against `/sat`'s design language.

- [ ] **Step 9: Commit**

```bash
git checkout -b consulting-funnel
git add consulting.html vercel.json && git commit -m "Add /consulting funnel page (two tracks, proof, case study, booking)"
```

---

### Task 4: Booking events (browser)

**Files:**
- Modify: `ivypath-site/consulting.html` (script block before `</body>`)

**Interfaces:**
- Consumes: Calendly widget postMessage API; existing `fbq`/`gtag` globals (guarded).
- Produces: browser events `StrategyCallBooked` (Meta, with `eventID`) and `strategy_call_booked` (GA4); POST to the Task 5 endpoint with `{eventId, sourceUrl}`.

- [ ] **Step 1: Add the listener script** (exact code):

```html
<script>
  /* Strategy-call conversion: fires on Calendly's scheduled event.
     Browser pixel + GA4 + CAPI relay (deduped via shared eventID). */
  (function(){
    var CTA = document.querySelectorAll('.js-book-cta');
    for (var i=0;i<CTA.length;i++){
      CTA[i].addEventListener('click', function(){
        try { if (window.fbq) fbq('trackCustom','ConsultingCTAClick',{content_name:'Consulting Book CTA'}); } catch(e){}
        try { if (window.gtag) gtag('event','consulting_cta_click',{}); } catch(e){}
      });
    }
    window.addEventListener('message', function(e){
      // Exact-hostname origin check (substring matching accepts lookalike origins)
      var oh; try { oh = new URL(e.origin).hostname; } catch (err) { return; }
      if (oh !== 'calendly.com' && oh.slice(-13) !== '.calendly.com') return;
      var d = e.data || {};
      if (d.event !== 'calendly.event_scheduled') return;
      var eid = 'scb-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
      try { if (window.fbq) fbq('trackCustom','StrategyCallBooked',{content_name:'Consulting Strategy Call'},{eventID:eid}); } catch(err){}
      try { if (window.gtag) gtag('event','strategy_call_booked',{}); } catch(err){}
      try {
        fetch('https://app.ivypathacademy.com/api/track/strategy-call-booked', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ eventId: eid, sourceUrl: location.href })
        }).catch(function(){});
      } catch(err){}
    });
  })();
</script>
```

- [ ] **Step 2: Verify with a synthetic message** — serve locally, open via Playwright MCP, run in console:
`window.fbq=function(){window._calls=(window._calls||[]).concat([arguments])};window.postMessage({event:'calendly.event_scheduled'},'*');window._calls.length`
Expected: `_calls` contains a `StrategyCallBooked` entry. (Origin check note: postMessage from same window has origin = page origin, so for the local test temporarily assert by dispatching a MessageEvent with origin `https://calendly.com`: `window.dispatchEvent(new MessageEvent('message',{origin:'https://calendly.com',data:{event:'calendly.event_scheduled'}}))`.)

- [ ] **Step 3: Commit** — `git add consulting.html && git commit -m "Fire StrategyCallBooked (pixel+GA4+CAPI relay) on Calendly booking"`

---

### Task 5: CAPI relay endpoint (platform, TDD)

**Files:**
- Create: `ivypath-platform/src/app/api/track/strategy-call-booked/route.ts`
- Test: `ivypath-platform/src/app/api/track/strategy-call-booked/route.test.ts`

**Interfaces:**
- Consumes: `sendCapiEvent` from `@/lib/meta-capi` (PR #21 signature: `{eventName, eventId, eventSourceUrl?, user:{externalId?, ip?, userAgent?}}`), `checkRateLimit` from `@/lib/rate-limit`.
- Produces: `POST /api/track/strategy-call-booked` accepting `{eventId: string(<=64), sourceUrl?: string}`; CORS-limited to ivypathacademy.com origins; 429 on rate limit; always `{ok:boolean}`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/meta-capi', () => ({ sendCapiEvent: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '1.2.3.4', 'user-agent': 'UA/1.0' }),
}))

import { POST } from './route'
import { sendCapiEvent } from '@/lib/meta-capi'

function req(body: unknown) {
  return new Request('https://app.ivypathacademy.com/api/track/strategy-call-booked', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'https://www.ivypathacademy.com' },
    body: JSON.stringify(body),
  })
}

describe('strategy-call-booked relay', () => {
  beforeEach(() => vi.clearAllMocks())

  it('relays a valid booking to CAPI with external_id = eventId', async () => {
    const res = await POST(req({ eventId: 'scb-abc-123', sourceUrl: 'https://www.ivypathacademy.com/consulting' }) as never)
    expect(res.status).toBe(200)
    expect(sendCapiEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventName: 'StrategyCallBooked',
      eventId: 'scb-abc-123',
      user: expect.objectContaining({ externalId: 'scb-abc-123', ip: '1.2.3.4' }),
    }))
  })

  it('rejects a missing/oversized eventId with 400 and no CAPI call', async () => {
    const res = await POST(req({ eventId: 'x'.repeat(65) }) as never)
    expect(res.status).toBe(400)
    expect(sendCapiEvent).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/app/api/track/strategy-call-booked/route.test.ts` → FAIL (`Cannot find module './route'`).

- [ ] **Step 3: Implement the route**

```ts
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { sendCapiEvent } from '@/lib/meta-capi'
import { checkRateLimit } from '@/lib/rate-limit'

const ORIGINS = new Set(['https://www.ivypathacademy.com', 'https://ivypathacademy.com'])
const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ORIGINS.has(origin) ? origin : 'https://www.ivypathacademy.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
})

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: cors(req.headers.get('origin')) })
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin')
  const h = await headers()
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || null

  const rl = await checkRateLimit([{ key: `scb:ip:${ip ?? 'unknown'}:hour`, max: 10, windowSec: 3600 }])
  if (!rl.ok) return NextResponse.json({ ok: false }, { status: 429, headers: cors(origin) })

  let body: { eventId?: unknown; sourceUrl?: unknown } = {}
  try { body = await req.json() } catch { /* fall through to 400 */ }
  const eventId = typeof body.eventId === 'string' && body.eventId.length > 0 && body.eventId.length <= 64
    ? body.eventId : null
  if (!eventId) return NextResponse.json({ ok: false }, { status: 400, headers: cors(origin) })

  await sendCapiEvent({
    eventName: 'StrategyCallBooked',
    eventId,
    eventSourceUrl: typeof body.sourceUrl === 'string' ? body.sourceUrl.slice(0, 300) : 'https://www.ivypathacademy.com/consulting',
    user: { externalId: eventId, ip, userAgent: h.get('user-agent') },
  }).catch(() => {})

  return NextResponse.json({ ok: true }, { headers: cors(origin) })
}
```

- [ ] **Step 4: Run tests** — same command → 2 passed.
- [ ] **Step 5: Commit + PR** — branch `strategy-call-relay`, commit `feat: CAPI relay for StrategyCallBooked (consulting funnel)`, push, open PR on `Maxblade1234/ivypath-platform` (curl pattern from PR #21), user gate to merge.

---

### Task 6: Meta + GA4 configuration

**Files:** none (platform configs + one API call)

**Interfaces:**
- Produces: custom conversions `Strategy Call Booked` (from `StrategyCallBooked`) and `Consulting VSL Watched` (from `VSLPlay` + URL contains `/consulting`); GA4 key events `strategy_call_booked`, `consulting_cta_click`; WCA `Website — Consulting visitors (180d)`. Task 12's ad set consumes the `Strategy Call Booked` custom-conversion id.

- [ ] **Step 1 (Claude, API): create the consulting-visitors audience** via `ads_create_custom_audience`, subtype WEBSITE, name `Website — Consulting visitors (180d)`, rule:
`{"inclusions":{"operator":"or","rules":[{"event_sources":[{"type":"pixel","id":"1550873539731081"}],"retention_seconds":15552000,"filter":{"operator":"and","filters":[{"field":"url","operator":"i_contains","value":"/consulting"}]},"template":"VISITORS_BY_URL"}]}}`
Verify with `ads_get_ad_account_custom_audiences` (new id present).

- [ ] **Step 2 (User, Events Manager UI — same flow as "VSL Watched"):** create custom conversion **`Strategy Call Booked`** — event `StrategyCallBooked`, no URL rule. Create **`Consulting VSL Watched`** — event `VSLPlay`, URL contains `/consulting`. Claude verifies both via `ads_get_customconversions` and records their ids in the plan-execution notes.

- [ ] **Step 3 (User, GA4 UI):** star `strategy_call_booked` and `consulting_cta_click` as key events (Admin → Data display → Events, after first fire; if not yet listed, do post-launch day 1).

---

### Task 7: Deploy + live beacon verification

- [ ] **Step 1:** Push `consulting-funnel`, open PR (title `Consulting funnel: /consulting page + booking events`), confirm Vercel preview builds, review preview visually.
- [ ] **Step 2 (user gate):** user supplies the Calendly URL (replaces `CALENDLY_URL_FROM_USER`), approves preview → merge (squash, API PUT as before).
- [ ] **Step 3: Live checks:**

```bash
curl -s -o /dev/null -w "%{http_code}" https://www.ivypathacademy.com/consulting   # 200
curl -s https://www.ivypathacademy.com/consulting | grep -c "js-book-cta"          # >=4
```
Playwright MCP on the live page: assert `fbq` loaded, `PageView` + `ViewContent` beacons fire (network filter `facebook.com/tr`), synthetic `MessageEvent` (origin `https://calendly.com`) produces a `StrategyCallBooked` beacon and a POST to `/api/track/strategy-call-booked` returning 200. Run once with a REAL test booking end-to-end, then cancel the booking and delete the row from the pipeline sheet.

---

### Task 8: Annotation renderer (`annotate.py`)

**Files:**
- Create: `VSL-Editing/annotate.py`

**Interfaces:**
- Produces: `circle_seq(w,h,cx,cy,rx,ry,frames,out_dir,color,width)` and `underline_seq(w,h,x0,x1,y,frames,out_dir,color,width)` — PNG sequences (transparent, brand-gold, hand-drawn wobble) that `consult916.py` overlays via ffmpeg. Draw-on completes at 70% of frames, holds after.

- [ ] **Step 1: Write `annotate.py`**

```python
#!/usr/bin/env python3
# Animated hand-drawn-style annotations (gold, wobbly) as PNG sequences.
# Matches the style-engine's pathDraw aesthetic; deterministic + re-renderable.
import math, os
from PIL import Image, ImageDraw

GOLD = (197, 165, 114, 255)

def _seq(frames, out_dir, render_frame):
    os.makedirs(out_dir, exist_ok=True)
    for f in range(frames):
        prog = min(1.0, (f + 1) / max(1, int(frames * 0.7)))  # draw-on, then hold
        img = render_frame(prog)
        img.save(f"{out_dir}/a_{f:04d}.png")

def circle_seq(w, h, cx, cy, rx, ry, frames, out_dir, color=GOLD, width=9):
    N = 72
    def render(prog):
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        pts = []
        for i in range(int(N * prog) + 1):
            a = -math.pi / 2 + 2 * math.pi * (i / N) * 1.03   # slight overlap
            wob = 1 + 0.02 * math.sin(a * 3 + 1.7)            # hand wobble
            pts.append((cx + rx * wob * math.cos(a), cy + ry * wob * math.sin(a)))
        if len(pts) > 1:
            d.line(pts, fill=color, width=width, joint="curve")
        return img
    _seq(frames, out_dir, render)

def underline_seq(w, h, x0, x1, y, frames, out_dir, color=GOLD, width=10):
    def render(prog):
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        x_end = x0 + (x1 - x0) * prog
        steps = max(2, int((x_end - x0) / 14))
        pts = [(x0 + (x_end - x0) * i / steps, y + 4 * math.sin(i * 1.1)) for i in range(steps + 1)]
        d.line(pts, fill=color, width=width, joint="curve")
        return img
    _seq(frames, out_dir, render)

if __name__ == "__main__":
    circle_seq(1080, 1920, 540, 700, 320, 180, 18, "/tmp/ann_test")
    print("wrote /tmp/ann_test (18 frames)")
```

- [ ] **Step 2: Test render + visual check** — `python3 annotate.py`, then assemble `ffmpeg -framerate 25 -i /tmp/ann_test/a_%04d.png -c:v libx264 -pix_fmt yuv420p /tmp/ann_test.mp4` over a gray background and Read a mid frame: gold ellipse draws on smoothly, wobble visible, no clipping.
- [ ] **Step 3:** No commit (VSL-Editing is outside the git repo) — note completion in execution log.

---

### Task 9: Consulting ad/VSL build (`consult916.py`) — **BLOCKED ON: Vicente's footage + `zenith-ref/BLUEPRINT.md`**

**Files:**
- Create: `VSL-Editing/consult916.py` (pattern: `ad916.py` — sentence-boundary spans, continuous VO, video-only overlays, xfade seams)
- Create: `VSL-Editing/zenith-ref/BLUEPRINT.md` (paste the teardown workflow's blueprint output verbatim when it completes — it defines the timeline/annotation/insert plan this task renders)

**Interfaces:**
- Consumes: `annotate.py` sequences; `align()`/caption/endcard machinery copied from `ad916.py`; footage at `VSL-Editing/consulting/vicente-take.mp4`; proof-doc scans supplied by user (admit letters) + existing platform screenshots.
- Produces: `consulting/ad-consulting-9x16.mp4` (~100–115s primary), 60s + 30s cutdowns, poster jpg, and a 16:9 master for the `/consulting` page hero (`ivypath-site/assets/ivypath-consulting-vsl.mp4`, LFS).

- [ ] **Step 1:** Transcribe Vicente's chosen take: `~/.local/bin/uvx --from mlx-whisper mlx_whisper consulting/vicente-take.mp4 --model mlx-community/whisper-base-mlx --word-timestamps True --output-format json --output-dir consulting/` → confirm word count ≈ script.
- [ ] **Step 2:** Build `consult916.py` by copying `ad916.py` and changing: `EL` = the Task 1 script text (verbatim); `CROP_X` recomputed from a probe frame of Vicente's framing; span table + overlay table transcribed from `BLUEPRINT.md`'s numbered timeline (each row: span start/end on sentence boundaries via the printed sentence map, overlay asset, overlay window, caption). Annotation overlays enter as PNG-sequence inputs: `-framerate 25 -i ann/<name>/a_%04d.png` with `overlay=enable='between(t,S,E)'` and `setpts=PTS+S/TB`, mirroring the b-roll branch (mp4 branch) of `ad916.py`, NOT the looped-image branch.
- [ ] **Step 3:** Render → probe frames at every span boundary, every annotation window midpoint, and the endcard; Read each; fix; re-render.
- [ ] **Step 4:** Run the adversarial QC workflow (reuse `reels-ad-qc` script shape: per-ad frame QC at 0.5s + seam-tight frames → skeptic verify per defect). Ship only on 0 confirmed defects.
- [ ] **Step 5:** Cutdowns per BLUEPRINT §6 (60s: drop problem-depth; 30s: hook→proof→CTA), same QC-lite (probe frames at seams). Copy final files to `~/Desktop/IvyPath-Consulting-Ads/` and the 16:9 master into `ivypath-site/assets/` (LFS commit on `consulting-funnel` or follow-up PR with the real poster).

---

### Task 10: Higgsfield b-roll (only what BLUEPRINT §4 calls for)

**Interfaces:**
- Consumes: BLUEPRINT §4 shot list (generative shots only — e.g., campus walkway push-in, essay-draft closeup, admissions-desk still).
- Produces: ~3 × 5s clips in `VSL-Editing/consulting/broll/` consumed by Task 9's overlay table.

- [ ] **Step 1:** For each listed shot: `generate_image` (model `soul_2`, 9:16, prompt from BLUEPRINT verbatim + "muted film look, natural light, no text, no faces") → pick best → `generate_video` (`kling3_0_turbo`, image-to-video, slow push-in, 5s).
- [ ] **Step 2:** Verify: extract 3 frames per clip, Read them — reject anything with warped text/faces/AI-gloss (the user has rejected glossy AI looks before); regenerate or drop. B-roll is optional garnish: if a shot can't pass, the edit ships without it.

---

### Task 11: Engine 1 consolidation (ops; paused → user gate)

**Interfaces:**
- Consumes: custom conversion `1416768190289583` (VSL Watched); existing QC'd creatives.
- Produces: new campaign `IvyPath — TestPrep (VSL Watched CBO)` with ONE ad set replacing both `DiagStart v2` ad sets.

- [ ] **Step 1:** `ads_create_campaign`: objective `OUTCOME_LEADS`, buying AUCTION, name `IvyPath — TestPrep (VSL Watched CBO)`, `campaign_daily_budget` 2700 (cents), status PAUSED.
- [ ] **Step 2:** `ads_create_ad_set`: name `TestPrep — NYC parents 35-54 (VSL Watched)`, `optimization_goal` OFFSITE_CONVERSIONS, `billing_event` IMPRESSIONS, `promoted_object` `{"pixel_id":"1550873539731081","custom_conversion_id":"1416768190289583"}`, `attribution_spec` `[{"event_type":"CLICK_THROUGH","window_days":7},{"event_type":"VIEW_THROUGH","window_days":1}]`, targeting `{"geo_locations":{"cities":[{"key":"2490299","radius":25,"distance_unit":"mile"}],"location_types":["home","recent"]},"age_min":35,"age_max":54,"publisher_platforms":["facebook","instagram"],"targeting_automation":{"advantage_audience":0}}`.
- [ ] **Step 3:** Ads: attempt via `ads_create_creative`/`ads_create_ad` referencing uploaded video ids (`ads_get_ad_videos` after user uploads `ad-sat-9x16.mp4` + `ad-shsat-9x16.mp4` in Ads Manager media library, if no MCP upload path) + the Stuyvesant static. Primary text = the existing winning framings; link `/sat` and `/shsat` with `utm_source=facebook&utm_medium=paid&utm_campaign=testprep-vslwatched&utm_content=<creative>`. If creative creation via API is blocked, document the exact 5-minute UI fallback for the user (all settings above, written out).
- [ ] **Step 4 (user gate):** user approves in Ads Manager → Claude activates new campaign (`ads_activate_entity`) and pauses `SAT — DiagStart v2` (`120253305773310119`) + `SHSAT — DiagStart v2` (`120253305776450119`) via `ads_update_entity` status PAUSED. Never both systems live > 1 day.

---

### Task 12: Consulting campaign (ops; paused → user gate) — **BLOCKED ON Tasks 7, 9**

**Interfaces:**
- Consumes: `Strategy Call Booked` custom-conversion id (Task 6); consulting ad cuts (Task 9); live `/consulting` (Task 7).
- Produces: campaign `IvyPath — Consulting (Strategy Calls)`, CBO $22/day, one cold ad set, 3–4 ads.

- [ ] **Step 1:** Campaign: `OUTCOME_LEADS`, CBO `campaign_daily_budget` 2200, PAUSED.
- [ ] **Step 2:** Cold ad set `Consulting — NYC metro+commuter parents 40-55`: optimization OFFSITE_CONVERSIONS on the `Strategy Call Booked` custom conversion; targeting `{"geo_locations":{"cities":[{"key":"2490299","radius":40,"distance_unit":"mile"}],"location_types":["home"]},"age_min":40,"age_max":55,"publisher_platforms":["facebook","instagram"],"targeting_automation":{"advantage_audience":0}}`; attribution 7d/1d as above. Fallback rule (spec §4): if <50% of daily budget delivers on 2 consecutive days → switch optimization to LANDING_PAGE_VIEWS, revert at ~15–20 bookings.
- [ ] **Step 3:** Ads (link `https://www.ivypathacademy.com/consulting?utm_source=facebook&utm_medium=paid&utm_campaign=consulting-cold&utm_content=<creative>`):
  - `vsl-a` (primary cut) + Primary Text A: *"Most families start thinking seriously about college applications in senior year. That's exactly why so many strong students end up with the same application as everyone else. The students who stand out — the ones admissions officers remember — built their profile in 9th, 10th, and 11th grade. The projects, the internships, the story. By senior fall, it's packaging, not building. Our consultants have helped students earn admission to Brown, Carnegie Mellon, Princeton, and Harvard. One student we work with went from a 1000 SAT and no direction to a 1400, a Stanford neurology internship, and a clear plan she's proud of. (Results vary — but the process is the same.) Book a free strategy call: an honest read on where your child stands, what's missing, and the roadmap we'd build. No pressure. We take a limited number of families each cycle. 👉 Book your free strategy call"*
  - `vsl-b` (60s cut) + Primary Text B: *"Here's exactly what happens on our free strategy call (and what doesn't). What happens: a college consultant — not a salesperson — reviews where your student is today: courses, activities, direction. You get an honest read on what's strong, what's missing for the schools you're aiming at, and a sketch of the roadmap we'd build for grades 9–12. What doesn't: no scripts, no pressure, no 'sign now' pitch. If it's not a fit, you keep the roadmap. Our consultants have helped students earn admission to Brown, Carnegie Mellon, Princeton, and Harvard. Results vary student to student — that's exactly why the call starts with your child, not a package. We take a limited number of families each cycle. Tap below to book."*
  - `proof-static` (admits card) + Text A; `story-static` (transformation card) + Text B.
  Headline all: `Book a free strategy call`. CTA button: `Book Now`.
- [ ] **Step 4 (user gate):** review paused → activate. Log launch date in the execution notes; Gate 1 review = launch + 14 days.

---

### Task 13: Warm/retargeting ad set (trigger: any website audience ≥100)

- [ ] **Step 1:** Check sizes via `ads_get_ad_account_custom_audiences` (this is the recurring "flip-on" check, every 2–3 days).
- [ ] **Step 2:** When triggered: add ad set `Consulting — Warm (site + VSL viewers)` to the consulting campaign: custom_audiences = [all-visitors `120253401292620119`, VSL players `120253401307560119`, CTA clickers `120253401309240119`, consulting visitors (Task 6 id)], NO age/geo narrowing beyond US, optimization `Strategy Call Booked`, same attribution. Ads: reuse Task 12 creatives. Paused → user gate → active.

---

### Task 14: Gate reviews + persistence

- [ ] **Step 1:** Schedule a one-shot reminder (CronCreate) for launch+3 days: pull `StrategyCallBooked` count, CPL, delivery %, VSL-Watched volume on Engine 1; report vs the spec §4 gate table. Repeat pattern at Gate 1 (day 14).
- [ ] **Step 2:** Update memory `ivypath-funnel-project.md`: campaign/ad-set/custom-conversion ids, launch dates, gate dates, blueprint location.
- [ ] **Step 3:** Weekly: reconcile pipeline sheet stages against Meta-reported bookings (booked-in-sheet vs StrategyCallBooked count); flag divergence >20%.

---

## Self-Review

**Spec coverage:** Engine 1 consolidation → T11; page → T3–4; VSL per blueprint → T8–10; StrategyCallBooked browser+CAPI → T4–5; custom conversions/GA4/audience → T6; deploy+verify → T7; campaign+gates → T12–14; pipeline sheet → T2; script/shot list → T1. Spec §8 out-of-scope items are absent from the plan ✓.
**Placeholders:** `CALENDLY_URL_FROM_USER` and BLUEPRINT.md are declared external inputs with explicit user/workflow sources and gates — not TBDs. Poster placeholder is explicitly replaced by T9. No other placeholder patterns present.
**Type consistency:** `sendCapiEvent` signature in T5 matches `meta-capi.ts` (PR #21); event names consistent (`StrategyCallBooked`/`strategy_call_booked`/`ConsultingCTAClick`/`consulting_cta_click`); audience/custom-conversion ids match session records; `js-book-cta` used consistently in T3/T4/T7.
