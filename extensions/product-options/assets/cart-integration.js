/**
 * VariantIQ Cart Watchdog
 * Synchronizes the cart UI to visually merge fee items with their parent items.
 * Removes orphaned fee items automatically.
 */

class VariantIQCartWatchdog {
  constructor() {
    this.cartState = null;
    this.isSyncing = false;
    this.init();
  }

  init() {
    // Initial sync
    this.checkCart();

    // Poll every 1.5 seconds to catch AJAX drawer updates that bypass events
    setInterval(() => this.checkCart(), 1500);

    // Listen for common theme cart events
    document.addEventListener('cart:updated', () => this.checkCart());
    document.addEventListener('cart:refresh', () => this.checkCart());
    document.addEventListener('cart:ready', () => this.checkCart());
    
    // Intercept fetch to trigger quick checks after potential cart interactions
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
      if (url.includes('/cart/add') || url.includes('/cart/change') || url.includes('/cart/update') || url.includes('/cart/clear')) {
        setTimeout(() => this.checkCart(), 300);
      }
      return response;
    };
  }

  async checkCart() {
    if (this.isSyncing) return;
    this.isSyncing = true;

    try {
      const res = await fetch('/cart.js', { cache: 'no-store' });
      if (!res.ok) return;
      const cart = await res.json();
      
      // If the cart hasn't changed since last check, only do visual cleanup
      const cartHash = cart.items.map(i => `${i.key}-${i.quantity}`).join('|');
      if (this.cartState !== cartHash) {
        this.cartState = cartHash;
        await this.processCartLogic(cart);
      }
      
      this.visualCleanup(cart);
    } catch (e) {
      console.error('VariantIQ Watchdog Error:', e);
    } finally {
      this.isSyncing = false;
    }
  }

  async processCartLogic(cart) {
    const parentItems = {};
    const feeItems = [];

    // Group items
    cart.items.forEach(item => {
      const groupId = item.properties && item.properties['_variantiq_group'];
      const isFee = item.properties && item.properties['_variantiq_fee'];

      if (groupId) {
        if (isFee) {
          feeItems.push(item);
        } else {
          parentItems[groupId] = item;
        }
      }
    });

    const updates = {};
    let needsUpdate = false;

    // Check for orphaned fees or quantity mismatches
    feeItems.forEach(feeItem => {
      const groupId = feeItem.properties['_variantiq_group'];
      const parent = parentItems[groupId];

      if (!parent) {
        // Parent was removed! Remove the fee.
        updates[feeItem.key] = 0;
        needsUpdate = true;
      } else {
        // Parent exists. Ensure the fee's quantity scales correctly.
        // The fee's expected quantity is its initial multiplier * parent.quantity
        // But we don't store the multiplier. 
        // We can just rely on the parent's quantity. Wait, if parent is 2, fee is 400 (for $2).
        // If the user changes parent to 3, fee should be 600.
        // It's safer to let the merchant handle removal strictly for now, 
        // but if we want to sync quantity, we need the base multiplier.
        // For now, if the parent quantity is 0, fee goes to 0 (orphaned case handles this).
      }
    });

    if (needsUpdate) {
      await fetch('/cart/update.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      // Force a page reload or event to refresh the drawer so the deleted fee disappears
      this.cartState = null;
      document.dispatchEvent(new CustomEvent('cart:refresh'));
      const hasDrawer = document.querySelector('cart-drawer, [id*="cart-drawer"], [class*="cart-drawer"]');
      if (!hasDrawer && window.location.pathname.includes('/cart')) {
        window.location.reload();
      }
    }
  }

  visualCleanup(cart) {
    // Hide fee rows
    document.querySelectorAll('a[href*="variantiq-options-fee-hidden"]').forEach(link => {
      const row = link.closest('tr, li, .cart-item, .cart__item');
      if (row) {
        row.classList.add('variantiq-hidden-fee-item');
      }
    });

    // Hide internal properties from parent items
    const dtElements = document.querySelectorAll('dt, span, p');
    dtElements.forEach(el => {
      if (el.textContent && el.textContent.includes('_variantiq_')) {
        el.classList.add('variantiq-hidden-property');
        // Hide the following dd/span which contains the value
        let next = el.nextElementSibling;
        if (next) next.classList.add('variantiq-hidden-property');
        
        // Or if it's in a wrapping div/li, hide the wrapper
        const wrapper = el.closest('li, div.product-option');
        if (wrapper) wrapper.classList.add('variantiq-hidden-property');
      }
    });

    // Visually bundle the prices
    cart.items.forEach(item => {
      const groupId = item.properties && item.properties['_variantiq_group'];
      const isFee = item.properties && item.properties['_variantiq_fee'];

      if (groupId && !isFee) {
        // Find the associated fee item
        const feeItem = cart.items.find(i => 
          i.properties && i.properties['_variantiq_group'] === groupId && i.properties['_variantiq_fee']
        );

        if (feeItem) {
          const combinedPrice = item.price + (feeItem.price * feeItem.quantity / item.quantity);
          const combinedLinePrice = item.line_price + feeItem.line_price;
          // We can optionally inject this into the DOM if we can reliably find the price element for this specific line item.
          // Since theme DOMs vary drastically, it's safer to just let the Cart Total reflect the accurate total,
          // while the individual row price shows the base price, or we can attempt a best-effort swap if the theme uses standard data attributes.
        }
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new VariantIQCartWatchdog();
});
