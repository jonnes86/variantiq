/**
 * VariantIQ Product Fields
 * Handles cascading dropdown logic for custom product options
 */

class VariantIQFields {
  constructor(container) {
    this.container = container;
    this.productId = container.dataset.productId;
    this.shop = container.dataset.shop;
    this.apiUrl = container.dataset.apiUrl;
    this.templateData = null;
    this.fieldValues = {};
    this.init();
  }

  async init() {
    try {
      this.findBasePrice();
      await this.fetchTemplate();
      this.render();
      this.attachEventListeners();
    } catch (error) {
      console.error('VariantIQ initialization error:', error);
      this.showError();
    }
  }

  findBasePrice() {
    this.priceElement = document.querySelector('.price-item--regular, .price__regular, .product__price, [data-product-price]');
    if (this.priceElement) {
      this.originalPriceHTML = this.priceElement.innerHTML;
      this.originalPriceText = this.priceElement.innerText.trim();

      const match = this.originalPriceText.match(/[\d,\.]+/);
      if (match) {
        this.basePrice = parseFloat(match[0].replace(/,/g, ''));
      }
    }
  }

  async fetchTemplate() {
    const productGid = `gid://shopify/Product/${this.productId}`;
    const response = await fetch(`${this.apiUrl}/api/template/${encodeURIComponent(productGid)}`);

    if (!response.ok) {
      throw new Error('Failed to fetch template');
    }

    const data = await response.json();
    this.templateData = data;
  }

  render() {
    const container = document.getElementById(`variantiq-fields-${this.productId}`);

    if (!this.templateData || !this.templateData.template) {
      container.innerHTML = '<p class="variantiq-no-options">No customization options available.</p>';
      return;
    }

    const { fields } = this.templateData.template;

    if (!fields || fields.length === 0) {
      container.innerHTML = '<p class="variantiq-no-options">No customization options available.</p>';
      return;
    }

    // Render ALL fields initially. The evaluation engine will hide them if necessary.
    // Sort fields by their configured sort order just in case
    const sortedFields = [...fields].sort((a, b) => a.sort - b.sort);

    let html = '<div class="variantiq-fields">';
    sortedFields.forEach(field => {
      html += this.renderField(field);
    });
    html += '</div>';

    container.innerHTML = html;

    // Run evaluation engine once purely on load to establish baseline visibility
    this.evaluateRules();
  }

  renderField(field) {
    const fieldOptions = field.optionsJson || [];
    const isRequired = field.required ? 'required' : '';
    const requiredMark = field.required ? '<span class="required">*</span>' : '';

    if (field.type === 'radio' || field.type === 'checkbox') {
      let html = `
        <fieldset class="variantiq-field js product-form__input" data-field-id="${field.id}" style="display: none; border: none; padding: 0; margin: 0 0 2rem 0;">
          <legend class="form__label" style="width: 100%; margin-bottom: 0.8rem; text-align: left; display: block;">${field.label}${requiredMark}</legend>
          <div style="display: flex; flex-wrap: wrap; gap: 10px; width: 100%;">
      `;

      fieldOptions.forEach((option, index) => {
        const optionPrice = field.priceAdjustmentsJson && field.priceAdjustmentsJson[option]
          ? ` (+$${parseFloat(field.priceAdjustmentsJson[option]).toFixed(2)})`
          : '';

        html += `
          <input 
            type="${field.type}" 
            id="vq-${this.productId}-${field.id}-${index}" 
            name="vq_${this.productId}_${field.id}${field.type === 'checkbox' ? '[]' : ''}"
            value="${option}"
            ${isRequired}
            class="variantiq-${field.type}"
          />
          <label for="vq-${this.productId}-${field.id}-${index}" data-opt-value="${option}" class="variantiq-${field.type}-label">
            ${option}${optionPrice}
          </label>
        `;
      });
      html += `</div></fieldset>`;
      return html;
    } else {
      let html = `
        <div class="variantiq-field product-form__input" data-field-id="${field.id}" style="display: none; margin: 0 0 2rem 0; text-align: left;">
          <label class="form__label" for="vq-${this.productId}-${field.id}" style="margin-bottom: 0.5rem; display: block;">
            ${field.label}${requiredMark}
          </label>
      `;

      if (field.type === 'text') {
        html += `<input 
          type="text" 
          id="vq-${this.productId}-${field.id}" 
          name="vq_${this.productId}_${field.id}"
          ${isRequired}
          class="variantiq-input"
          style="width: 100%; box-sizing: border-box;"
        />`;
      } else if (field.type === 'select') {
        html += `<select 
          id="vq-${this.productId}-${field.id}" 
          name="vq_${this.productId}_${field.id}"
          ${isRequired}
          class="variantiq-select"
          style="width: 100%; display: block;"
        >
          <option value="">Select ${field.label}...</option>`;

        fieldOptions.forEach(option => {
          const optionPrice = field.priceAdjustmentsJson && field.priceAdjustmentsJson[option]
            ? ` (+$${parseFloat(field.priceAdjustmentsJson[option]).toFixed(2)})`
            : '';
          html += `<option value="${option}" data-opt-value="${option}">${option}${optionPrice}</option>`;
        });

        html += `</select>`;
      }

      html += `</div>`;
      return html;
    }
  }

