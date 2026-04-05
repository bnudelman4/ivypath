# IvyPath Multi-Page Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the IvyPath Academy single-scroll site into separate pages (Results, Method, Testimonials, FAQ) while keeping the current green/gold aesthetic, and add Chinese equivalents for all new pages.

**Architecture:** Pure static HTML/CSS/JS — no build tools. Each page is a standalone .html file sharing style.css and script.js. Nav and footer HTML are duplicated across files (existing pattern from about.html). New page-specific CSS classes are added to style.css.

**Tech Stack:** HTML5, CSS3 (custom properties), vanilla JavaScript, Google Fonts (Inter, Playfair Display)

**Spec:** `docs/superpowers/specs/2026-03-23-multi-page-restructure-design.md`

---

## File Structure

### Modified Files
- `style.css` — Add new page-specific styles (.page-hero, .results-gallery, .score-bars, .timeline, etc.), migrate inline consulting styles, bump to v=4
- `script.js` — Remove carousel code (lines 135-148)
- `index.html` — Remove carousel/sections, center hero, update nav/footer
- `cn.html` — Same changes as index.html (Chinese)
- `about.html` — Update nav/footer links only
- `cn-about.html` — Update nav/footer links only
- `book.html` — Update nav/footer links only

### New Files
- `results.html` — English results page
- `cn-results.html` — Chinese results page
- `method.html` — English method page
- `cn-method.html` — Chinese method page
- `testimonials.html` — English testimonials page
- `cn-testimonials.html` — Chinese testimonials page
- `faq.html` — English FAQ page
- `cn-faq.html` — Chinese FAQ page
- `cn-book.html` — Chinese booking page

---

## Task 1: CSS Foundation — Add all new page styles to style.css

**Files:**
- Modify: `style.css` (append new styles at end, ~line 2412+)

This task adds all CSS needed by the new pages before any HTML is created. It also migrates the inline consulting card styles from index.html's `<style>` block.

- [ ] **Step 1: Migrate consulting card styles into style.css**

Append the consulting card styles (currently inline in index.html `<style>` tag, lines 13-33) to the end of style.css. Copy them exactly as-is including the media query.

- [ ] **Step 2: Add `.page-hero` styles for inner page hero banners**

Append to style.css:
```css
/* ===== Inner Page Styles ===== */

.page-hero {
  background: var(--primary-dark);
  padding: 140px 0 80px;
  text-align: center;
}
.page-hero-label {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 20px;
}
.page-hero-title {
  font-family: 'Playfair Display', serif;
  font-size: 3.2rem;
  font-weight: 700;
  color: white;
  margin-bottom: 16px;
  line-height: 1.2;
}
.page-hero-subtitle {
  font-size: 1.1rem;
  color: rgba(255,255,255,0.7);
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
}

@media (max-width: 768px) {
  .page-hero { padding: 120px 0 60px; }
  .page-hero-title { font-size: 2.2rem; }
}
```

- [ ] **Step 3: Add `.hero-stat` styles for single centered metric on main page**

```css
/* Single hero stat */
.hero-stat-section {
  padding: 0;
}
.hero-stat {
  text-align: center;
  max-width: 400px;
  margin: 0 auto;
  padding: 60px 0;
}
.hero-stat .stat-number {
  font-size: 4rem;
  font-weight: 800;
  color: var(--primary);
}
.hero-stat .stat-suffix {
  font-size: 2.5rem;
  font-weight: 800;
  color: var(--primary);
}
.hero-stat p {
  font-size: 1rem;
  color: var(--text-light);
  margin-top: 8px;
  letter-spacing: 1px;
  text-transform: uppercase;
  font-weight: 600;
}
```

- [ ] **Step 4: Add `.hero-centered` style override for centered hero layout**

```css
/* Centered hero (no carousel) */
.hero-split.hero-centered {
  display: block;
  text-align: center;
  max-width: 800px;
  margin: 0 auto;
}
.hero-centered .hero-left {
  max-width: 100%;
}
.hero-centered .hero-ctas {
  justify-content: center;
}
```

- [ ] **Step 5: Add results page styles**

