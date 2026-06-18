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
    googleAdsId: 'AW-18229353498',          // Google Ads conversion ID (Goals > Conversions > your action)
    labels: {
      lead:     'FIOmCJrV7b8cEJq4t_RD',        // "Lead - contact captured" conversion label
      booking:  'vfkdCPOj578cEJq4t_RD',        // "Consultation booked" conversion label
      purchase: 'XXXXXXXXXXXXXXXXX'         // "Purchase" conversion label
    },
    ga4Id: 'G-EW2RB4F5JB'                               // optional, e.g. 'G-XXXXXXX'
  };

  function configured(v) { return !!v && v.indexOf('XXXX') === -1; }

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  var googleId = configured(CFG.googleAdsId) ? CFG.googleAdsId
               : (configured(CFG.ga4Id) ? CFG.ga4Id : '');
  if (googleId) {
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
    try {
      if (configured(CFG.googleAdsId) && configured(CFG.labels.booking))
        gtag('event', 'conversion', { send_to: sendTo(CFG.labels.booking) });
      if (configured(CFG.ga4Id)) gtag('event', 'schedule');
      if (hasFbq()) window.fbq('track', 'Schedule');
    } catch (e) {}
  };

  window.ivypathTrackPurchase = function (data) {
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
})();
/* Forward ad click IDs + UTMs to the app subdomain so attribution survives the site->app hop */
(function(){
  try {
    var src = new URLSearchParams(location.search);
    var keep = ['gclid','fbclid','wbraid','gbraid','utm_source','utm_medium','utm_campaign','utm_term','utm_content'];
    var pass = keep.filter(function(k){ return src.get(k); });
    if (!pass.length) return;
    function decorate(){
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
