/* ============================================
   Scroll Effects - GSAP ScrollTrigger
   SVG stroke follow + text scatter animations
   ============================================ */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    gsap.registerPlugin(ScrollTrigger);

    initSVGStrokeFollow();
    initTextScatter();
  });

  /* ---- SVG Stroke Follow (Pricing page) ---- */
  function initSVGStrokeFollow() {
    const svgContainer = document.querySelector('.svg-stroke-section');
    if (!svgContainer) return;

    const path = svgContainer.querySelector('.svg-stroke-path');
    if (!path) return;

    const length = path.getTotalLength();
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length;

    gsap.to(path, {
      strokeDashoffset: 0,
      ease: 'none',
      scrollTrigger: {
        trigger: svgContainer,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.5,
      }
    });
  }

  /* ---- Text Scatter Animation (Results page) ---- */
  function initTextScatter() {
    const container = document.querySelector('.text-scatter-section');
    if (!container) return;

    const chars = container.querySelectorAll('.scatter-char');
    if (!chars.length) return;

    const centerIndex = Math.floor(chars.length / 2);

    chars.forEach((char, i) => {
      const dist = i - centerIndex;

      gsap.fromTo(char, {
        x: dist * 60,
        rotateX: dist * 40,
        opacity: 0,
      }, {
        x: 0,
        rotateX: 0,
        opacity: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: container,
          start: 'top 80%',
          end: 'top 30%',
          scrub: 0.5,
        }
      });
    });
  }
})();
