/* IvyPath unified tracking layer.
   Fires Google Ads conversions, optional GA4 events, and Meta Pixel events for
   the three key actions: Lead (contact captured), Booking (consultation booked),
   Purchase (package bought).

   >>> ACTION REQUIRED: paste your Google Ads values below. <<<
   Until googleAdsId is filled in, the Google Ads conversions stay inert, but the
   Meta Pixel Lead / Booking / Purchase events fire immediately.
*/
(function () {
  var CFG = {
    googleAdsId: 'AW-18428932469',          // acct 992-977-3439. Was AW-18229353498 (acct 907-235-3191, retired).
    labels: {
      lead:     'XXXXXXXXXXXXXXXXX',        // no snippet action in acct 992-977-3439 yet
      booking:  'XXXXXXXXXXXXXXXXX',        // booking is URL-based now (thank-you.html), needs no label
      purchase: 'XXXXXXXXXXXXXXXXX',        // "Purchase" conversion label
      phoneClick: 'B5qYCOXnsvEcEPXizNNE'   // "Click to call" (Phone call lead) in acct 992-977-3439, created 2026-09-08
    },
    ga4Id: 'G-EW2RB4F5JB'                               // optional, e.g. 'G-XXXXXXX'
  };

  function configured(v) { return !!v && v.indexOf('XXXX') === -1; }

  var SUPPRESS = false;
  try { SUPPRESS = (window.__ivpNoTrack === 1) || (document.cookie.indexOf('ivp_notrack=1') > -1); } catch (e) {}

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  var googleId = configured(CFG.googleAdsId) ? CFG.googleAdsId
               : (configured(CFG.ga4Id) ? CFG.ga4Id : '');
  if (googleId && !SUPPRESS) {
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + googleId;
    document.head.appendChild(s);
    gtag('js', new Date());
    if (configured(CFG.googleAdsId)) gtag('config', CFG.googleAdsId);
    if (configured(CFG.ga4Id)) gtag('config', CFG.ga4Id);
  }

  function sendTo(label) { return CFG.googleAdsId + '/' + label; }
  function hasFbq() { return typeof window.fbq === 'function'; }
  var leadFired = false;

  window.ivypathTrackLead = function (data) {
    if (SUPPRESS) return;
    if (leadFired) return;
    leadFired = true;
    try {
      if (configured(CFG.googleAdsId) && configured(CFG.labels.lead))
        gtag('event', 'conversion', { send_to: sendTo(CFG.labels.lead) });
      if (configured(CFG.ga4Id)) gtag('event', 'generate_lead');
      if (hasFbq()) window.fbq('track', 'Lead');
    } catch (e) {}
  };

  window.ivypathTrackBooking = function (data) {
    if (SUPPRESS) return;
    try {
      if (configured(CFG.googleAdsId) && configured(CFG.labels.booking))
        gtag('event', 'conversion', { send_to: sendTo(CFG.labels.booking) });
      if (configured(CFG.ga4Id)) gtag('event', 'schedule');
      if (hasFbq()) window.fbq('track', 'Schedule');
    } catch (e) {}
  };

  window.ivypathTrackPurchase = function (data) {
    if (SUPPRESS) return;
    data = data || {};
    var value = (typeof data.value === 'number') ? data.value : undefined;
    var currency = data.currency || 'USD';
    try {
      if (configured(CFG.googleAdsId) && configured(CFG.labels.purchase)) {
        var p = { send_to: sendTo(CFG.labels.purchase) };
        if (value !== undefined) { p.value = value; p.currency = currency; }
        if (data.transaction_id) p.transaction_id = data.transaction_id;
        gtag('event', 'conversion', p);
      }
      if (configured(CFG.ga4Id))
        gtag('event', 'purchase', { value: value, currency: currency, transaction_id: data.transaction_id });
      if (hasFbq())
        window.fbq('track', 'Purchase', value !== undefined ? { value: value, currency: currency } : {});
    } catch (e) {}
  };
  /* --- Where do visitors go? (added 2026-09-05) --------------------------
     Every tap on a diagnostic CTA, consultation CTA, pricing link, email link
     or the phone number becomes a GA4 event (`cta_click`, or `phone_click` for
     the number) carrying the page, the section the button sits in, and its
     text. A phone tap is also a Google Ads conversion once labels.phoneClick
     is filled in. Answers "ad click -> /shsat -> then what?" per button. */
  function ctaKind(a) {
    var h = (a.getAttribute('href') || '').toLowerCase();
    if (h.indexOf('tel:') === 0) return 'phone';
    if (h.indexOf('sms:') === 0) return 'sms';
    if (h.indexOf('mailto:') === 0) return 'email';
    if (h.indexOf('app.ivypathacademy.com') > -1) return h.indexOf('free-diagnostic') > -1 ? 'diagnostic' : 'app';
    if (h.indexOf('book.html') > -1 || h === '/book' || h.indexOf('/book?') === 0) return 'consultation';
    if (h.indexOf('pricing') > -1) return 'pricing';
    return null;
  }
  function ctaSection(a) {
    try {
      var sec = a.closest('section, header, footer, nav, aside');
      if (!sec) return 'body';
      return sec.id || (sec.className || '').split(/\s+/)[0] || sec.tagName.toLowerCase();
    } catch (e) { return 'body'; }
  }
  document.addEventListener('click', function (ev) {
    if (SUPPRESS) return;
    var t = ev.target;
    var a = (t && t.closest) ? t.closest('a[href]') : null;
    if (!a) return;
    var kind = ctaKind(a);
    if (!kind) return;
    var params = {
      cta_type: kind,
      page_path: location.pathname,
      cta_section: ctaSection(a),
      cta_text: (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      transport_type: 'beacon'
    };
    try {
      if (configured(CFG.ga4Id)) gtag('event', kind === 'phone' ? 'phone_click' : 'cta_click', params);
      if (kind === 'phone') {
        if (configured(CFG.googleAdsId) && configured(CFG.labels.phoneClick))
          gtag('event', 'conversion', { send_to: sendTo(CFG.labels.phoneClick), transport_type: 'beacon' });
        if (hasFbq()) window.fbq('trackCustom', 'PhoneClick', { page_path: location.pathname });
      }
    } catch (e) {}
  }, true);
})();
/* Forward ad click IDs + UTMs to the app subdomain so attribution survives the site->app hop */
(function(){
  try {
    var src = new URLSearchParams(location.search);
    var keep = ['gclid','fbclid','wbraid','gbraid','utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
    var pass = keep.filter(function(k){ return src.get(k); });
    if (!pass.length) return;
    function decorate(){ if (window.__ivpNoTrack===1) return;
      var links = document.querySelectorAll('a[href*="app.ivypathacademy.com"]');
      for (var i=0;i<links.length;i++){
        try { var u=new URL(links[i].href); pass.forEach(function(k){ if(!u.searchParams.get(k)) u.searchParams.set(k, src.get(k)); }); links[i].href=u.toString(); } catch(e){}
      }
    }
    if (document.readyState!=='loading') decorate(); else document.addEventListener('DOMContentLoaded', decorate);
    window.addEventListener('load', decorate);
    setTimeout(decorate, 1500);
  } catch(e){}
})();


// --- Attribution memory (added 2026-09-22) ---------------------------------
// The booking pages POST to /api/book-consultation instead of linking to the
// app, so the link decorators above never help them. Remember the first
// qualifying params seen this session and expose one reader the booking
// forms call at submit time. sessionStorage, not cookies: it dies with the tab
// and is never sent anywhere on its own.
(function () {
  try {
    var KEYS = ['gclid','wbraid','gbraid','fbclid','utm_source','utm_medium','utm_campaign','utm_term','utm_content','ref'];
    var KEY = 'ivp_attr';
    var q = new URLSearchParams(location.search);
    var seen = {};
    KEYS.forEach(function (k) { var v = q.get(k); if (v) seen[k] = String(v).slice(0, 200); });
    var stored = {};
    try { stored = JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch (e) { stored = {}; }
    // First touch, ALWAYS (added 2026-09-24). Params alone missed every typed-in or
    // untagged visit: nine SHSAT sign-ups on 09-24 all read "referrer = our homepage"
    // and nothing else, so nobody could tell a Google search from a classmate. Keep
    // the first page of this tab session and WHICH site or app sent it: a bare
    // hostname (e.g. google.com) or app:<package> for Android/iOS apps (e.g.
    // app:com.google.android.gm). Never a path or query: a referring page can
    // loosen its referrer policy, and paths can hold account ids, emails or tokens.
    var FT = 'ivp_ft';
    try {
      if (!sessionStorage.getItem(FT)) {
        var ext = 'direct';
        try {
          if (document.referrer) {
            var ru = new URL(document.referrer);
            var own = function (h) { return h.replace(/^www\./, ''); };
            if (/^https?:$/.test(ru.protocol)) {
              ext = own(ru.hostname) === own(location.hostname) ? 'internal' : own(ru.hostname).toLowerCase().slice(0, 100);
            } else if (/^(android|ios)-app:$/.test(ru.protocol) && ru.hostname) {
              ext = ('app:' + ru.hostname.toLowerCase()).slice(0, 100);
            } else {
              ext = 'unknown';
            }
          }
        } catch (e) { ext = 'unknown'; }
        sessionStorage.setItem(FT, JSON.stringify({ landing: location.pathname.slice(0, 200), referrer: ext }));
      }
    } catch (e) {}
    if (Object.keys(seen).length) {
      // First touch wins for click ids and utm; a later page with its own
      // params does not overwrite the ad click that started the session.
      KEYS.forEach(function (k) { if (seen[k] && !stored[k]) stored[k] = seen[k]; });
      if (!stored.landing) stored.landing = location.pathname;
      try { sessionStorage.setItem(KEY, JSON.stringify(stored)); } catch (e) {}
    }
    window.ivpAttribution = function () {
      var out = {};
      var cur = {};
      try { cur = JSON.parse(sessionStorage.getItem(KEY) || '{}') || {}; } catch (e) { cur = {}; }
      KEYS.forEach(function (k) { if (cur[k]) out[k] = cur[k]; });
      if (cur.landing) out.landing = cur.landing;
      out.page = location.pathname;
      try {
        var ft = JSON.parse(sessionStorage.getItem(FT) || '{}') || {};
        if (ft.landing) out.first_landing = ft.landing;
        if (ft.referrer) out.first_referrer = ft.referrer;
      } catch (e) {}
      return out;
    };
  } catch (e) {}
})();

// --- Click-source forwarding (added 2026-07-01) -----------------------------
// Appends qualifying attribution params (utm_*, fbclid, gclid, ref) from the
// current URL, plus ivp_lp=<landing pathname>, to every link pointing at
// app.ivypathacademy.com — so the funnel can store where each lead came from.
(function () {
  try {
    var qualifying = /^(utm_|fbclid$|gclid$|ref$)/;
    var params = new URLSearchParams(location.search);
    var fwd = new URLSearchParams();
    params.forEach(function (v, k) { if (qualifying.test(k)) fwd.append(k, v); });
    fwd.append('ivp_lp', location.pathname);
    try {
      var ft = JSON.parse(sessionStorage.getItem('ivp_ft') || '{}') || {};
      if (ft.landing) fwd.append('first_landing', ft.landing);
      if (ft.referrer) fwd.append('first_referrer', ft.referrer);
    } catch (e) {}
    var decorate = function () {
      document.querySelectorAll('a[href*="app.ivypathacademy.com"]').forEach(function (a) {
        try {
          var u = new URL(a.href);
          fwd.forEach(function (v, k) { if (!u.searchParams.has(k)) u.searchParams.append(k, v); });
          a.href = u.toString();
        } catch (e) {}
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', decorate);
    } else { decorate(); }
  } catch (e) {}
})();
