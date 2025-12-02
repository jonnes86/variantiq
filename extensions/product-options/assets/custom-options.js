class CustomProductOptions {
  constructor(productId, appUrl) {
    this.productId = productId;
    this.appUrl = appUrl;
    this.container = document.getElementById(`custom-options-${productId}`);
    this.template = null;
    this.fields = [];
    this.rules = [];
    this.fieldValues = {};

    this.init();
  }

  async init() {
    try {
      await this.loadTemplate();
      if (this.template) {
        this.render();
        this.attachEventListeners();
        this.evaluateAllRules();
        this.applyButtonStyles();
      } else {
        this.container.innerHTML = '';
      }
    } catch (error) {
      console.error('Failed to load custom options:', error);
      this.container.innerHTML = '<p style="color: red;">Failed to load custom options</p>';
    }
  }

  async loadTemplate() {
    const response = await fetch(`https://${this.appUrl}.myshopify.com/apps/variantiq/api/template/${this.productId}`);
    if (!response.ok) {
      if (response.status === 404) {
        this.container.innerHTML = '';
        return;
      }
      throw new Error('Failed to load template');
    }

    const data = await response.json();
    this.template = data.template;
    this.fields = data.fields;
    this.rules = data.rules;
  }

  render() {
    if (!this.fields || this.fields.length === 0) {
      this.container.innerHTML = '';
      return;
    }

    const html = `
      <div class="custom-options" style="border: 1px solid #e0e0e0; padding: 20px; margin: 20px 0; border-radius: 8px;">
        <h3 style="margin-top: 0;">${this.template.name}</h3>
        <form id="custom-options-form-${this.productId}" class="custom-options-form">
          ${this.fields.map(field => this.renderField(field)).join('')}
        </form>
      </div>
    `;

    this.container.innerHTML = html;
  }

  renderField(field) {
    const isRequired = field.required ? 'required' : '';
    const requiredLabel = field.required ? '<span style="color: red;">*</span>' : '';
    let inputHtml = '';

    switch (field.type) {
      case 'text':
        inputHtml = `
          <input type="text" id="field-${field.id}" name="custom_${field.name}" data-field-id="${field.id}" ${isRequired}
            style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 16px;" />
        `;
        break;
      case 'select':
        const options = field.optionsJson || [];
        inputHtml = `
          <select id="field-${field.id}" name="custom_${field.name}" data-field-id="${field.id}" ${isRequired}
            style="width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 16px;">
            <option value="">Select an option...</option>
            ${options.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
          </select>
        `;
        break;
      case 'radio':
        const radioOptions = field.optionsJson || [];
        inputHtml = `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${radioOptions.map((opt, idx) => `
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="radio" id="field-${field.id}-${idx}" name="custom_${field.name}" data-field-id="${field.id}" value="${opt}" ${isRequired} style="cursor: pointer;" />
                <span>${opt}</span>
              </label>
            `).join('')}
          </div>
        `;
        break;
      case 'checkbox':
        const checkboxOptions = field.optionsJson || [];
        inputHtml = `
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${checkboxOptions.map((opt, idx) => `
              <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                <input type="checkbox" id="field-${field.id}-${idx}" name="custom_${field.name}[]" data-field-id="${field.id}" value="${opt}" style="cursor: pointer;" />
                <span>${opt}</span>
              </label>
            `).join('')}
          </div>
        `;
        break;
      default:
        inputHtml = '<p>Unsupported field type</p>';
    }

    return `
      <div class="custom-field" data-field-id="${field.id}" style="margin-bottom: 20px;">
        <label style="display: block; margin-bottom: 8px; font-weight: 600;">${field.label}${requiredLabel}</label>
        ${inputHtml}
      </div>
    `;
  }

  attachEventListeners() {
    const form = document.getElementById(`custom-options-form-${this.productId}`);
    if (!form) return;

    form.addEventListener('change', (e) => {
      this.updateFieldValue(e.target);
      this.evaluateAllRules();
    });

    form.addEventListener('input', (e) => {
      if (e.target.type === 'text') {
        this.updateFieldValue(e.target);
        this.evaluateAllRules();
      }
    });

    this.interceptAddToCart();
  }

  updateFieldValue(element) {
    const fieldId = element.getAttribute('data-field-id');
    const fieldName = element.name.replace('custom_', '').replace('[]', '');

    if (element.type === 'checkbox') {
      const checkboxes = document.querySelectorAll(`[data-field-id="${fieldId}"]:checked`);
      this.fieldValues[fieldName] = Array.from(checkboxes).map(cb => cb.value);
    } else if (element.type === 'radio') {
      this.fieldValues[fieldName] = element.value;
    } else {
      this.fieldValues[fieldName] = element.value;
    }
  }

  evaluateAllRules() {
    this.rules.forEach(rule => {
      const shouldTrigger = this.evaluateExpression(rule.expression);
      this.applyRule(rule, shouldTrigger);
    });
  }

  evaluateExpression(expression) {
    try {
      let evalExpression = expression;
      for (const [fieldName, value] of Object.entries(this.fieldValues)) {
        const fieldValue = Array.isArray(value) ? JSON.stringify(value) : `"${value}"`;
        evalExpression = evalExpression.replace(new RegExp(`\\b${fieldName}\\b`, 'g'), fieldValue);
      }

      evalExpression = evalExpression.replace(/(\[[^\]]+\])\s+includes\s+"([^"]+)"/g, '$1.includes("$2")');
      evalExpression = evalExpression.replace(/"([^"]+)"\s*==\s*"([^"]+)"/g, '"$1" === "$2"');
      evalExpression = evalExpression.replace(/"([^"]+)"\s*!=\s*"([^"]+)"/g, '"$1" !== "$2"');

      return eval(evalExpression);
    } catch (error) {
      console.error('Failed to evaluate expression:', expression, error);
      return false;
    }
  }

  applyRule(rule, shouldTrigger) {
    const targetFieldId = rule.payloadJson?.targetFieldId;
    if (!targetFieldId) return;

    const fieldContainer = document.querySelector(`.custom-field[data-field-id="${targetFieldId}"]`);
    if (!fieldContainer) return;

    const inputs = fieldContainer.querySelectorAll('input, select, textarea');

    switch (rule.action) {
      case 'show':
        fieldContainer.style.display = shouldTrigger ? 'block' : 'none';
        break;
      case 'hide':
        fieldContainer.style.display = shouldTrigger ? 'none' : 'block';
        break;
      case 'require':
        inputs.forEach(input => {
          if (shouldTrigger) input.setAttribute('required', 'required');
          else input.removeAttribute('required');
        });
        break;
      case 'disable':
        inputs.forEach(input => {
          input.disabled = shouldTrigger;
        });
        break;
    }
  }

  interceptAddToCart() {
    const addToCartForms = document.querySelectorAll('form[action*="/cart/add"]');
    addToCartForms.forEach(form => {
      form.addEventListener('submit', (e) => {
        if (!this.validateFields()) {
          e.preventDefault();
          alert('Please fill in all required custom fields.');
          return false;
        }
        this.addCustomDataToCart(form);
      });
    });
  }

  validateFields() {
    const form = document.getElementById(`custom-options-form-${this.productId}`);
    if (!form) return true;

    const requiredInputs = form.querySelectorAll('[required]');
    for (const input of requiredInputs) {
      const fieldContainer = input.closest('.custom-field');
      if (fieldContainer && fieldContainer.style.display === 'none') continue;
      if (input.type === 'checkbox' || input.type === 'radio') {
        const name = input.name;
        const checked = form.querySelector(`[name="${name}"]:checked`);
        if (!checked) return false;
      } else if (!input.value.trim()) {
        return false;
      }
    }
    return true;
  }

  addCustomDataToCart(cartForm) {
    for (const [fieldName, value] of Object.entries(this.fieldValues)) {
      if (!value || (Array.isArray(value) && value.length === 0)) continue;
      const displayValue = Array.isArray(value) ? value.join(', ') : value;
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = `properties[${fieldName}]`;
      input.value = displayValue;
      cartForm.appendChild(input);
    }
  }

  applyButtonStyles() {
    const style = this.template || {};
    const buttons = document.querySelectorAll('form[action*="/cart/add"] button[type="submit"], form[action*="/cart/add"] input[type="submit"]');

    buttons.forEach(btn => {
      if (style.fontFamily) btn.style.fontFamily = style.fontFamily;
      if (style.fontSize) btn.style.fontSize = style.fontSize;
      if (style.fontWeight) btn.style.fontWeight = style.fontWeight;
      if (style.textColor) btn.style.color = style.textColor;
      if (style.backgroundColor) btn.style.backgroundColor = style.backgroundColor;
      if (style.borderColor) btn.style.border = `1px solid ${style.borderColor}`;
      if (style.borderRadius) btn.style.borderRadius = style.borderRadius;
      if (style.padding) btn.style.padding = style.padding;

      if (style.hoverBackgroundColor || style.hoverTextColor) {
        const originalBg = btn.style.backgroundColor;
        const originalColor = btn.style.color;

        btn.addEventListener('mouseenter', () => {
          if (style.hoverBackgroundColor) btn.style.backgroundColor = style.hoverBackgroundColor;
          if (style.hoverTextColor) btn.style.color = style.hoverTextColor;
        });

        btn.addEventListener('mouseleave', () => {
          if (style.hoverBackgroundColor) btn.style.backgroundColor = originalBg;
          if (style.hoverTextColor) btn.style.color = originalColor;
        });
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const wrappers = document.querySelectorAll('.product-options-wrapper');
  wrappers.forEach(wrapper => {
    const productId = wrapper.getAttribute('data-product-id');
    const appUrl = wrapper.getAttribute('data-app-url');
    if (productId && appUrl) {
      new CustomProductOptions(productId, appUrl);
    }
  });
});