```css
/* ===== Results Page ===== */
.results-gallery {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  padding: 80px 0;
}
.results-gallery-card {
  aspect-ratio: 4/3;
  border: 2px dashed var(--border);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-alt);
  color: var(--text-lighter);
  font-size: 0.9rem;
  font-weight: 600;
  transition: var(--transition);
}
.results-gallery-card img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--radius-lg);
}

.score-bars {
  max-width: 800px;
  margin: 0 auto;
  padding: 60px 0;
}
.score-bar-group {
  margin-bottom: 32px;
}
.score-bar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.score-bar-label {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--text);
}
.score-bar-delta {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 1px;
}
.score-bar-track {
  height: 28px;
  background: #e8e8e8;
  border-radius: 14px;
  margin-bottom: 4px;
  overflow: hidden;
}
.score-bar-fill {
  height: 100%;
  border-radius: 14px;
  background: var(--accent);
}
.score-bar-before {
  background: #c0c0c0;
}
.score-bar-values {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  color: var(--text-lighter);
  font-weight: 500;
}

.ap-table {
  width: 100%;
  border-collapse: collapse;
  max-width: 800px;
  margin: 0 auto;
}
.ap-table thead th {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-light);
  padding: 16px 20px;
  text-align: left;
  border-bottom: 2px solid var(--border);
}
.ap-table tbody td {
  padding: 18px 20px;
  font-size: 0.95rem;
  color: var(--text);
  border-bottom: 1px solid var(--border);
}
.ap-table tbody tr:last-child td { border-bottom: none; }
.ap-table .ap-score {
  font-weight: 700;
  color: var(--accent);
  font-size: 1.05rem;
}

.trajectory-chart {
  max-width: 800px;
  margin: 0 auto;
  background: white;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 32px;
}
.trajectory-chart svg {
  width: 100%;
  height: auto;
}

@media (max-width: 768px) {
  .results-gallery { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 480px) {
  .results-gallery { grid-template-columns: 1fr; }
}
```

- [ ] **Step 6: Add method page styles**

```css
/* ===== Method Page ===== */
.timeline {
  max-width: 800px;
  margin: 0 auto;
  padding: 80px 0;
  position: relative;
}
.timeline::before {
  content: '';
  position: absolute;
  left: 32px;
  top: 80px;
  bottom: 80px;
  width: 2px;
  background: var(--border);
}
.timeline-step {
  display: flex;
  gap: 32px;
  margin-bottom: 48px;
  position: relative;
}
.timeline-number {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 2px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--primary);
  background: white;
  flex-shrink: 0;
  z-index: 1;
}
.timeline-card {
  flex: 1;
  background: white;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 32px;
}
.timeline-card h3 {
  font-family: 'Playfair Display', serif;
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--primary-dark);
  margin-bottom: 12px;
}
.timeline-card p {
  color: var(--text);
  line-height: 1.7;
  margin-bottom: 20px;
}
.timeline-bullets {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 24px;
}
.timeline-bullets li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  color: var(--text);
}
.timeline-bullets li::before {
  content: '\2713';
  font-weight: 700;
  color: var(--primary);
  font-size: 0.85rem;
}

.comparison-table {
  width: 100%;
  border-collapse: collapse;
  max-width: 800px;
  margin: 0 auto;
}
.comparison-table thead th {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-light);
  padding: 16px 20px;
  text-align: left;
  border-bottom: 2px solid var(--border);
}
.comparison-table tbody td {
  padding: 18px 20px;
  font-size: 0.95rem;
  border-bottom: 1px solid var(--border);
}
.comparison-table .col-ivypath {
  color: var(--primary);
  font-weight: 600;
}
.comparison-table .col-others {
  color: var(--text-lighter);
}

.subject-group {
  margin-bottom: 24px;
}
.subject-group h4 {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--text-light);
  margin-bottom: 12px;
}
.subject-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.subject-pill {
  background: var(--bg-alt);
  color: var(--primary);
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 500;
}

@media (max-width: 768px) {
  .timeline::before { left: 24px; }
  .timeline-number { width: 48px; height: 48px; font-size: 0.8rem; }
  .timeline-bullets { grid-template-columns: 1fr; }
  .timeline-card { padding: 24px; }
}
```