  attachEventListeners() {
    const container = document.getElementById(`variantiq-fields-${this.productId}`);

    // Listen for both clicks (radio/checkboxes) and input (text/selects)
    container.addEventListener('input', (e) => this.handleFieldChange(e));
    container.addEventListener('change', (e) => this.handleFieldChange(e));

    // Intercept Add to Cart form submission
    this.interceptAddToCart();
  }

  handleFieldChange(e) {
    const fieldElement = e.target.closest('.variantiq-field');
    if (!fieldElement) return;

    const fieldId = fieldElement.dataset.fieldId;
    const field = this.templateData.template.fields.find(f => f.id === fieldId);

    // Get value based on field type
    let value;
    if (field.type === 'checkbox') {
      const checkboxes = fieldElement.querySelectorAll('input[type="checkbox"]:checked');
      value = Array.from(checkboxes).map(cb => cb.value).join(', ');
    } else if (field.type === 'radio') {
      const radio = fieldElement.querySelector('input[type="radio"]:checked');
      value = radio ? radio.value : '';
    } else {
      value = e.target.value;
    }

    this.fieldValues[fieldId] = value;

    // Re-evaluate rules globally every time a generic field changes
    this.evaluateRules();
  }

  evaluateRules() {
    const { fields, rules } = this.templateData.template;

    // Map target fields to the rules that affect them
    const rulesByTarget = {};
    fields.forEach(f => rulesByTarget[f.id] = []);

    if (rules && rules.length > 0) {
      rules.forEach(r => {
        if (rulesByTarget[r.targetFieldId]) {
          rulesByTarget[r.targetFieldId].push(r);
        }
      });
    }

    let missingRequiredEncountered = false;

    // Evaluate in exact sort order to support Waterfall logic
    const sortedFields = [...fields].sort((a, b) => a.sort - b.sort);

    sortedFields.forEach(field => {
      const fieldElement = document.querySelector(`.variantiq-field[data-field-id="${field.id}"]`);
      if (!fieldElement) return;

      const fieldRules = rulesByTarget[field.id];

      let shouldShow = true; // By default, everything is shown
      let limitOptionsSet = null;

      const showRules = fieldRules.filter(r => r.actionType === 'SHOW');
      const hideRules = fieldRules.filter(r => r.actionType === 'HIDE');
      const limitRules = fieldRules.filter(r => r.actionType === 'LIMIT_OPTIONS');

      const evaluateRuleConditions = (rule) => {
        const conditions = rule.conditionsJson || [];
        if (!conditions || conditions.length === 0) return false;

        // ALL conditions in a rule must pass (AND behavior)
        return conditions.every(c => {
          const val = this.fieldValues[c.fieldId] || "";

          switch (c.operator) {
            case 'EQUALS':
              return val === c.value;
            case 'NOT_EQUALS':
              // A non-selection (empty string) implicitly means it doesn't EQUAL standard values, 
              // but we generally only evaluate NOT_EQUALS passing if a field has SOME value.
              // We'll treat strict inequality:
              return val !== "" && val !== c.value;
            case 'CONTAINS':
              return val !== "" && val.includes(c.value);
            default:
              return false;
          }
        });
      };

      if (showRules.length > 0) {
        // If there are SHOW rules targeting this field, it is HIDDEN by default
        shouldShow = showRules.some(evaluateRuleConditions);
      } else if (hideRules.length > 0) {
        // If there are HIDE rules targeting this field, it is SHOWN by default,
        // and hidden if any hide rule evaluates to true.
        shouldShow = !hideRules.some(evaluateRuleConditions);
      }

      // --- WATERFALL LOGIC ---
      // If a previous required field was not filled out, we enforce the waterfall cascade and hide this field
      if (missingRequiredEncountered) {
        shouldShow = false;
      }

      // Check for limits
      const passingLimitRules = limitRules.filter(evaluateRuleConditions);
      if (passingLimitRules.length > 0) {
        limitOptionsSet = new Set();
        // Union of all passing limit rules options
        passingLimitRules.forEach(r => {
          const opts = r.targetOptionsJson || [];
          opts.forEach(o => limitOptionsSet.add(o));
        });
      }

      // Apply visibility outcome
      if (shouldShow) {
        fieldElement.style.display = 'block';

        // Apply Limit Options to DOM choices
        if (limitOptionsSet !== null) {
          this.applyLimitToOptions(field, fieldElement, limitOptionsSet);
        } else {
          this.restoreAllOptions(field, fieldElement);
        }
      } else {
        fieldElement.style.display = 'none';
        this.clearFieldValue(field, fieldElement);
      }

      // --- WATERFALL ADVANCE ---
      // If this field is currently shown, is marked as required, but has no value selected...
      // Flag it so that the NEXT field in the iteration loop gets hidden.
      if (shouldShow && field.required) {
        const val = this.fieldValues[field.id];
        if (!val || val.trim() === '') {
          missingRequiredEncountered = true;
        }
      }
    });

    // Update the base price mathematically after computing the active cascade
    this.updatePriceDisplay();
  }

