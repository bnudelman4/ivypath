# IvyPath Academy — Multi-Page Restructure Design

**Date:** 2026-03-23
**Status:** Approved
**Approach:** Multi-file static HTML (Option A)

---

## Overview

Restructure the IvyPath Academy site from a single long-scroll page into separate dedicated pages. Remove the animated hero card carousel, center the main page hero text, and create new pages for Results, Method, Testimonials, and FAQ. Add a Chinese booking page. Update navigation and footer across all pages.

## Current State

- **index.html** — Single-scroll English landing page with hero carousel, university logos, services, stats, how-it-works, pricing, testimonials, FAQ, footer
- **cn.html** — Chinese equivalent of index.html
- **about.html** — English team/about page
- **cn-about.html** — Chinese team/about page
- **book.html** — English booking page with calendar widget
- **style.css** — Main stylesheet (2,412 lines, CSS variables for theming)
- **about.css** — About page styles
- **book.css** — Booking page styles
- **script.js** — Carousel, FAQ accordion, counter animation, nav scroll effects

## File Changes Summary

| Action | File | Description |
|--------|------|-------------|
| Modify | index.html | Remove carousel, center hero, keep one metric + services + pricing |
| Modify | cn.html | Same changes as index.html (Chinese) |
| Modify | about.html | Update nav/footer links |
| Modify | cn-about.html | Update nav/footer links |
| Modify | book.html | Update nav/footer links |
| Modify | style.css | Add styles for new page layouts |
| Modify | script.js | Remove carousel code, keep other functionality |
| Create | results.html | English results page |
| Create | cn-results.html | Chinese results page |
| Create | method.html | English method page |
| Create | cn-method.html | Chinese method page |
| Create | testimonials.html | English testimonials page |
| Create | cn-testimonials.html | Chinese testimonials page |
| Create | faq.html | English FAQ page |
| Create | cn-faq.html | Chinese FAQ page |
| Create | cn-book.html | Chinese booking page |

**Total: 9 new files, 7 modified files**

---

## Page Designs

### 1. Main Page (index.html / cn.html)

**Changes from current:**
- Remove `#heroCarousel` and all `.hero-card` elements from the DOM
- Remove `.hero-right` container entirely. Change `.hero-split` to a centered single-column layout: remove flexbox split, add `text-align: center` and `margin: 0 auto`. `.hero-left` becomes full-width centered (or rename to `.hero-content`).
- Keep one stat metric below hero: "200pt Avg. SAT Improvement" with animated counter. Display as a single centered element (not a 4-item grid) — large number with label beneath, styled consistently with current `.stat-number` but standalone. Wrap in a new `.hero-stat` container with `text-align: center; max-width: 400px; margin: 0 auto`.
- Keep university logos marquee section
- Keep service packages section (`#services`)
- Keep pricing section (`#pricing`) with tabbed interface. Migrate inline `<style>` consulting card styles (`.consulting-*` classes) into style.css.
- **Remove** from main page: About Teaser section (`#about`), X-Marquee stats section, testimonials section, FAQ section, how-it-works/process steps, full stats grid (replaced by the single hero metric)
- Keep CTA section and footer
- Update nav links to point to new separate pages
- Update footer links to point to new separate pages
- Update cn.html CTA button from `href="#contact"` to `href="cn-book.html"`

**Resulting page flow:**
1. Hero (centered headline + subtitle + 2 CTAs)
2. One metric (200pt SAT improvement, animated counter, centered standalone)
3. University logos marquee
4. Service packages (3-card grid)
5. Pricing (tabbed table)
6. CTA section
7. Footer

**Note:** "Services" and "Pricing" are intentionally kept on the main page but removed from the top nav. They are accessible by scrolling or via footer links. The nav prioritizes page-level navigation.

### 2. Results Page (results.html / cn-results.html)

**Modeled on reference site (ivypath-academy.vercel.app/results), adapted to current green/gold aesthetic.**

**Section 1 — Hero banner**
- Dark green background (`--primary-dark`)
- Label: "PROVEN EXCELLENCE" (spaced uppercase, small)
- Heading: "Results That Speak for Themselves" (Playfair Display serif)
- Subtitle: "Our data-driven approach delivers measurable, transformative outcomes for every student."

**Section 2 — Results Screenshots Gallery**
- Placeholder grid for college admissions screenshots and test result screenshots
- Clean card layout with subtle shadows
- 3-column grid on desktop, 2 on tablet, 1 on mobile
- Placeholder cards with dashed borders and "Add Image" indicators
- Easy to swap placeholders with real images later (just replace `src` attributes)