- [ ] **Step 7: Add testimonials page and FAQ page styles**

```css
/* ===== Testimonials Page ===== */
.testimonial-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  padding: 80px 0;
}
.score-results-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  padding: 0 0 80px;
}

@media (max-width: 768px) {
  .testimonial-grid { grid-template-columns: 1fr; }
  .score-results-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 480px) {
  .score-results-grid { grid-template-columns: 1fr; }
}

/* ===== Page section utilities ===== */
.page-section {
  padding: 80px 0;
}
.page-section-alt {
  padding: 80px 0;
  background: var(--bg-alt);
}
.page-section-dark {
  padding: 80px 0;
  background: var(--primary-dark);
  color: white;
}
.page-cta {
  text-align: center;
  padding: 80px 0;
  background: var(--primary-dark);
}
.page-cta h2 {
  font-family: 'Playfair Display', serif;
  font-size: 2.4rem;
  color: white;
  margin-bottom: 16px;
}
.page-cta p {
  color: rgba(255,255,255,0.7);
  max-width: 600px;
  margin: 0 auto 32px;
  line-height: 1.6;
}
.page-cta .btn {
  display: inline-block;
}
```

- [ ] **Step 8: Verify CSS loads without errors**

Open `http://localhost:8080` in preview, check console for CSS errors. Visual check that existing pages still look correct.

- [ ] **Step 9: Commit**

```
git add style.css
git commit -m "feat: add CSS foundation for new page layouts"
```

---

## Task 2: Update script.js — Remove carousel code

**Files:**
- Modify: `script.js` (lines 135-148)

- [ ] **Step 1: Remove the hero carousel block from script.js**

Delete lines 135-148 (the `// --- Hero card carousel ---` section):
```js
  // --- Hero card carousel ---
  const carousel = document.getElementById('heroCarousel');
  if (carousel) {
    const cards = carousel.querySelectorAll('.hero-card');
    let currentCard = 0;

    function rotateCard() {
      cards[currentCard].classList.remove('active');
      currentCard = (currentCard + 1) % cards.length;
      cards[currentCard].classList.add('active');
    }

    setInterval(rotateCard, 3000);
  }
```

- [ ] **Step 2: Verify script.js still works**

Open `http://localhost:8080` in preview. Check: scroll reveal, navbar scroll effect, mobile menu, FAQ accordion, pricing tabs, counter animation all still work. Console should have no JS errors.

- [ ] **Step 3: Commit**

```
git add script.js
git commit -m "refactor: remove hero carousel code from script.js"
```

---

## Task 3: Update index.html — Restructure main page

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Remove the inline `<style>` block**

Delete the entire `<style>...</style>` block (lines 12-34, including the opening `<style>` tag on line 12 and closing `</style>` on line 34) from the `<head>` — those consulting card styles are now in style.css.

- [ ] **Step 2: Update stylesheet link version**

Change `style.css?v=3` to `style.css?v=4` in the `<link>` tag.

- [ ] **Step 3: Update the nav links**

Replace the `<ul class="nav-links">` (lines 43-50) with:
```html
<ul class="nav-links" id="navLinks">
  <li><a href="results.html">Results</a></li>
  <li><a href="method.html">Method</a></li>
  <li><a href="about.html">About Us</a></li>
  <li><a href="testimonials.html">Testimonials</a></li>
  <li><a href="faq.html">FAQ</a></li>
</ul>
```

- [ ] **Step 4: Update the CTA button text**

Change `class="nav-cta">Get Started</a>` to `class="nav-cta">Book Consultation</a>`.

- [ ] **Step 5: Center the hero and remove carousel**

Replace the entire `.hero-split` div (lines 66-120) with:
```html
<div class="container hero-split hero-centered">
  <div class="hero-left">
    <h1 class="hero-title reveal">
      <em class="hero-italic">The smartest investment</em>
      in your child's
      <span class="highlight">future.</span>
    </h1>
    <p class="hero-subtitle reveal">
      Expert SAT, SHSAT, and AP tutoring from Ivy League mentors who scored in the 99th percentile. Every dollar you invest today compounds into opportunities that last a lifetime.
    </p>
    <div class="hero-ctas reveal">
      <a href="book.html" class="btn btn-primary">Book Free Consultation</a>
      <a href="#services" class="btn btn-secondary-light">Explore Services</a>
    </div>
  </div>
</div>
```