  updatePriceDisplay() {
    if (!this.priceElement || typeof this.basePrice === 'undefined') return;

    let adjustmentsTotal = 0;

    // Sum active price upgrades for visible fields only
    const visibleFields = this.getVisibleFields();
    visibleFields.forEach(field => {
      const val = this.fieldValues[field.id];
      if (val && field.priceAdjustmentsJson) {
        if (field.type === 'checkbox') {
          const selectedOpts = val.split(', ').map(s => s.trim());
          selectedOpts.forEach(opt => {
            if (field.priceAdjustmentsJson[opt]) {
              adjustmentsTotal += parseFloat(field.priceAdjustmentsJson[opt]);
            }
          });
        } else {
          if (field.priceAdjustmentsJson[val]) {
            adjustmentsTotal += parseFloat(field.priceAdjustmentsJson[val]);
          }
        }
      }
    });

    // Write DOM modification
    if (adjustmentsTotal > 0) {
      const newTotal = (this.basePrice + adjustmentsTotal).toFixed(2);
      // Use string replace to safely insert the injected price while maintaining currency symbols
      const newText = this.originalPriceText.replace(/[\d,\.]+/, newTotal);
      this.priceElement.innerText = newText;
    } else {
      // Revert exactly to the initial parsed text node or HTML
      this.priceElement.innerHTML = this.originalPriceHTML;
    }
  }

  applyLimitToOptions(field, fieldElement, limitSet) {
    if (field.type === 'text') return; // Cannot limit a text field.

    if (field.type === 'select') {
      const options = fieldElement.querySelectorAll('option');
      options.forEach(opt => {
        if (!opt.value) return; // Skip placeholder option
        if (limitSet.has(opt.value)) {
          opt.style.display = '';
        } else {
          opt.style.display = 'none';
          // If the currently selected option is now hidden, clear it
          if (opt.selected) {
            opt.selected = false;
            fieldElement.querySelector('select').value = "";
            this.fieldValues[field.id] = "";
          }
        }
      });
    } else if (field.type === 'radio' || field.type === 'checkbox') {
      const labels = fieldElement.querySelectorAll('label[data-opt-value]');
      labels.forEach(label => {
        const val = label.dataset.optValue;
        const inputId = label.getAttribute('for');
        const input = document.getElementById(inputId);

        if (limitSet.has(val)) {
          label.style.display = '';
        } else {
          label.style.display = 'none';
          if (input && input.checked) {
            input.checked = false;
            // update field value
            this.updateValueFromDOM(field, fieldElement);
          }
        }
      });
    }
  }

