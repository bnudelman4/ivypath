/* ============================================
   Session Mode Toggle: Online vs In-Person
   In-person adds $20/hr to all hourly rates.
   Consulting packages are unaffected (not hourly).
   ============================================ */

(function () {
  'use strict';

  const IN_PERSON_PREMIUM = 20; // $/hr extra for in-person

  document.addEventListener('DOMContentLoaded', () => {
    const toggles = document.querySelectorAll('.session-toggle');
    if (!toggles.length) return;

    // Initialize all toggles
    toggles.forEach(toggle => {
      const onlineBtn = toggle.querySelector('[data-mode="online"]');
      const inPersonBtn = toggle.querySelector('[data-mode="in-person"]');

      if (onlineBtn) onlineBtn.addEventListener('click', () => setMode('online'));
      if (inPersonBtn) inPersonBtn.addEventListener('click', () => setMode('in-person'));
    });

    // Set initial mode
    setMode('online');
  });

  function setMode(mode) {
    const isInPerson = mode === 'in-person';

    // Update all toggle buttons
    document.querySelectorAll('.session-toggle').forEach(toggle => {
      toggle.querySelectorAll('[data-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });
    });

    // Update pricing table rows (pricing.html)
    document.querySelectorAll('.pricing-row[data-base-rate]').forEach(row => {
      const baseRate = parseFloat(row.dataset.baseRate);
      const hours = parseInt(row.dataset.hours);
      const rate = isInPerson ? baseRate + IN_PERSON_PREMIUM : baseRate;
      const total = rate * hours;

      const rateEl = row.querySelector('.pricing-rate');
      const totalEl = row.querySelector('.pricing-total');
      const cartBtn = row.querySelector('.add-to-cart-btn');

      if (rateEl) rateEl.textContent = '$' + rate + '/hr';
      if (totalEl) totalEl.textContent = '$' + total.toLocaleString();
      if (cartBtn) {
        cartBtn.dataset.price = total;
        // Update the name to include mode
        const baseName = cartBtn.dataset.baseName || cartBtn.dataset.name;
        cartBtn.dataset.baseName = baseName;
        cartBtn.dataset.name = baseName + (isInPerson ? ' (In-Person)' : ' (Online)');
      }
    });

    // Update pricing table rows - Chinese version (小时)
    document.querySelectorAll('.pricing-row[data-base-rate]').forEach(row => {
      const rateEl = row.querySelector('.pricing-rate');
      if (rateEl && document.documentElement.lang === 'zh-CN') {
        const baseRate = parseFloat(row.dataset.baseRate);
        const rate = isInPerson ? baseRate + IN_PERSON_PREMIUM : baseRate;
        rateEl.textContent = '$' + rate + '/小时';
      }
    });

    // Update homepage package cards
    document.querySelectorAll('.package-card[data-base-rate]').forEach(card => {
      const baseRate = parseFloat(card.dataset.baseRate);
      const hours = parseInt(card.dataset.hours || 0);
      const baseTotal = parseFloat(card.dataset.baseTotal);
      const baseOriginal = parseFloat(card.dataset.baseOriginal || 0);

      if (!hours || !baseRate) return; // Skip non-hourly packages (consulting)

      const rate = isInPerson ? baseRate + IN_PERSON_PREMIUM : baseRate;
      const total = isInPerson ? baseTotal + (IN_PERSON_PREMIUM * hours) : baseTotal;
      const original = baseOriginal && isInPerson ? baseOriginal + (IN_PERSON_PREMIUM * hours) : baseOriginal;

      const rateEl = card.querySelector('.package-rate');
      const priceEl = card.querySelector('.package-price');
      const originalEl = card.querySelector('.package-original');
      const cartBtn = card.querySelector('.add-to-cart-btn');

      const isZh = document.documentElement.lang === 'zh-CN';
      const hrLabel = isZh ? '/课时' : '/hour';

      if (rateEl) rateEl.textContent = '$' + rate + hrLabel;
      if (priceEl) priceEl.textContent = '$' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (originalEl && original) originalEl.textContent = '$' + original.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (cartBtn) {
        cartBtn.dataset.price = total;
        const baseName = cartBtn.dataset.baseName || cartBtn.dataset.name;
        cartBtn.dataset.baseName = baseName;
        cartBtn.dataset.name = baseName + (isInPerson ? ' (In-Person)' : ' (Online)');
      }
    });

    // Update mode label if present
    document.querySelectorAll('.session-mode-label').forEach(el => {
      const isZh = document.documentElement.lang === 'zh-CN';
      el.textContent = isInPerson
        ? (isZh ? '面授价格（每小时+$20）' : 'In-Person pricing (+$20/hr)')
        : (isZh ? '在线价格' : 'Online pricing');
    });
  }
})();
