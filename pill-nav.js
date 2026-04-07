/* ============================================
   PillNav - Vanilla JS + GSAP
   Transparent centered nav with pill hover effects
   ============================================ */

(function () {
  'use strict';

  const EASE = 'power3.out';

  document.addEventListener('DOMContentLoaded', () => {
    initPillNav();
    initScrollBehavior();
  });

  function initPillNav() {
    const pills = document.querySelectorAll('.pill');
    const timelines = [];
    const activeTweens = [];

    // Layout each pill's hover circle
    function layoutPills() {
      pills.forEach((pill, i) => {
        const circle = pill.querySelector('.hover-circle');
        if (!circle) return;

        const rect = pill.getBoundingClientRect();
        const w = rect.width;
        const h = rect.height;
        const R = ((w * w) / 4 + h * h) / (2 * h);
        const D = Math.ceil(2 * R) + 2;
        const delta = Math.ceil(R - Math.sqrt(Math.max(0, R * R - (w * w) / 4))) + 1;
        const originY = D - delta;

        circle.style.width = D + 'px';
        circle.style.height = D + 'px';
        circle.style.bottom = '-' + delta + 'px';

        gsap.set(circle, { xPercent: -50, scale: 0, transformOrigin: '50% ' + originY + 'px' });

        const label = pill.querySelector('.pill-label');
        const hoverLabel = pill.querySelector('.pill-label-hover');

        if (label) gsap.set(label, { y: 0 });
        if (hoverLabel) gsap.set(hoverLabel, { y: h + 12, opacity: 0 });

        if (timelines[i]) timelines[i].kill();
        const tl = gsap.timeline({ paused: true });
        tl.to(circle, { scale: 1.2, xPercent: -50, duration: 2, ease: EASE, overwrite: 'auto' }, 0);
        if (label) tl.to(label, { y: -(h + 8), duration: 2, ease: EASE, overwrite: 'auto' }, 0);
        if (hoverLabel) {
          gsap.set(hoverLabel, { y: Math.ceil(h + 100), opacity: 0 });
          tl.to(hoverLabel, { y: 0, opacity: 1, duration: 2, ease: EASE, overwrite: 'auto' }, 0);
        }
        timelines[i] = tl;
      });
    }

    layoutPills();
    window.addEventListener('resize', layoutPills);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(layoutPills).catch(() => {});
    }

    // Hover handlers
    pills.forEach((pill, i) => {
      pill.addEventListener('mouseenter', () => {
        const tl = timelines[i];
        if (!tl) return;
        if (activeTweens[i]) activeTweens[i].kill();
        activeTweens[i] = tl.tweenTo(tl.duration(), { duration: 0.3, ease: EASE, overwrite: 'auto' });
      });

      pill.addEventListener('mouseleave', () => {
        const tl = timelines[i];
        if (!tl) return;
        if (activeTweens[i]) activeTweens[i].kill();
        activeTweens[i] = tl.tweenTo(0, { duration: 0.2, ease: EASE, overwrite: 'auto' });
      });
    });

    // Mobile menu toggle
    const mobileBtn = document.querySelector('.pill-mobile-btn');
    const mobileMenu = document.querySelector('.pill-mobile-menu');
    let mobileOpen = false;

    if (mobileBtn && mobileMenu) {
      gsap.set(mobileMenu, { visibility: 'hidden', opacity: 0 });

      mobileBtn.addEventListener('click', () => {
        mobileOpen = !mobileOpen;
        const lines = mobileBtn.querySelectorAll('.hamburger-line');

        if (mobileOpen) {
          gsap.to(lines[0], { rotation: 45, y: 3, duration: 0.3, ease: EASE });
          gsap.to(lines[1], { rotation: -45, y: -3, duration: 0.3, ease: EASE });
          gsap.set(mobileMenu, { visibility: 'visible' });
          gsap.fromTo(mobileMenu, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, ease: EASE });
        } else {
          gsap.to(lines[0], { rotation: 0, y: 0, duration: 0.3, ease: EASE });
          gsap.to(lines[1], { rotation: 0, y: 0, duration: 0.3, ease: EASE });
          gsap.to(mobileMenu, {
            opacity: 0, y: 10, duration: 0.2, ease: EASE,
            onComplete: () => gsap.set(mobileMenu, { visibility: 'hidden' })
          });
        }
      });

      mobileMenu.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
          mobileOpen = false;
          const lines = mobileBtn.querySelectorAll('.hamburger-line');
          gsap.to(lines[0], { rotation: 0, y: 0, duration: 0.3, ease: EASE });
          gsap.to(lines[1], { rotation: 0, y: 0, duration: 0.3, ease: EASE });
          gsap.to(mobileMenu, {
            opacity: 0, y: 10, duration: 0.2, ease: EASE,
            onComplete: () => gsap.set(mobileMenu, { visibility: 'hidden' })
          });
        });
      });
    }
  }

  // --- Scroll hide/show + theme switching ---
  function initScrollBehavior() {
    const container = document.querySelector('.pill-nav-container');
    if (!container) return;

    // Determine if this is a dark hero page (dark bg behind nav)
    const hasDarkHero = !!document.querySelector('.geo-hero, .hero-campus, .about-hero, .book-hero');

    // Mark container for CSS theming
    if (hasDarkHero) {
      container.classList.add('dark-hero');
    } else {
      // Non-dark-hero pages: start with dark text immediately
      container.classList.add('start-scrolled');
    }

    let lastScrollY = 0;
    let ticking = false;

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrollY = window.scrollY;

          // Add scrolled class for frosted background after scrolling
          if (scrollY > 50) {
            container.classList.add('scrolled');
          } else {
            container.classList.remove('scrolled');
          }

          // Hide on scroll down, show on scroll up
          if (scrollY > 300) {
            if (scrollY > lastScrollY + 5) {
              container.classList.add('nav-hidden');
            } else if (scrollY < lastScrollY - 5) {
              container.classList.remove('nav-hidden');
            }
          } else {
            container.classList.remove('nav-hidden');
          }

          lastScrollY = scrollY;
          ticking = false;
        });
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
  }
})();