  restoreAllOptions(field, fieldElement) {
    if (field.type === 'text') return;

    if (field.type === 'select') {
      const options = fieldElement.querySelectorAll('option');
      options.forEach(opt => opt.style.display = '');
    } else if (field.type === 'radio' || field.type === 'checkbox') {
      const labels = fieldElement.querySelectorAll('label[data-opt-value]');
      labels.forEach(label => label.style.display = '');
    }
  }

  clearFieldValue(field, fieldElement) {
    // Prevent propagating hidden values into validations and line items
    this.fieldValues[field.id] = "";

    if (field.type === 'text') {
      const input = fieldElement.querySelector('input');
      if (input) input.value = '';
    } else if (field.type === 'select') {
      const select = fieldElement.querySelector('select');
      if (select) select.value = '';
    } else if (field.type === 'radio' || field.type === 'checkbox') {
      const inputs = fieldElement.querySelectorAll('input');
      inputs.forEach(i => i.checked = false);
    }
  }

  updateValueFromDOM(field, fieldElement) {
    let value;
    if (field.type === 'checkbox') {
      const checkboxes = fieldElement.querySelectorAll('input[type="checkbox"]:checked');
      value = Array.from(checkboxes).map(cb => cb.value).join(', ');
    } else if (field.type === 'radio') {
      const radio = fieldElement.querySelector('input[type="radio"]:checked');
      value = radio ? radio.value : '';
    } else {
      const input = fieldElement.querySelector('input, select');
      value = input ? input.value : '';
    }
    this.fieldValues[field.id] = value;
  }

  interceptAddToCart() {
    // Wait for DOM to be fully ready
    const tryIntercept = () => {
      // Find the Add to Cart button
      const addToCartButton = document.querySelector(
        'button[name="add"], button[type="submit"][form*="product"], input[type="submit"][name="add"], [id*="AddToCart"], [class*="add-to-cart"]'
      );

      if (!addToCartButton) {
        console.warn('VariantIQ: Could not find Add to Cart button');
        return false;
      }

      console.log('VariantIQ: Found Add to Cart button:', addToCartButton);

      const form = addToCartButton.closest('form') || document.querySelector('form[action*="/cart/add"]');

      // Intercept the click instead of form submit (works better with AJAX carts)
      addToCartButton.addEventListener('click', async (e) => {
        console.log('VariantIQ: Add to Cart button clicked');

        // Validate required fields
        const validation = this.validateFields();

        if (!validation.valid) {
          console.log('VariantIQ: Validation failed:', validation.message);
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          this.showValidationError(validation.message);
          return false;
        }

        console.log('VariantIQ: Validation passed');

        if (form) {
          // Calculate if there is an active price fee
          let adjustmentsTotal = 0;
          const visibleFields = this.getVisibleFields();
          visibleFields.forEach(field => {
            const val = this.fieldValues[field.id];
            if (val && field.priceAdjustmentsJson) {
              if (field.type === 'checkbox') {
                val.split(', ').forEach(opt => {
                  if (field.priceAdjustmentsJson[opt.trim()]) {
                    adjustmentsTotal += parseFloat(field.priceAdjustmentsJson[opt.trim()]);
                  }
                });
              } else {
                if (field.priceAdjustmentsJson[val]) {
                  adjustmentsTotal += parseFloat(field.priceAdjustmentsJson[val]);
                }
              }
            }
          });

          if (adjustmentsTotal > 0) {
            // Hijack the cart submit completely to push multiple items
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const originalText = addToCartButton.innerHTML;
            addToCartButton.innerHTML = 'Syncing Cart...';
            addToCartButton.disabled = true;

            await this.addFeeAndPropertiesToCart(form, adjustmentsTotal);

            // Redirect specifically to cart to view combined items
            window.location.href = '/cart';
            return false;
          } else {
            // Standard property injection
            this.addPropertiesToCart(form);
            // Allow native form submission / AJAX drawer to continue
          }
        } else {
          console.error('VariantIQ: Could not find form to add properties');
        }
      }, true); // Use capture phase to run before other handlers

      return true;
    };

    // Try immediately
    if (!tryIntercept()) {
      // If failed, try again after delays (for dynamic content)
      setTimeout(tryIntercept, 500);
      setTimeout(tryIntercept, 1000);
      setTimeout(tryIntercept, 2000);
    }
  }