- [ ] **Step 6: Add single metric after hero section (before marquee)**

After the closing `</section>` of the hero (line ~121) and before the `<!-- School Logo Marquee -->` comment, insert:
```html
<!-- Single Stat Metric -->
<section class="hero-stat-section">
  <div class="container">
    <div class="hero-stat reveal">
      <span class="stat-number" data-target="200">0</span><span class="stat-suffix">pt</span>
      <p>Avg. SAT Improvement</p>
    </div>
  </div>
</section>
```

Note: The outer section uses `.hero-stat-section` (not `.hero-stat`) to avoid double-nesting the same class.

- [ ] **Step 7: Remove sections that moved to their own pages**

Delete these entire sections from index.html:
1. About Teaser section (`<!-- About Teaser -->` through its closing `</section>`, lines 230-240)
2. Stats Bar section (`<!-- Stats Bar -->` through its closing `</section>`, lines 242-264)
3. How It Works / Process section (`<!-- How It Works -->` through its closing `</section>`, lines 266-294)
4. X-Shaped Stats Marquee section (`<!-- X-Shaped Stats Marquee -->` through its closing `</section>`, lines 296-340)
5. Testimonials section (`<!-- Testimonials / Success Feed -->` through its closing `</section>`, lines 418-557)
6. FAQ section (`<!-- FAQ -->` through its closing `</section>`, lines 559-623)

Keep: Marquee (logos), Packages, Pricing, CTA, Footer.

- [ ] **Step 8: Update footer links**

Replace the entire `.footer-grid` contents (lines 642-685) with:
```html
<div class="footer-grid">
  <div class="footer-brand">
    <div class="nav-logo">
      <img src="assets/logo-transparent.png" alt="IvyPath Academy" class="nav-logo-img">
    </div>
    <p>Premium tutoring and admissions consulting from Ivy League student tutors in New York City.</p>
    <div class="footer-social">
      <a href="#" aria-label="Instagram">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>
      </a>
      <a href="#" aria-label="LinkedIn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>
      </a>
      <a href="#" aria-label="Email">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
      </a>
    </div>
  </div>
  <div class="footer-links">
    <h4>Pages</h4>
    <ul>
      <li><a href="results.html">Results</a></li>
      <li><a href="method.html">Method</a></li>
      <li><a href="about.html">About Us</a></li>
      <li><a href="testimonials.html">Testimonials</a></li>
      <li><a href="faq.html">FAQ</a></li>
      <li><a href="#pricing">Pricing</a></li>
    </ul>
  </div>
  <div class="footer-links">
    <h4>Contact</h4>

**IMPORTANT:** On index.html (and cn.html), the Pricing link uses `href="#pricing"`. On ALL other pages (results.html, method.html, about.html, testimonials.html, faq.html, book.html, and all cn-* equivalents), the Pricing link must use `href="index.html#pricing"` (or `href="cn.html#pricing"` for Chinese pages) since the `#pricing` section only exists on the main page.
    <ul>
      <li><a href="mailto:ivypathacademy@gmail.com">ivypathacademy@gmail.com</a></li>
      <li><a href="tel:+19293940349">(929) 394-0349</a></li>
      <li><span>New York, NY</span></li>
    </ul>
  </div>
</div>
```

- [ ] **Step 9: Preview and verify main page**

Open `http://localhost:8080` in preview. Verify:
- Hero is centered (no carousel)
- Single "200pt" metric is visible and animates
- University logos marquee scrolls
- Service packages display correctly
- Pricing tabs work (test prep, academic, consulting)
- CTA section and footer render correctly
- Nav links point to new page filenames
- No JS console errors

- [ ] **Step 10: Commit**

```
git add index.html
git commit -m "feat: restructure index.html — center hero, remove carousel, update nav"
```

---

## Task 4: Create results.html

**Files:**
- Create: `results.html`

- [ ] **Step 1: Create results.html**

Create the full file with: head (meta tags from spec), nav (same as updated index.html), page-hero, results gallery (6 placeholder cards), before/after score bars, AP performance table, 24-week trajectory SVG chart, CTA, footer, script.js include.

