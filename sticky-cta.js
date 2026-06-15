/* IvyPath sticky mobile CTA bar — persistent Book / Call for paid mobile traffic.
   Hidden on booking + confirmation pages and on desktop (>768px). */
(function () {
  function init() {
    var path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var hidden = ['book.html', 'cn-book.html', 'thank-you.html', 'success.html', 'cancel.html'];
    if (hidden.indexOf(path) !== -1) return;
    var isCn = path.indexOf('cn') === 0;
    var bookHref = isCn ? 'cn-book.html' : 'book.html';
    var bookLabel = isCn ? '预约免费咨询' : 'Book Free Consult';
    var callLabel = isCn ? '致电' : 'Call';

    var style = document.createElement('style');
    style.textContent =
      '#ivp-sticky-cta{position:fixed;left:0;right:0;bottom:0;z-index:9999;display:none;gap:8px;' +
      'padding:10px 12px calc(10px + env(safe-area-inset-bottom));background:rgba(255,255,255,.96);' +
      '-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 -2px 16px rgba(0,0,0,.12);}' +
      '#ivp-sticky-cta a{flex:1;display:flex;align-items:center;justify-content:center;' +
      'font:600 15px/1 Inter,system-ui,sans-serif;text-decoration:none;border-radius:10px;padding:14px 12px;}' +
      '#ivp-sticky-cta .ivp-book{background:#1B4D3E;color:#fff;flex:2;}' +
      '#ivp-sticky-cta .ivp-call{background:#fff;color:#1B4D3E;border:1.5px solid #1B4D3E;}' +
      '@media(max-width:768px){#ivp-sticky-cta{display:flex;}body{padding-bottom:76px;}}';
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.id = 'ivp-sticky-cta';
    bar.setAttribute('role', 'navigation');
    bar.setAttribute('aria-label', 'Quick actions');
    bar.innerHTML =
      '<a class="ivp-book" href="' + bookHref + '">' + bookLabel + '</a>' +
      '<a class="ivp-call" href="tel:+19293940349">' + callLabel + '</a>';
    document.body.appendChild(bar);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