**Section 3 — Before & After Score Transformation**
- Label: "BEFORE & AFTER"
- Heading: "Average Score Transformation"
- Horizontal bar chart (CSS-based, no JS library):
  - Reading & Writing: Before 520 → After 740 (+220 pts)
  - Math: Before 510 → After 760 (+250 pts)
  - Total: Before 1030 → After 1500 (+470 pts)
- Gray bars for "Before", gold (`--accent`) bars for "After"
- Point improvement labels on right side

**Section 4 — AP Performance Table**
- Label: "AP PERFORMANCE"
- Heading: "Subject-by-Subject Excellence"
- Clean table with columns: Subject, Pass Rate, Avg Score
- Rows: AP Calculus AB/BC (96%, 4.7), AP Biology (93%, 4.5), AP Chemistry (91%, 4.4), AP Physics C (94%, 4.6), AP English Literature (95%, 4.5)
- Gold accent on avg score column
- Alternating row backgrounds

**Section 5 — 24-Week Score Trajectory**
- Label: "24-WEEK JOURNEY"
- Heading: "Typical Student Score Trajectory"
- Inline SVG chart, viewBox="0 0 800 400", contained in a card with border
- X-axis labels: W0, W4, W8, W12, W16, W20, W24 (evenly spaced)
- Y-axis labels: 1000, 1200, 1400, 1600
- Gray dashed horizontal gridlines at each Y-axis value
- Gold (`--accent`) `<path>` with smooth bezier curves showing score growth:
  - Data points: W0=1030, W4=1120, W8=1250, W12=1350, W16=1430, W20=1480, W24=1500
  - Slight ease-out curve (rapid early gains, plateau toward end)
- Gold circles at each data point (r=4)
- No animation required — static SVG

**Section 6 — CTA**
- Heading: "Your Results Are Next"
- Subtitle: "Join hundreds of students who have transformed their scores and earned admission to their dream schools."
- Button: "Start Your Transformation" → links to book.html

### 3. Method Page (method.html / cn-method.html)

**Modeled on reference site (ivypath-academy.vercel.app/method), adapted to current green/gold aesthetic.**

**Section 1 — Hero**
- Label: "THE IVYPATH METHOD"
- Heading: "A System Designed for Breakthroughs"
- Subtitle: "Our proven four-step process turns ambitious students into top-tier scorers."

**Section 2 — Four-step timeline**
Vertical timeline layout with numbered circles on left and content cards on right:

1. **Diagnostic Assessment** — "We begin with a comprehensive diagnostic that maps your current abilities across every test section. This isn't a generic placement test — it's a deep analysis that identifies specific knowledge gaps, timing issues, and strategic weaknesses."
   - Full-length proctored practice exam
   - Section-by-section error analysis
   - Cognitive pattern assessment
   - Custom score projection model

2. **Personalized Curriculum Design** — "Using your diagnostic data, we build a curriculum unique to you. Every session, every practice set, and every strategy is calibrated to your specific needs and target score."
   - AI-assisted gap analysis
   - Skill-by-skill priority ranking
   - Adaptive difficulty scaling
   - Weekly milestone planning

3. **Elite 1-on-1 Tutoring** — "Work directly with a 99th-percentile tutor matched to your learning style. Sessions blend content mastery with test strategy, building both knowledge and confidence."
   - 2-3 sessions per week
   - Real-time strategy coaching
   - Homework and drill assignments
   - Progress tracking dashboard

4. **Continuous Optimization** — "Your program evolves as you do. We monitor progress weekly, adjusting focus areas, strategies, and pacing to ensure you're always on the fastest path to your target score."
   - Weekly progress reports
   - Score trajectory analysis
   - Strategy refinement
   - Parent/student check-ins

Each step: numbered circle (01-04), heading, paragraph description, 4 checkmark bullets in 2x2 grid.

**Section 3 — Comparison Table: "IvyPath vs. The Rest"**
- Label: "THE DIFFERENCE"
- Heading: "IvyPath vs. The Rest"
- 3-column table: Feature | IvyPath | Others
- Rows:
  - Class Size: 1-on-1 vs 20-30 students
  - Curriculum: Fully personalized vs One-size-fits-all
  - Tutor Qualifications: 99th percentile, Ivy-educated vs Varies widely
  - Progress Tracking: Weekly data-driven reports vs Periodic practice tests
  - Score Guarantee: Yes, contractual vs Rarely offered
  - Schedule Flexibility: Fully flexible vs Fixed class times
  - Avg SAT Improvement: +320 points vs +50-100 points