Key content for each section:

**Page hero:**
- Label: "PROVEN EXCELLENCE"
- Title: "Results That Speak for Themselves"
- Subtitle: "Our data-driven approach delivers measurable, transformative outcomes for every student."

**Gallery:** 6 `.results-gallery-card` divs with text "Add Image" inside.

**Score bars:** Three `.score-bar-group` divs for Reading & Writing (520→740, +220), Math (510→760, +250), Total (1030→1500, +470). Use percentage widths: Before bars = (value/1600)*100%, After bars = (value/1600)*100%.

**AP Table:** 5 rows: Calculus AB/BC (96%, 4.7), Biology (93%, 4.5), Chemistry (91%, 4.4), Physics C (94%, 4.6), English Literature (95%, 4.5).

**SVG Chart:** viewBox="0 0 800 400". Y-axis: 1000-1600 (map to y=350 to y=50). X-axis: W0-W24 at x=80,200,320,440,560,680,800 (adjusted for margins). Data points: W0=1030, W4=1120, W8=1250, W12=1350, W16=1430, W20=1480, W24=1500. Use `<path>` with smooth bezier. Gold circles at each point.

**CTA:** "Your Results Are Next" + button to book.html.

- [ ] **Step 2: Preview results.html**

Open `http://localhost:8080/results.html`. Verify all sections render, placeholders show, bars have correct proportions, SVG chart displays, nav and footer links work.

- [ ] **Step 3: Commit**

```
git add results.html
git commit -m "feat: create results.html with gallery, score bars, AP table, trajectory chart"
```

---

## Task 5: Create method.html

**Files:**
- Create: `method.html`

- [ ] **Step 1: Create method.html**

Full file with: head, nav, page-hero, 4-step timeline, comparison table, subjects grid, guarantee accordion, CTA, footer.

**Page hero:**
- Label: "THE IVYPATH METHOD"
- Title: "A System Designed for Breakthroughs"
- Subtitle: "Our proven four-step process turns ambitious students into top-tier scorers."

**Timeline:** 4 `.timeline-step` items with numbered circles (01-04), card with h3, paragraph, and 4 bullets in 2x2 grid. Content exactly as specified in the design spec (Section 2, lines 140-167).

**Comparison table:** 3-column table (Feature, IvyPath, Others) with 7 rows. IvyPath column uses `.col-ivypath`, Others uses `.col-others`.

**Subjects:** 3 `.subject-group` divs (SAT, ACT, AP) each with h4 heading and `.subject-pills` flex container of `.subject-pill` spans.

**Guarantee:** 3 `.faq-item` elements using same classes as main FAQ for JS compatibility. Questions: "What scores are guaranteed?", "What if I don't reach my target?", "Are there conditions?". Answers should be reasonable placeholder text.

**CTA:** "Experience the Method" + button to book.html.

- [ ] **Step 2: Preview method.html**

Open `http://localhost:8080/method.html`. Verify timeline layout, comparison table, subject pills, guarantee accordion (click to expand), nav/footer links.

- [ ] **Step 3: Commit**

```
git add method.html
git commit -m "feat: create method.html with timeline, comparison table, subjects, guarantee"
```

---

## Task 6: Create testimonials.html

**Files:**
- Create: `testimonials.html`

- [ ] **Step 1: Create testimonials.html**

Full file with: head, nav, page-hero, testimonial cards grid, score result cards, CTA, footer.

**Page hero:**
- Label: "SUCCESS STORIES"
- Title: "What Our Families Say"

