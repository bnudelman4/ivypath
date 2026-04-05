/* ============================================
   IvyPath Academy - Shopping Cart
   ============================================ */

(function() {
  'use strict';

  // --- Cart State ---
  let cart = JSON.parse(localStorage.getItem('ivypath_cart') || '[]');

  // --- Configuration ---
  // Uses relative URL — works both locally (with vercel dev) and on Vercel
  const CHECKOUT_API_URL = '/api/create-checkout-session';

  // --- Initialize ---
  document.addEventListener('DOMContentLoaded', () => {
    injectCartUI();
    bindAddToCartButtons();
    renderCart();
    updateCartBadge();
  });

  // --- Inject Cart Icon + Drawer into DOM ---
  function injectCartUI() {
    // Bind existing cart toggle buttons (pill nav puts them in HTML)
    document.querySelectorAll('.cart-toggle').forEach(btn => {
      btn.addEventListener('click', toggleCart);
    });

    // If no pill nav cart buttons exist, inject into old navbar
    if (document.querySelectorAll('.cart-toggle').length === 0) {
      const navRight = document.querySelector('.nav-right');
      if (navRight) {
        const cartBtn = document.createElement('button');
        cartBtn.className = 'cart-toggle';
        cartBtn.setAttribute('aria-label', 'Shopping cart');
        cartBtn.innerHTML = `
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          <span class="cart-badge" id="cartBadge">0</span>
        `;
        navRight.insertBefore(cartBtn, navRight.querySelector('.nav-cta'));
        cartBtn.addEventListener('click', toggleCart);
      }
    }

    // Cart drawer overlay
    const overlay = document.createElement('div');
    overlay.className = 'cart-overlay';
    overlay.id = 'cartOverlay';
    overlay.addEventListener('click', closeCart);
    document.body.appendChild(overlay);

    // Cart drawer
    const drawer = document.createElement('div');
    drawer.className = 'cart-drawer';
    drawer.id = 'cartDrawer';
    drawer.innerHTML = `
      <div class="cart-header">
        <h3>Your Cart</h3>
        <button class="cart-close" id="cartClose" aria-label="Close cart">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="cart-items" id="cartItems"></div>
      <div class="cart-footer" id="cartFooter">
        <div class="cart-total">
          <span>Total</span>
          <span id="cartTotal">$0.00</span>
        </div>
        <button class="cart-checkout-btn" id="cartCheckoutBtn">Proceed to Checkout</button>
      </div>
    `;
    document.body.appendChild(drawer);

    document.getElementById('cartClose').addEventListener('click', closeCart);
    document.getElementById('cartCheckoutBtn').addEventListener('click', handleCheckout);
  }

  // --- Toggle / Open / Close ---
  function toggleCart() {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    const isOpen = drawer.classList.contains('open');
    if (isOpen) {
      closeCart();
    } else {
      drawer.classList.add('open');
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeCart() {
    document.getElementById('cartDrawer').classList.remove('open');
    document.getElementById('cartOverlay').classList.remove('open');
    document.body.style.overflow = '';
  }

  // --- Add to Cart ---
  function bindAddToCartButtons() {
    document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const name = btn.dataset.name;
        const price = parseFloat(btn.dataset.price);
        if (!name || !price) return;

        addToCart(name, price);

        // Visual feedback
        const original = btn.textContent;
        btn.textContent = 'Added!';
        btn.style.background = 'var(--primary-light)';
        setTimeout(() => {
          btn.textContent = original;
          btn.style.background = '';
        }, 1200);
      });
    });
  }

  function addToCart(name, price) {
    const existing = cart.find(item => item.name === name);
    if (existing) {
      existing.qty += 1;
    } else {
      cart.push({ name, price, qty: 1 });
    }
    saveCart();
    renderCart();
    updateCartBadge();
  }

  function removeFromCart(name) {
    cart = cart.filter(item => item.name !== name);
    saveCart();
    renderCart();
    updateCartBadge();
  }

  function updateQty(name, delta) {
    const item = cart.find(i => i.name === name);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      removeFromCart(name);
      return;
    }
    saveCart();
    renderCart();
    updateCartBadge();
  }

  // --- Render ---
  function renderCart() {
    const container = document.getElementById('cartItems');
    const footer = document.getElementById('cartFooter');
    if (!container) return;

    if (cart.length === 0) {
      container.innerHTML = `
        <div class="cart-empty">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-lighter)" stroke-width="1.5">
            <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
          </svg>
          <p>Your cart is empty</p>
          <a href="pricing.html" class="cart-browse-link">Browse Packages</a>
        </div>
      `;
      footer.style.display = 'none';
      return;
    }

    footer.style.display = '';
    let html = '';
    let total = 0;

    cart.forEach(item => {
      const lineTotal = item.price * item.qty;
      total += lineTotal;
      html += `
        <div class="cart-item">
          <div class="cart-item-info">
            <strong class="cart-item-name">${item.name}</strong>
            <span class="cart-item-price">$${item.price.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
          </div>
          <div class="cart-item-actions">
            <div class="cart-qty-controls">
              <button class="cart-qty-btn" data-name="${item.name}" data-delta="-1" aria-label="Decrease quantity">−</button>
              <span class="cart-qty">${item.qty}</span>
              <button class="cart-qty-btn" data-name="${item.name}" data-delta="1" aria-label="Increase quantity">+</button>
            </div>
            <button class="cart-remove-btn" data-name="${item.name}" aria-label="Remove item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    animateCartTotal(total);

    // Bind qty and remove buttons
    container.querySelectorAll('.cart-qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        updateQty(btn.dataset.name, parseInt(btn.dataset.delta));
      });
    });
    container.querySelectorAll('.cart-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        removeFromCart(btn.dataset.name);
      });
    });
  }

  function updateCartBadge() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    // Update all cart badges (pill nav may have multiple)
    document.querySelectorAll('.cart-badge').forEach(badge => {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    });
  }

  // --- Persistence ---
  function saveCart() {
    localStorage.setItem('ivypath_cart', JSON.stringify(cart));
  }

  // --- Animated Counter for Cart Total ---
  let currentTotal = 0;
  let counterAnimFrame = null;

  function animateCartTotal(targetTotal) {
    const el = document.getElementById('cartTotal');
    if (!el) return;

    const startTotal = currentTotal;
    const diff = targetTotal - startTotal;
    const duration = 400; // ms
    const startTime = performance.now();

    if (counterAnimFrame) cancelAnimationFrame(counterAnimFrame);

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startTotal + diff * eased;

      el.textContent = '$' + current.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      if (progress < 1) {
        counterAnimFrame = requestAnimationFrame(tick);
      } else {
        currentTotal = targetTotal;
      }
    }

    counterAnimFrame = requestAnimationFrame(tick);
  }

  // --- Checkout ---
  async function handleCheckout() {
    if (cart.length === 0) return;

    const btn = document.getElementById('cartCheckoutBtn');
    btn.textContent = 'Processing...';
    btn.disabled = true;

    try {
      const response = await fetch(CHECKOUT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart.map(item => ({
            name: item.name,
            price: item.price,
            qty: item.qty
          }))
        })
      });

      const data = await response.json();

      if (data.url) {
        // Clear cart on successful checkout session creation
        cart = [];
        saveCart();
        updateCartBadge();
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Failed to create checkout session');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      alert('There was a problem starting checkout. Please try again or contact us at ivypathacademy@gmail.com');
      btn.textContent = 'Proceed to Checkout';
      btn.disabled = false;
    }
  }

})();
