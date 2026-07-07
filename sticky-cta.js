/* IvyPath sticky mobile CTA bar — persistent primary action for paid mobile traffic.
   On the diagnostic landing pages the primary action is "Start free diagnostic";
   elsewhere it's "Book free consult". Hidden on booking/confirmation pages and on desktop (>768px). */
(function () {
  function init() {
    var path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    // Vercel serves the funnels at the clean paths /sat, /shsat and /consulting
    if (path === 'sat') path = 'sat-diagnostic.html';
    if (path === 'shsat') path = 'shsat-diagnostic.html';
    if (path === 'consulting') path = 'consulting.html';
    var hidden = ['book.html', 'cn-book.html', 'thank-you.html', 'success.html', 'cancel.html'];
    if (hidden.indexOf(path) !== -1) return;
    var isCn = path.indexOf('cn') === 0;

    // Determine the primary action for this page
    var primaryHref, primaryLabel, exam = null, consulting = false;
    if (path === 'sat-diagnostic.html') {
      primaryHref = 'https://app.ivypathacademy.com/free-diagnostic-sat/';
      primaryLabel = 'Start free diagnostic';
      exam = 'SAT';
    } else if (path === 'shsat-diagnostic.html') {
      primaryHref = 'https://app.ivypathacademy.com/free-diagnostic-shsat/';
      primaryLabel = 'Start free diagnostic';
      exam = 'SHSAT';
    } else if (path === 'consulting.html') {
      primaryHref = '#book';
      primaryLabel = 'Book a free strategy call';
      consulting = true;
    } else {
      primaryHref = isCn ? 'cn-book.html' : 'book.html';
      primaryLabel = isCn ? '预约免费咨询' : 'Book Free Consult';
    }
    var callLabel = isCn ? '致电' : 'Call';

    // Mirror tracking.js link decoration: forward attribution params + landing page
    // (tracking.js runs before this bar exists, so decorate here as well)
    if (primaryHref.indexOf('app.ivypathacademy.com') > -1) {
      try {
        var q = new URLSearchParams(location.search);
        var u = new URL(primaryHref);
        q.forEach(function (v, k) {
          if (/^(utm_|fbclid$|gclid$|ref$)/.test(k) && !u.searchParams.has(k)) u.searchParams.append(k, v);
        });
        if (!u.searchParams.has('ivp_lp')) u.searchParams.append('ivp_lp', location.pathname);
        primaryHref = u.toString();
      } catch (e) {}
    }

    var style = document.createElement('style');
    style.textContent =
      '#ivp-sticky-cta{position:fixed;left:0;right:0;bottom:0;z-index:9999;display:none;gap:8px;' +
      'padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);' +
      '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 -2px 16px rgba(0,0,0,.12);}' +
      '#ivp-sticky-cta a{flex:1;display:flex;align-items:center;justify-content:center;' +
      'font:600 15px/1 "Instrument Sans",Inter,system-ui,sans-serif;text-decoration:none;border-radius:10px;padding:14px 12px;}' +
      '#ivp-sticky-cta .ivp-book{background:#4A7C59;color:#fff;flex:2;}' +
      '#ivp-sticky-cta .ivp-call{background:#fff;color:#3A6347;border:1.5px solid #4A7C59;}' +
      '@media(max-width:768px){#ivp-sticky-cta{display:flex;}body{padding-bottom:76px;}}';
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.id = 'ivp-sticky-cta';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Quick actions');
    bar.innerHTML =
      '<a class="ivp-book" href="' + primaryHref + '">' + primaryLabel + '</a>' +
      '<a class="ivp-call" href="tel:+19293940349">' + callLabel + '</a>';
    document.body.appendChild(bar);

    // Fire the matching mid-funnel signal when the primary CTA is tapped on mobile
    if (exam) {
      var primaryEl = bar.querySelector('.ivp-book');
      primaryEl.addEventListener('click', function () {
        try { if (window.fbq) fbq('trackCustom', 'DiagnosticCTAClick', { content_name: exam + ' Diagnostic CTA Click' }); } catch (e) {}
        try { if (window.gtag) gtag('event', 'diagnostic_cta_click', { exam: exam }); } catch (e) {}
      });
    } else if (consulting) {
      var bookEl = bar.querySelector('.ivp-book');
      bookEl.addEventListener('click', function () {
        try { if (window.fbq) fbq('trackCustom', 'ConsultingCTAClick', { content_name: 'Consulting Book CTA (sticky)' }); } catch (e) {}
        try { if (window.gtag) gtag('event', 'consulting_cta_click', { placement: 'sticky' }); } catch (e) {}
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
