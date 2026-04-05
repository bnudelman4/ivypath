/* ============================================
   Smooth Scrolling - Lenis
   Clean, slow, buttery scroll on every page
   ============================================ */

(function () {
  'use strict';

  // Wait for DOM and Lenis to be available
  document.addEventListener('DOMContentLoaded', () => {
    if (typeof Lenis === 'undefined') return;

    const lenis = new Lenis({
      duration: 1.4,            // Slower, smoother scroll
      easing: function (t) {
        return Math.min(1, 1.001 - Math.pow(2, -10 * t));
      },
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 0.8,     // Slightly slower wheel scroll
      touchMultiplier: 1.5,
      infinite: false,
      lerp: 0.08,               // Lower = smoother/slower interpolation
      syncTouch: false,          // Don't override native touch on mobile
    });

    // Connect Lenis to GSAP ScrollTrigger if available
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (time) {
        lenis.raf(time * 1000);
      });
      gsap.ticker.lagSmoothing(0);
    } else {
      // Standalone RAF loop
      function raf(time) {
        lenis.raf(time);
        requestAnimationFrame(raf);
      }
      requestAnimationFrame(raf);
    }

    // Expose lenis instance globally for other scripts
    window.lenis = lenis;

    // Handle anchor links smoothly
    document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
      anchor.addEventListener('click', function (e) {
        var target = document.querySelector(this.getAttribute('href'));
        if (target) {
          e.preventDefault();
          lenis.scrollTo(target, { offset: -80 });
        }
      });
    });
  });
})();