  validateFields() {
    const { fields } = this.templateData.template;
    const visibleFields = this.getVisibleFields();

    for (const field of visibleFields) {
      if (field.required) {
        const value = this.fieldValues[field.id];

        if (!value || value.trim() === '') {
          return {
            valid: false,
            message: `Please fill in the required field: ${field.label}`
          };
        }
      }
    }

    return { valid: true };
  }

  getVisibleFields() {
    // Get all currently visible fields in the DOM
    const visibleFieldElements = document.querySelectorAll('.variantiq-field');
    const visibleFieldIds = Array.from(visibleFieldElements)
      .filter(el => el.style.display !== 'none')
      .map(el => el.dataset.fieldId);

    return this.templateData.template.fields.filter(f => visibleFieldIds.includes(f.id));
  }

  addPropertiesToCart(form) {
    // Remove any existing VariantIQ properties to avoid duplicates
    const existingProperties = form.querySelectorAll('.variantiq-cart-prop');
    existingProperties.forEach(input => input.remove());

    // Add each visible field value as a line item property
    const visibleFields = this.getVisibleFields();
    visibleFields.forEach(field => {
      const value = this.fieldValues[field.id];
      if (value && value.trim() !== '') {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = `properties[${field.label}]`;
        input.value = value;
        input.className = 'variantiq-cart-prop';
        form.appendChild(input);
      }
    });
  }

  async addFeeAndPropertiesToCart(form, adjustmentsTotal) {
    this.addPropertiesToCart(form);

    // Create unique group ID to link the main product and the fee in the cart
    const groupId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'properties[_variantiq_group]';
    input.value = groupId;
    input.className = 'variantiq-cart-prop';
    form.appendChild(input);

    const formData = new FormData(form);

    try {
      // Fetch dummy product variant ID directly from Shopify's open Storefront JSON wrapper
      const optionsRes = await fetch('/products/variantiq-options-fee-hidden.js');
      if (!optionsRes.ok) throw new Error('Dummy product missing from Shopify Storefront');
      const dummyProduct = await optionsRes.json();
      const dummyVariantId = dummyProduct.variants[0].id;

      const feeQuantity = Math.round(adjustmentsTotal * 100);

      // Inject Fee Product
      const feeFormData = new URLSearchParams();
      feeFormData.append('id', dummyVariantId);
      feeFormData.append('quantity', feeQuantity);
      feeFormData.append('properties[_variantiq_group]', groupId);
      feeFormData.append('properties[_variantiq_fee]', 'true');

      await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: feeFormData.toString(),
      });

      // Inject Main Product
      await fetch('/cart/add.js', {
        method: 'POST',
        body: formData,
      });

    } catch (e) {
      console.error('VariantIQ Cart Override Failed:', e);
      // Fallback: Submit strictly to prevent blocking checkout completely
      HTMLFormElement.prototype.submit.call(form);
    }
  }

  showValidationError(message) {
    // Remove any existing error
    const existingError = document.querySelector('.variantiq-validation-error');
    if (existingError) {
      existingError.remove();
    }

    // Create error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'variantiq-validation-error';
    errorDiv.style.cssText = 'background: #fee; border: 2px solid #c33; padding: 12px; margin: 16px 0; border-radius: 4px; color: #c33; font-weight: 500;';
    errorDiv.textContent = message;

    // Insert before the fields container
    const container = this.container;
    container.parentNode.insertBefore(errorDiv, container);

    // Scroll to error
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Remove after 5 seconds
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }

  showError() {
    const errorDiv = document.getElementById('variantiq-error');
    const container = document.getElementById(`variantiq-fields-${this.productId}`);

    if (errorDiv) errorDiv.style.display = 'block';
    if (container) container.style.display = 'none';
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  const containers = document.querySelectorAll('.variantiq-product-options');
  containers.forEach(container => {
    new VariantIQFields(container);
  });
});
