/* ============================================
   ScrollStack - Vanilla JS
   Matching @react-bits/ScrollStack behavior
   ============================================ */

(function () {
  'use strict';

  // Config matching the original component defaults
  const CONFIG = {
    itemDistance: 100,
    itemScale: 0.03,
    itemStackDistance: 30,
    stackPosition: 0.20,     // 20% of viewport
    scaleEndPosition: 0.10,  // 10% of viewport
    baseScale: 0.85
  };

  document.addEventListener('DOMContentLoaded', () => {
    const cards = Array.from(document.querySelectorAll('.scroll-stack-card'));
    const endMarker = document.querySelector('.scroll-stack-end');
    if (!cards.length || !endMarker) return;

    // Set initial styles exactly like the original
    cards.forEach((card, i) => {
      if (i < cards.length - 1) {
        card.style.marginBottom = CONFIG.itemDistance + 'px';
      }
      card.style.margin = (i < cards.length - 1 ? '30px 0 ' + CONFIG.itemDistance + 'px' : '30px 0');
      card.style.willChange = 'transform';
      card.style.transformOrigin = 'top center';
      card.style.backfaceVisibility = 'hidden';
      card.style.WebkitBackfaceVisibility = 'hidden';
      // Use translate3d for GPU compositing (avoids blur)
      card.style.transform = 'translate3d(0, 0, 0)';
      card.style.WebkitTransform = 'translate3d(0, 0, 0)';
    });

    const lastTransforms = new Map();

    function getElementOffset(el) {
      return el.getBoundingClientRect().top + window.scrollY;
    }

    function clamp(val, min, max) {
      return Math.max(min, Math.min(max, val));
    }

    function update() {
      const scrollTop = window.scrollY;
      const vh = window.innerHeight;
      const stackPx = CONFIG.stackPosition * vh;
      const scaleEndPx = CONFIG.scaleEndPosition * vh;
      const endTop = getElementOffset(endMarker);

      cards.forEach((card, i) => {
        const cardTop = getElementOffset(card);
        const triggerStart = cardTop - stackPx - CONFIG.itemStackDistance * i;
        const triggerEnd = cardTop - scaleEndPx;
        const pinStart = triggerStart;
        const pinEnd = endTop - vh / 2;

        // Scale
        let scaleProgress = 0;
        if (scrollTop > triggerStart && triggerEnd > triggerStart) {
          scaleProgress = clamp((scrollTop - triggerStart) / (triggerEnd - triggerStart), 0, 1);
        }
        const targetScale = CONFIG.baseScale + i * CONFIG.itemScale;
        const scale = 1 - scaleProgress * (1 - targetScale);

        // Pin translation
        let translateY = 0;
        if (scrollTop >= pinStart && scrollTop <= pinEnd) {
          translateY = scrollTop - cardTop + stackPx + CONFIG.itemStackDistance * i;
        } else if (scrollTop > pinEnd) {
          translateY = pinEnd - cardTop + stackPx + CONFIG.itemStackDistance * i;
        }

        // Round to avoid subpixel rendering (main cause of blur)
        const roundedY = Math.round(translateY);
        const roundedScale = Math.round(scale * 10000) / 10000;

        const last = lastTransforms.get(i);
        if (!last || Math.abs(last.y - roundedY) > 0.5 || Math.abs(last.s - roundedScale) > 0.0001) {
          // translate3d triggers GPU layer → no blur on text
          card.style.transform = 'translate3d(0,' + roundedY + 'px,0) scale(' + roundedScale + ')';
          lastTransforms.set(i, { y: roundedY, s: roundedScale });
        }
      });

      requestAnimationFrame(update);
    }

    requestAnimationFrame(update);
  });
})();