**Testimonial grid:** Move the text testimonials from index.html into a 2-column `.testimonial-grid`. Use the existing `.feed-card .feed-text` classes for cards. Include these cards (from current index.html):
1. Sarah M. — "From Anxious to Accepted" (SAT Parent)
2. Linda C. — "The Support We Needed" (College Admissions Parent)
3. Ryan P. — "From Application Stress to Ivy League Acceptance" (UPenn '29)
4. Jason L. — "Stuyvesant, Here We Come!" (SHSAT Student)
5. Tom H. — "AP Scores Through the Roof" (AP Calc Parent)

Do NOT include the `.feed-video` cards.

**Score results:** Below testimonials, a `.score-results-grid` (3-column) with the stat cards:
1. David W. — +310 SAT (1190→1500), Harvard '29
2. Aisha N. — 5/5 AP Calculus (3→5)
3. Michelle T. — +280 SAT (1220→1500), Yale '28

Use the existing `.feed-card .feed-stat` classes.

**CTA:** "Ready to Write Your Success Story?" + button to book.html.

- [ ] **Step 2: Preview testimonials.html**

Open `http://localhost:8080/testimonials.html`. Verify 2-column grid, score cards below, all text renders, nav/footer links work.

- [ ] **Step 3: Commit**

```
git add testimonials.html
git commit -m "feat: create testimonials.html with testimonial grid and score results"
```

---

## Task 7: Create faq.html

**Files:**
- Create: `faq.html`

- [ ] **Step 1: Create faq.html**

Full file with: head, nav, page-hero, FAQ accordion, CTA with contact info, footer.

**Page hero:**
- Label: "FREQUENTLY ASKED QUESTIONS"
- Title: "Everything You Need to Know"

**FAQ accordion:** Move all 6 FAQ items from index.html. Use same `.faq-list`, `.faq-item`, `.faq-question`, `.faq-answer` classes so script.js works without changes.

**CTA section:**
- Heading: "Still Have Questions?"
- Button: "Book a Free Consultation" → book.html
- Contact info: ivypathacademy@gmail.com, (929) 394-0349

- [ ] **Step 2: Preview faq.html**

Open `http://localhost:8080/faq.html`. Verify accordion expand/collapse works, all 6 questions are present, CTA links work.

- [ ] **Step 3: Commit**

```
git add faq.html
git commit -m "feat: create faq.html with accordion and contact CTA"
```

---

## Task 8: Update existing pages — about.html, book.html nav/footer

**Files:**
- Modify: `about.html`
- Modify: `book.html`

- [ ] **Step 1: Update about.html nav links**

Replace the `<ul class="nav-links">` in about.html with the same new nav as index.html (Results, Method, About Us, Testimonials, FAQ). Update CTA text to "Book Consultation". Update `style.css?v=3` to `style.css?v=4`. Update the language toggle link from `cn.html` to `cn-about.html`. Update footer to match the new 3-column footer from index.html (with page links pointing to correct files, and `#pricing` link as `index.html#pricing`).

- [ ] **Step 2: Update book.html nav and footer**

Same nav/footer updates as about.html. Change `style.css?v=3` to `style.css?v=4`. Update the language toggle link from `cn.html` to `cn-book.html`.

- [ ] **Step 3: Preview both pages**

Open `http://localhost:8080/about.html` and `http://localhost:8080/book.html`. Verify nav links, footer links, no broken references.

- [ ] **Step 4: Commit**

```
git add about.html book.html
git commit -m "feat: update about.html and book.html nav/footer for new page structure"
```

---

## Task 9: Update cn.html — Chinese main page

**Files:**
- Modify: `cn.html`

- [ ] **Step 1: Apply same structural changes as index.html**

Apply all the same changes from Task 3 to cn.html:
1. Remove inline `<style>` block
2. Update `style.css?v=3` to `style.css?v=4`
3. Update nav links to Chinese page equivalents (cn-results.html, cn-method.html, cn-about.html, cn-testimonials.html, cn-faq.html)
4. Update CTA button to link to `cn-book.html` and text to "预约咨询"
5. Add `hero-centered` class to hero-split, remove hero-right/carousel
6. Add single metric section (200pt, "平均SAT提升")
7. Remove: About Teaser, Stats Bar, How It Works, X-Marquee, Testimonials, FAQ sections
8. Update language toggle from `cn.html` link to `index.html` link
9. Update footer with Chinese page links (成绩, 方法, 关于我们, 学生评价, 常见问题, 价格)

- [ ] **Step 2: Preview cn.html**

Open `http://localhost:8080/cn.html`. Verify centered hero (Chinese text), single metric, services, pricing, nav/footer all correct.

- [ ] **Step 3: Commit**

```
git add cn.html
git commit -m "feat: restructure cn.html — center hero, update nav/footer for Chinese pages"
```

---

## Task 10: Create Chinese page equivalents (cn-results, cn-method, cn-testimonials, cn-faq)

**Files:**
- Create: `cn-results.html`
- Create: `cn-method.html`
- Create: `cn-testimonials.html`
- Create: `cn-faq.html`

- [ ] **Step 1: Create cn-results.html**

Copy results.html as base. Translate all text to Chinese. Update nav to Chinese equivalents. Update language toggle to link to results.html. Update meta title/description per spec. Key translations:
- "PROVEN EXCELLENCE" → "卓越成绩"
- "Results That Speak for Themselves" → "用成绩说话"
- Section headings, labels, CTA text all translated
- Numbers and data stay the same

- [ ] **Step 2: Create cn-method.html**

Copy method.html as base. Translate all text. Key translations:
- "THE IVYPATH METHOD" → "IVYPATH教学方法"
- "A System Designed for Breakthroughs" → "为突破而设计的体系"
- All step titles, descriptions, bullets, comparison table, subject names translated
- Subject names: keep English exam names (SAT, AP, ACT) but translate descriptions

- [ ] **Step 3: Create cn-testimonials.html**

Copy testimonials.html. Translate all testimonial quotes, names can stay in English, role descriptions and CTA translated.

- [ ] **Step 4: Create cn-faq.html**

Copy faq.html. Translate all questions and answers. FAQ content should match the Chinese FAQ that was in cn.html.

- [ ] **Step 5: Preview all Chinese pages**

Open each cn-*.html page. Verify Chinese text renders, nav/footer point to Chinese equivalents, language toggle links to English version.

- [ ] **Step 6: Commit**

```
git add cn-results.html cn-method.html cn-testimonials.html cn-faq.html
git commit -m "feat: create Chinese equivalents for results, method, testimonials, FAQ pages"
```

---

## Task 11: Create cn-book.html — Chinese booking page

**Files:**
- Create: `cn-book.html`
- Modify: `cn-about.html` (nav/footer update)

- [ ] **Step 1: Create cn-book.html**

Copy book.html as base. Translate all text to Chinese:
- Trust badges: "100%免费", "无义务", "15分钟", "个性化指导"
- "What to Expect" → "咨询内容"
- Calendar labels, time slots, confirmation form text
- Stats section
- "What Happens After You Book" steps
- Contact methods
- Nav/footer to Chinese page equivalents
- Language toggle links to book.html

Keep the same calendar JavaScript functionality — the JS in book.html is inline and language-neutral (calendar logic).

- [ ] **Step 2: Update cn-about.html nav/footer**

Update nav links to Chinese page equivalents. Update footer to match new 3-column Chinese footer. Update the stylesheet link — cn-about.html uses `style.css` with NO version query string, so change `style.css` to `style.css?v=4`. Also update the language toggle to link to `about.html`.

- [ ] **Step 3: Preview cn-book.html and cn-about.html**

Open both pages. Verify calendar works on cn-book.html, all text is Chinese, nav/footer links correct.

- [ ] **Step 4: Commit**

```
git add cn-book.html cn-about.html
git commit -m "feat: create cn-book.html and update cn-about.html nav/footer"
```

---

## Task 12: Final verification and cleanup

**Files:**
- All files

- [ ] **Step 1: Test every page link**

Systematically click through all pages via nav:
1. index.html → each nav link (Results, Method, About Us, Testimonials, FAQ, Book Consultation)
2. From each page, click back to other pages
3. Test footer links on each page
4. Test language toggle on each page (EN ↔ CN)
5. Test mobile menu on one page

- [ ] **Step 2: Verify responsive design**

Preview at 768px and 480px widths. Check:
- Main page hero centering
- Results gallery grid collapse
- Method timeline on mobile
- Testimonial grid collapse to single column
- FAQ accordion on mobile

- [ ] **Step 3: Check for console errors**

Open each page and check browser console. There should be zero JS errors. The only expected console item is the counter animation on pages without `.stat-number` elements (should silently do nothing).

- [ ] **Step 4: Final commit**

```
git add -A
git commit -m "chore: final verification pass — all pages tested and working"
```
