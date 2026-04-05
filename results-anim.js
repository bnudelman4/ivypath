/* ============================================
   Results Page - Graph Animations with GSAP ScrollTrigger
   ============================================ */

(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;
    gsap.registerPlugin(ScrollTrigger);

    // --- Animate Score Bars ---
    document.querySelectorAll('.score-bar-fill').forEach(bar => {
      const targetWidth = bar.style.width;
      bar.style.width = '0%';

      gsap.to(bar, {
        width: targetWidth,
        duration: 1.5,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: bar.closest('.score-bar-group'),
          start: 'top 80%',
          toggleActions: 'play none none none',
        }
      });
    });

    // --- Animate Score Delta Numbers ---
    document.querySelectorAll('.score-bar-delta').forEach(delta => {
      gsap.fromTo(delta, {
        opacity: 0,
        x: -10,
      }, {
        opacity: 1,
        x: 0,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: delta.closest('.score-bar-group'),
          start: 'top 80%',
          toggleActions: 'play none none none',
        }
      });
    });

    // --- Animate AP Table Rows ---
    document.querySelectorAll('.ap-table tbody tr').forEach((row, i) => {
      gsap.fromTo(row, {
        opacity: 0,
        y: 20,
      }, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        delay: i * 0.1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: row.closest('.ap-table'),
          start: 'top 80%',
          toggleActions: 'play none none none',
        }
      });
    });

    // --- Animate AP Score Cells ---
    document.querySelectorAll('.ap-score').forEach(cell => {
      const target = parseFloat(cell.textContent);
      cell.textContent = '0.0';

      gsap.to({ val: 0 }, {
        val: target,
        duration: 1.5,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: cell.closest('tr'),
          start: 'top 85%',
          toggleActions: 'play none none none',
        },
        onUpdate: function () {
          cell.textContent = this.targets()[0].val.toFixed(1);
        }
      });
    });

    // --- Animate SVG Trajectory Line ---
    const trajectoryPath = document.querySelector('.trajectory-chart path');
    if (trajectoryPath) {
      const length = trajectoryPath.getTotalLength();
      trajectoryPath.style.strokeDasharray = length;
      trajectoryPath.style.strokeDashoffset = length;

      gsap.to(trajectoryPath, {
        strokeDashoffset: 0,
        duration: 2.5,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: '.trajectory-chart',
          start: 'top 75%',
          toggleActions: 'play none none none',
        }
      });
    }

    // --- Animate SVG Data Points ---
    document.querySelectorAll('.trajectory-chart circle').forEach((dot, i) => {
      gsap.fromTo(dot, {
        r: 0,
        opacity: 0,
      }, {
        r: 5,
        opacity: 1,
        duration: 0.4,
        delay: i * 0.3,
        ease: 'back.out(2)',
        scrollTrigger: {
          trigger: '.trajectory-chart',
          start: 'top 75%',
          toggleActions: 'play none none none',
        }
      });
    });

    // --- Animate Testimonial Section Header ---
    const testimonialsHeader = document.querySelector('.testimonial-columns');
    if (testimonialsHeader) {
      const sectionHeader = testimonialsHeader.previousElementSibling;
      if (sectionHeader && sectionHeader.classList.contains('section-header')) {
        gsap.fromTo(sectionHeader, {
          opacity: 0,
          y: 30,
        }, {
          opacity: 1,
          y: 0,
          duration: 1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: sectionHeader,
            start: 'top 85%',
            toggleActions: 'play none none none',
          }
        });
      }
    }
  });
})();
