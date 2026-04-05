/* ============================================
   Geometric Hero Animations + Parallax - GSAP
   ============================================ */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    if (!document.querySelector('.geo-hero')) return;

    // --- Animate shapes in ---
    const shapes = document.querySelectorAll('.geo-shape');
    shapes.forEach((shape, i) => {
      const delay = 0.3 + i * 0.15;

      gsap.fromTo(shape, {
        opacity: 0,
        y: -120,
      }, {
        opacity: 1,
        y: 0,
        duration: 2,
        delay: delay,
        ease: 'power3.out',
      });

      // Continuous gentle float
      gsap.to(shape, {
        y: 15,
        duration: 10 + i * 2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: delay + 1,
      });
    });

    // --- Animate content elements ---
    const title1 = document.querySelector('.geo-title-line1');
    const title2 = document.querySelector('.geo-title-line2');
    const subtitle = document.querySelector('.geo-hero-subtitle');
    const ctas = document.querySelector('.geo-hero-ctas');

    const content = [title1, title2, subtitle, ctas].filter(Boolean);

    content.forEach((el, i) => {
      gsap.to(el, {
        opacity: 1,
        y: 0,
        duration: 1,
        delay: 0.5 + i * 0.2,
        ease: 'power2.out',
      });
    });

    // --- Parallax scrolling ---
    if (typeof ScrollTrigger !== 'undefined') {
      gsap.registerPlugin(ScrollTrigger);

      const hero = document.querySelector('.geo-hero');
      const heroBg = document.querySelector('.geo-hero-bg');
      const heroContent = document.querySelector('.geo-hero-content');
      const shapesContainer = document.querySelector('.geo-shapes');

      // Hero background moves slower (parallax depth)
      if (heroBg) {
        gsap.to(heroBg, {
          yPercent: 30,
          ease: 'none',
          scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: 'bottom top',
            scrub: 0,
          }
        });
      }

      // Hero content fades and moves up faster
      if (heroContent) {
        gsap.to(heroContent, {
          yPercent: -20,
          opacity: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: hero,
            start: '20% top',
            end: 'bottom top',
            scrub: 0,
          }
        });
      }

      // Shapes move at different rates
      if (shapesContainer) {
        shapes.forEach((shape, i) => {
          gsap.to(shape, {
            yPercent: 20 + i * 15,
            ease: 'none',
            scrollTrigger: {
              trigger: hero,
              start: 'top top',
              end: 'bottom top',
              scrub: 0,
            }
          });
        });
      }

      // Page content sections reveal with subtle parallax
      document.querySelectorAll('.page-section, .packages, .pricing-link-section, .marquee-section').forEach(section => {
        gsap.fromTo(section, {
          y: 60,
          opacity: 0,
        }, {
          y: 0,
          opacity: 1,
          duration: 1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 85%',
            toggleActions: 'play none none none',
          }
        });
      });
    }
  });
})();
