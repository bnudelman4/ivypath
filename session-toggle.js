/* ============================================
   Session Mode Toggle: Online vs In-Person
   In-person adds $20/hr to all hourly rates.
   Consulting packages have fixed in-person prices.
   ============================================ */

(function () {
  'use strict';

  const IN_PERSON_PREMIUM = 20; // $/hr extra for in-person

  // Consulting packages are flat-fee (no in-person premium applies)
  // In-person premium only applies to 1-on-1 hourly tutoring

  document.addEventListener('DOMContentLoaded', () => {
    const toggles = document.querySelectorAll('.session-toggle');
    if (!toggles.length) return;

    toggles.forEach(toggle => {
      const onlineBtn = toggle.querySelector('[data-mode="online"]');
      const inPersonBtn = toggle.querySelector('[data-mode="in-person"]');

      if (onlineBtn) onlineBtn.addEventListener('click', () => setMode('online'));
      if (inPersonBtn) inPersonBtn.addEventListener('click', () => setMode('in-person'));
    });

    setMode('online');
  });

  function setMode(mode) {
    const isInPerson = mode === 'in-person';
    const isZh = document.documentElement.lang === 'zh-CN';

    // Update all toggle buttons
    document.querySelectorAll('.session-toggle').forEach(toggle => {
      toggle.querySelectorAll('[data-mode]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
      });
    });

    // --- Pricing table hourly rows ---
    document.querySelectorAll('.pricing-row[data-base-rate]').forEach(row => {
      const baseRate = parseFloat(row.dataset.baseRate);
      const hours = parseInt(row.dataset.hours);
      const rate = isInPerson ? baseRate + IN_PERSON_PREMIUM : baseRate;
      const total = rate * hours;

      const rateEl = row.querySelector('.pricing-rate');
      const totalEl = row.querySelector('.pricing-total');
      const cartBtn = row.querySelector('.add-to-cart-btn');

      const hrLabel = isZh ? '/小时' : '/hr';
      if (rateEl) rateEl.textContent = '$' + rate + hrLabel;
      if (totalEl) totalEl.textContent = '$' + total.toLocaleString();
      if (cartBtn) {
        cartBtn.dataset.price = total;
        const baseName = cartBtn.dataset.baseName || cartBtn.dataset.name;
        cartBtn.dataset.baseName = baseName;
        cartBtn.dataset.name = baseName + (isInPerson ? ' (In-Person)' : ' (Online)');
      }
    });

    // --- Homepage package cards (hourly) ---
    document.querySelectorAll('.package-card[data-base-rate]').forEach(card => {
      const baseRate = parseFloat(card.dataset.baseRate);
      const hours = parseInt(card.dataset.hours || 0);
      const baseTotal = parseFloat(card.dataset.baseTotal);
      const baseOriginal = parseFloat(card.dataset.baseOriginal || 0);

      if (!hours || !baseRate) return;

      const rate = isInPerson ? baseRate + IN_PERSON_PREMIUM : baseRate;
      const total = isInPerson ? baseTotal + (IN_PERSON_PREMIUM * hours) : baseTotal;
      const original = baseOriginal && isInPerson ? baseOriginal + (IN_PERSON_PREMIUM * hours) : baseOriginal;

      const rateEl = card.querySelector('.package-rate');
      const priceEl = card.querySelector('.package-price');
      const originalEl = card.querySelector('.package-original');
      const cartBtn = card.querySelector('.add-to-cart-btn');

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

    // --- Mode label ---
    document.querySelectorAll('.session-mode-label').forEach(el => {
      el.textContent = isInPerson
        ? (isZh ? '面授价格' : 'In-Person pricing')
        : (isZh ? '在线价格' : 'Online pricing');
    });
  }
})();
