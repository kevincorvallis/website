/**
 * Brutalist Scroll Animations
 * Intersection Observer-based animations for geometric reveals
 */

// Animation configuration
const ANIMATION_CONFIG = {
  threshold: [0, 0.25, 0.5, 0.75, 1],
  rootMargin: '0px 0px -100px 0px'
};

// Initialize observers when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations();
  initParallax();
  init3DCardEffects();
});

/**
 * Scroll-triggered reveals using Intersection Observer
 */
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Add animate-in class
        entry.target.classList.add('animate-in');

        // For staggered lists
        if (entry.target.hasAttribute('data-stagger')) {
          staggerChildren(entry.target);
        }

        // Unobserve after animation to improve performance
        observer.unobserve(entry.target);
      }
    });
  }, ANIMATION_CONFIG);

  // Observe elements with data-animate attribute
  document.querySelectorAll('[data-animate]').forEach(el => observer.observe(el));

  // Observe key dashboard elements
  document.querySelectorAll('.stat-card, .entry, .feed-card').forEach(el => {
    if (!el.hasAttribute('data-animate')) {
      el.setAttribute('data-animate', 'fade');
      observer.observe(el);
    }
  });
}

/**
 * Stagger animation for list items
 */
function staggerChildren(parent) {
  const children = parent.querySelectorAll('.stagger-item, .stat-card, .entry, .feed-card');
  children.forEach((child, index) => {
    child.style.animationDelay = `${index * 100}ms`;
    child.classList.add('animate-in');
  });
}

/**
 * Parallax background effects
 */
function initParallax() {
  const parallaxElements = document.querySelectorAll('[data-parallax]');
  if (parallaxElements.length === 0) return;

  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        updateParallax(parallaxElements);
        ticking = false;
      });
      ticking = true;
    }
  });
}

function updateParallax(elements) {
  const scrolled = window.pageYOffset;

  elements.forEach(el => {
    const speed = parseFloat(el.dataset.parallax) || 0.5;
    const yPos = -(scrolled * speed);
    el.style.transform = `translate3d(0, ${yPos}px, 0)`;
  });
}

/**
 * 3D card hover effects
 */
function init3DCardEffects() {
  const cards = document.querySelectorAll('.card-3d, .stat-card, .entry, .feed-card');

  cards.forEach(card => {
    // Store original transform
    let originalTransform = '';

    card.addEventListener('mouseenter', () => {
      originalTransform = card.style.transform || '';
      card.style.transition = 'transform 0.1s ease';
    });

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = (y - centerY) / 10;
      const rotateY = (centerX - x) / 10;

      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(10px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform 0.3s ease';
      card.style.transform = originalTransform || 'perspective(1000px) rotateX(0) rotateY(0) translateZ(0)';
    });
  });
}

/**
 * Dynamic entrance animations
 */
function animateOnLoad() {
  const elements = document.querySelectorAll('.stats-container, .entries-grid, .feed-list');
  elements.forEach((el, index) => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';

    setTimeout(() => {
      el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, index * 150);
  });
}

// Run entrance animations
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', animateOnLoad);
} else {
  animateOnLoad();
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initScrollAnimations, initParallax, init3DCardEffects };
}