- IvyPath column styled in green/gold, Others column in muted gray

**Section 4 — Subjects & Exams Grid**
- Label: "WHAT WE TEACH"
- Heading: "Subjects & Exams"
- Pills grouped under visible subheadings (SAT, ACT, AP) with a flex-wrap layout per group:
  - **SAT:** Reading, Writing, Math
  - **ACT:** English, Math, Science
  - **AP:** Calculus AB, Calculus BC, Statistics, Biology, Chemistry, Physics C, English Lit, English Lang, US History, World History, Computer Science A, Psychology, Environmental Science, Microeconomics
- Each pill: `--bg-alt` background, `--primary` text, rounded corners, padding 8px 16px

**Section 5 — Score Improvement Guarantee**
- Label: "OUR PROMISE"
- Heading: "Score Improvement Guarantee"
- Subtitle: "We're so confident in our method that we guarantee your results — in writing."
- 3 expandable FAQ items:
  - What scores are guaranteed?
  - What if I don't reach my target?
  - Are there conditions?

**Section 6 — CTA**
- Heading: "Experience the Method"
- Subtitle: "Schedule a free consultation to see how our personalized approach can work for you."
- Button: "Book a Free Consultation" → links to book.html

### 4. Testimonials Page (testimonials.html / cn-testimonials.html)

**Section 1 — Hero banner**
- Label: "SUCCESS STORIES"
- Heading: "What Our Families Say"

**Section 2 — Testimonial cards grid**
- Existing testimonial content from index.html moved here
- 2-column grid on desktop, 1 on mobile
- Each card: quote, parent name, role/relationship, student outcome (e.g., "Now at Harvard '29")
- Card styling consistent with current site (white cards, subtle shadow, green accents)

**Section 3 — Score result cards**
- Displayed as a separate row below the testimonial cards grid
- Existing score improvement cards from index.html
- Score displays (e.g., "5/5 AP Calculus Score, Prev: 3 → 5")
- 3-column grid on desktop, 2 on tablet, 1 on mobile
- Video testimonial placeholders (`.feed-video`) from current site are NOT transferred — text-only cards and score cards only

**Section 4 — CTA**
- Heading: "Ready to Write Your Success Story?"
- Button: "Book a Free Consultation" → links to book.html

### 5. FAQ Page (faq.html / cn-faq.html)

**Section 1 — Hero banner**
- Label: "FREQUENTLY ASKED QUESTIONS"
- Heading: "Everything You Need to Know"

**Section 2 — FAQ accordion**
- Same accordion component as current site (click to expand, one open at a time)
- All existing FAQ items from index.html moved here
- Same styling and JS behavior (reuses existing script.js FAQ code)

**Section 3 — CTA**
- Heading: "Still Have Questions?"
- Button: "Book a Free Consultation" → links to book.html
- Direct contact info: email (ivypathacademy@gmail.com) + phone ((929) 394-0349)

### 6. Chinese Booking Page (cn-book.html)

Chinese translation of book.html with identical structure:
- Hero with trust badges (translated to Chinese)
- Two-column layout: testimonial + "What to Expect" (left), calendar widget (right)
- Calendar widget with same functionality (month navigation, time slots, confirmation form)
- Stats section (translated)
- "What Happens After You Book" steps (translated)
- Contact methods (same email/phone)
- Footer (Chinese nav links)

All text translated to match the tone and style of existing cn.html and cn-about.html.

---

## Navigation Structure

### English Nav
```
Results | Method | About Us | Testimonials | FAQ | [Book Consultation]
```

Links: results.html | method.html | about.html | testimonials.html | faq.html | book.html

### Chinese Nav
```
成绩 | 方法 | 关于我们 | 学生评价 | 常见问题 | [预约咨询]
```

Links: cn-results.html | cn-method.html | cn-about.html | cn-testimonials.html | cn-faq.html | cn-book.html

### Language Toggle
- English pages: toggle links to corresponding cn-*.html page
- Chinese pages: toggle links to corresponding English page

---

## Footer Structure (all pages)

3-column layout (reduced from current 4-column):

**Column 1 — Brand:** Logo + tagline + social links (same as current)

**Column 2 — Pages:** Results, Method, About Us, Testimonials, FAQ, Pricing (anchor to index.html#pricing)

**Column 3 — Contact:** ivypathacademy@gmail.com, (929) 394-0349, New York, NY

The current "Services" footer column (SAT/SHSAT/AP/College links) is removed — those sections now live on the main page and are reachable via the "Pricing" footer link.

**Bottom:** © 2026 IvyPath Academy. All rights reserved.

---

## CSS Additions

New styles needed in style.css:
- `.page-hero` — Reusable hero banner for inner pages (dark green bg, centered text, label + heading + subtitle)
- `.results-gallery` — Placeholder grid for screenshots
- `.score-bars` — Before/after horizontal bar chart
- `.ap-table` — AP performance table styling
- `.trajectory-chart` — SVG line chart container
- `.timeline` — Method page vertical timeline with numbered circles
- `.comparison-table` — IvyPath vs Others table
- `.subject-pills` — Tag/pill grid for subjects
- `.guarantee-accordion` — Expandable guarantee FAQ
- `.testimonial-grid` — 2-column testimonial card layout

All new styles use existing CSS variables (`--primary`, `--accent`, `--bg-alt`, etc.) and follow existing patterns (border-radius, shadows, transitions).

---

## Script.js Changes

- Remove hero carousel code (`rotateCard`, `setInterval`, `#heroCarousel` references)
- Keep all other functionality: scroll reveal, navbar scroll, mobile menu, smooth scroll, counter animation, FAQ accordion, pricing tabs, active nav highlighting
- FAQ accordion code is reused on faq.html and method.html (guarantee section). Both use the same `.faq-item` / `.faq-question` / `.faq-answer` classes so the existing JS selector works without changes.

---

## CSS File Loading per Page

| Page | Stylesheets |
|------|-------------|
| index.html, cn.html | style.css |
| about.html, cn-about.html | style.css + about.css |
| book.html, cn-book.html | style.css + book.css |
| results.html, cn-results.html | style.css |
| method.html, cn-method.html | style.css |
| testimonials.html, cn-testimonials.html | style.css |
| faq.html, cn-faq.html | style.css |

All new pages load only style.css (which will contain the new page-specific styles). Bump cache version to `style.css?v=4` on all pages after the restructure.

---

## Page Titles and Meta Descriptions

| Page | Title | Meta Description |
|------|-------|-----------------|
| results.html | IvyPath Academy \| Proven Results | See the measurable outcomes our students achieve — SAT score improvements, AP results, and college admissions success. |
| cn-results.html | IvyPath Academy \| 学生成绩 | 查看我们学生取得的可衡量成果——SAT成绩提升、AP考试结果和大学录取成功案例。 |
| method.html | IvyPath Academy \| Our Method | Our proven four-step process: diagnostic assessment, personalized curriculum, elite 1-on-1 tutoring, and continuous optimization. |
| cn-method.html | IvyPath Academy \| 我们的方法 | 我们经过验证的四步流程：诊断评估、个性化课程、精英一对一辅导和持续优化。 |
| testimonials.html | IvyPath Academy \| Testimonials | Read success stories from families whose students achieved top scores and Ivy League admissions with IvyPath. |
| cn-testimonials.html | IvyPath Academy \| 学生评价 | 阅读学生家庭的成功故事，了解他们如何通过IvyPath取得优异成绩并被常春藤名校录取。 |
| faq.html | IvyPath Academy \| FAQ | Frequently asked questions about IvyPath Academy's tutoring programs, pricing, and approach. |
| cn-faq.html | IvyPath Academy \| 常见问题 | 关于IvyPath Academy辅导课程、价格和教学方法的常见问题解答。 |
| cn-book.html | IvyPath Academy \| 预约咨询 | 预约免费咨询，讨论您孩子的学业目标并制定个性化提升计划。 |

---

## Constraints

- No build tools or frameworks — pure static HTML/CSS/JS
- All pages share the same style.css and script.js. About pages additionally load about.css, booking pages load book.css.
- Nav and footer HTML is duplicated across files (consistent with existing about.html pattern)
- Responsive design maintained at existing breakpoints: 1024px, 768px, 480px
- External dependencies: Google Fonts (Inter, Playfair Display), pravatar.cc (placeholder avatars)
- Results gallery uses placeholder cards — real images to be added later by user
- Stat numbers across pages use consistent values: "200pt" on the main page hero metric refers to the same stat as "200+" on the results page. The Before/After chart shows a specific example scenario (+470 total), not the average.
