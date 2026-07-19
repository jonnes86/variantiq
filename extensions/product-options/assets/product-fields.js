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
    this.dynamicFieldPrices = {};
    this.ssInventory = [];
    this.instanceId = Math.random().toString(36).substr(2, 9);
    this.init();
  }

  async init() {
    try {
      console.log('[VariantIQ] init() starting for product:', this.productId, 'shop:', this.shop, 'apiUrl:', this.apiUrl);
      this.findBasePrice();
      await Promise.all([
        this.fetchTemplate(),
        this.fetchSSInventory()
      ]);
      console.log('[VariantIQ] Template data received:', JSON.stringify({
        hasTemplate: !!this.templateData?.template,
        templateName: this.templateData?.template?.name,
        fieldCount: this.templateData?.template?.fields?.length,
        ruleCount: this.templateData?.template?.rules?.length,
      }));
      this.detectThemeStyles();
      this.render();
      this.attachEventListeners();
    } catch (error) {
      console.error('VariantIQ initialization error:', error);
      this.showError();
    }
  }

  findBasePrice() {
    this.priceElement = document.querySelector('.price-item--regular') || 
                        document.querySelector('.price__regular') || 
                        document.querySelector('.product__price') || 
                        document.querySelector('[data-product-price]');
    
    if (this.priceElement) {
      this.originalPriceHTML = this.priceElement.innerHTML;
      this.originalPriceText = this.priceElement.innerText.trim();

      const match = this.originalPriceText.match(/[\d,\.]+/);
      if (match) {
        this.basePrice = parseFloat(match[0].replace(/,/g, ''));
      }
    }
  }

  detectThemeStyles() {
    // Find the Shopify theme's native variant/option buttons and read their styles
    const themeBtn = document.querySelector('.product-form__input label, .product-form__input .swatch-input label, variant-radios label, .variant-picker label, .variant-input label');
    if (themeBtn) {
      const cs = window.getComputedStyle(themeBtn);
      this.themeBtn = {
        borderRadius: cs.borderRadius || '0px',
        borderWidth: cs.borderWidth || '1px',
        borderStyle: cs.borderStyle || 'solid',
        borderColor: cs.borderColor || '#e5e7eb',
        padding: cs.padding || '8px 16px',
        fontSize: cs.fontSize || '14px',
        fontFamily: cs.fontFamily || 'inherit',
        fontWeight: cs.fontWeight || 'normal',
        letterSpacing: cs.letterSpacing || 'normal',
        textTransform: cs.textTransform || 'none',
        background: cs.backgroundColor || '#ffffff',
        color: cs.color || '#1a1a1a',
        minWidth: cs.minWidth || 'auto',
        minHeight: cs.minHeight || 'auto',
        lineHeight: cs.lineHeight || '1.3',
      };
      console.log('[VariantIQ] Detected theme button styles:', this.themeBtn);
    } else {
      // Fallback defaults
      this.themeBtn = {
        borderRadius: '0px',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: '#e5e7eb',
        padding: '8px 16px',
        fontSize: '14px',
        fontFamily: 'inherit',
        fontWeight: 'normal',
        letterSpacing: 'normal',
        textTransform: 'none',
        background: '#ffffff',
        color: '#1a1a1a',
        minWidth: 'auto',
        minHeight: 'auto',
        lineHeight: '1.3',
      };
      console.log('[VariantIQ] No theme buttons found, using defaults');
    }
    // Also detect the active/selected state by finding a checked variant
    const activeLabel = document.querySelector('.product-form__input input:checked + label, variant-radios input:checked + label, .variant-picker input:checked + label');
    if (activeLabel) {
      const acs = window.getComputedStyle(activeLabel);
      this.themeBtnActive = {
        borderColor: acs.borderColor || '#1a1a1a',
        background: acs.backgroundColor || '#f3f4f6',
        fontWeight: acs.fontWeight || '600',
        color: acs.color || '#1a1a1a',
      };
    } else {
      this.themeBtnActive = {
        borderColor: '#1a1a1a',
        background: '#f3f4f6',
        fontWeight: '600',
        color: '#1a1a1a',
      };
    }
  }

  getThemeBtnStyle() {
    const t = this.themeBtn;
    return `display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:${t.padding};border-radius:${t.borderRadius};cursor:pointer;border:${t.borderWidth} ${t.borderStyle} ${t.borderColor};background:${t.background};font-size:${t.fontSize};font-family:${t.fontFamily};font-weight:${t.fontWeight};letter-spacing:${t.letterSpacing};text-transform:${t.textTransform};line-height:${t.lineHeight};color:${t.color};min-width:${t.minWidth};min-height:${t.minHeight};outline:none;transition:all 0.15s;white-space:nowrap;box-sizing:border-box;`;
  }

  async fetchTemplate() {
    const productGid = `gid://shopify/Product/${this.productId}`;
    const response = await fetch(`${this.apiUrl}/api/template/${encodeURIComponent(productGid)}`);

    if (!response.ok) {
      throw new Error('Failed to fetch template');
    }

    const data = await response.json();
    this.templateData = data;

    // Track View Analytic
    if (this.templateData && this.templateData.template && this.templateData.template.id) {
      this.trackAnalytics('view');
    }
  }

  async fetchSSInventory() {
    try {
      const response = await fetch(`${this.apiUrl}/api/ss-inventory?shop=${encodeURIComponent(this.shop)}&productId=${encodeURIComponent(this.productId)}`);
      if (response.ok) {
        const data = await response.json();
        this.ssInventory = data.items || [];
      }
    } catch (e) {
      console.warn('VariantIQ S&S Inventory fetch failed:', e);
    }
  }

  async fetchSSInventoryForStyle(styleId) {
    try {
      const response = await fetch(`${this.apiUrl}/api/ss-inventory?shop=${encodeURIComponent(this.shop)}&styleId=${encodeURIComponent(styleId)}`);
      if (response.ok) {
        const data = await response.json();
        this.ssInventory = data.items || [];
        this.applySSInventoryRules();
      }
    } catch (e) {
      console.warn('VariantIQ S&S Inventory style fetch failed:', e);
    }
  }

  findSSTriggerFields() {
    if (!this.templateData || !this.templateData.template) return [];
    return this.templateData.template.fields.filter(f => f.ssStyleMappingJson && Object.keys(f.ssStyleMappingJson).length > 0);
  }

  // Get the _styleId for an S&S field when any option is selected
  // Handles both formats: { _styleId: "00708" } (import) and { "OptionA": "00708" } (manual)
  getSSStyleIdForSelection(field, selectedValue) {
    if (!field.ssStyleMappingJson) return null;
    // Import format: _styleId applies to ALL options on this field
    if (field.ssStyleMappingJson._styleId) return field.ssStyleMappingJson._styleId;
    // Manual format: each option maps to a different style
    if (field.ssStyleMappingJson[selectedValue]) return field.ssStyleMappingJson[selectedValue];
    return null;
  }

  // Find the auto-managed Size field
  findAutoSizeField() {
    if (!this.templateData || !this.templateData.template) return null;
    return this.templateData.template.fields.find(f =>
      f.ssStyleMappingJson && f.ssStyleMappingJson._autoSize === true
    );
  }

  // Find whichever S&S color field currently has a selection
  getActiveSSColorField() {
    if (!this.templateData || !this.templateData.template) return null;
    const fields = this.templateData.template.fields;
    // Look for visible S&S color fields that have a value selected
    return fields.find(f =>
      f.ssStyleMappingJson && f.ssStyleMappingJson._styleId &&
      !f.ssStyleMappingJson._autoSize &&
      this.fieldValues[f.id]
    );
  }

  async trackAnalytics(event) {
    if (!this.templateData || !this.templateData.template) return;
    try {
      await fetch(`${this.apiUrl}/api/template/${encodeURIComponent(this.productId)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          templateId: this.templateData.template.id,
          event: event
        })
      });
    } catch (e) {
      console.warn('VariantIQ analytics tracking failed:', e);
    }
  }

  render() {
    const fieldsContainer = this.container.querySelector('.variantiq-fields-container');
    if (!fieldsContainer) { console.warn('[VariantIQ] No fields container found'); return; }

    if (!this.templateData || !this.templateData.template) {
      console.warn('[VariantIQ] No template data loaded:', this.templateData);
      fieldsContainer.innerHTML = '';
      fieldsContainer.style.display = 'none';
      return;
    }

    const { fields } = this.templateData.template;

    if (!fields || fields.length === 0) {
      console.warn('[VariantIQ] Template has no fields:', this.templateData.template.name);
      fieldsContainer.innerHTML = '';
      fieldsContainer.style.display = 'none';
      return;
    }

    console.log(`[VariantIQ] Rendering ${fields.length} fields for template "${this.templateData.template.name}"`);
    fields.forEach(f => console.log(`  → Field: "${f.label}" (type=${f.type}, displayStyle=${f.displayStyle}, options=${(f.optionsJson||[]).length})`));

    const sortedFields = [...fields].sort((a, b) => a.sort - b.sort);

    let html = '<div class="variantiq-fields">';
    sortedFields.forEach(field => {
      html += this.renderField(field);
    });
    html += '</div>';

    fieldsContainer.innerHTML = html;
    fieldsContainer.style.display = 'block';
    this.evaluateRules();
    this.applySSInventoryRules();
    this.updateProgressBar();
  }

  isColorField(field) {
    const name = (field.label || field.name || '').toLowerCase();
    return name.includes('color') || name.includes('colour');
  }

  // Known CSS color names we can render as swatches
  getSwatchBg(colorName) {
    const map = {
      white: '#ffffff', black: '#000000', red: '#ef4444', blue: '#3b82f6',
      navy: '#1e3a5f', green: '#22c55e', yellow: '#eab308', orange: '#f97316',
      purple: '#a855f7', pink: '#ec4899', grey: '#9ca3af', gray: '#9ca3af',
      brown: '#92400e', tan: '#d4a27a', beige: '#f5f0e1', cream: '#fffdd0',
      coral: '#ff6b6b', teal: '#14b8a6', maroon: '#800000', silver: '#c0c0c0',
      gold: '#fbbf24', khaki: '#c3b091', lavender: '#e6e6fa', mint: '#98ff98',
      peach: '#ffcba4', lilac: '#c8a2c8', charcoal: '#36454f', ivory: '#fffff0',
    };
    const key = colorName.toLowerCase().trim();
    return map[key] || null;
  }

  renderColorSwatches(field) {
    const fieldOptions = field.optionsJson || [];
    const isRequired = field.required ? 'required' : '';
    const requiredMark = field.required ? '<span class="required">*</span>' : '';
    let html = `
      <fieldset class="variantiq-field variantiq-swatches js product-form__input" data-field-id="${field.id}" style="display: none; border: none; padding: 0; margin: 0 0 1rem 0;">
        <legend class="form__label" style="width: 100%; margin-bottom: 0.8rem; text-align: left; display: block;">${field.label}${requiredMark}</legend>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
    `;
    const showLabels = field.swatchesJson && field.swatchesJson._showLabels === true;
    fieldOptions.forEach(option => {
      const swatchVal = field.swatchesJson && field.swatchesJson[option] ? field.swatchesJson[option] : this.getSwatchBg(option) || '#dddddd';
      const isImageUrl = swatchVal.startsWith('http');
      const bgStyle = isImageUrl
        ? `background:url('${swatchVal}') center/cover no-repeat;`
        : `background:${swatchVal};`;
      const optionPrice = field.priceAdjustmentsJson && field.priceAdjustmentsJson[option]
          ? ` <span class="variantiq-price-label">(+$${parseFloat(field.priceAdjustmentsJson[option]).toFixed(2)})</span>`
          : ``;
      const labelHtml = showLabels
        ? `<span style="display:block;font-size:10px;line-height:1.2;margin-top:3px;text-align:center;max-width:60px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:break-word;color:var(--color-base-text,#555);">${option}</span>`
        : '';
      html += `
        <div style="display:inline-flex;flex-direction:column;align-items:center;${showLabels ? 'width:64px;' : ''}">
          <button type="button"
            class="variantiq-swatch-btn"
            data-field-id="${field.id}"
            data-value="${option}"
            data-swatch="true"
            title="${option}"
            style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;cursor:pointer;border:2px solid #e5e7eb;${bgStyle}outline:none;transition:transform 0.1s,box-shadow 0.1s,border-color 0.15s;flex-shrink:0;"
            aria-label="${option}"
          ></button>
          ${labelHtml}
        </div>
      `;
    });
    html += `
        </div>
        <div class="variantiq-swatch-selected-label" style="margin-top: 6px; font-size: 13px; color: #6b7280; display: none;"></div>
        <input type="hidden" name="_vq_${this.instanceId}_${field.id}" value="" id="vq-${this.instanceId}-${field.id}" ${isRequired} class="variantiq-swatch-input" />
      </fieldset>
    `;
    return html;
  }

  renderButtonPills(field) {
    const fieldOptions = field.optionsJson || [];
    const isRequired = field.required ? 'required' : '';
    const requiredMark = field.required ? '<span class="required">*</span>' : '';
    let html = `
      <fieldset class="variantiq-field variantiq-button-pills js product-form__input" data-field-id="${field.id}" style="display: none; border: none; padding: 0; margin: 0 0 1rem 0;">
        <legend class="form__label" style="width: 100%; margin-bottom: 0.8rem; text-align: left; display: block;">${field.label}${requiredMark}</legend>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px;">
    `;
    fieldOptions.forEach(option => {
      const optionPrice = field.priceAdjustmentsJson && field.priceAdjustmentsJson[option]
          ? ` <span class="variantiq-price-label">(+$${parseFloat(field.priceAdjustmentsJson[option]).toFixed(2)})</span>`
          : ``;
      html += `
        <button type="button"
          class="variantiq-pill-btn"
          data-field-id="${field.id}"
          data-value="${option}"
          style="${this.getThemeBtnStyle()}"
          aria-label="${option}"
        ><span>${option}${optionPrice}</span></button>
      `;
    });
    html += `
        </div>
        <input type="hidden" name="_vq_${this.instanceId}_${field.id}" value="" id="vq-${this.instanceId}-${field.id}" ${isRequired} class="variantiq-pill-input" />
      </fieldset>
    `;
    return html;
  }

  isDarkColor(hex) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 < 128;
  }

  renderProgressBar() {
    const { fields } = this.templateData.template;
    const required = fields.filter(f => f.required);
    if (required.length === 0) return;
    const existing = this.container.querySelector('.variantiq-progress');
    if (existing) existing.remove();
    const bar = document.createElement('div');
    bar.className = 'variantiq-progress';
    bar.style.cssText = 'margin-bottom:12px;';
    bar.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span class="variantiq-progress-label" style="font-size:13px;color:var(--color-base-text,#444);">
          <span class="variantiq-progress-done">0</span> of ${required.length} required options selected
        </span>
      </div>
      <div style="background:#e5e7eb;border-radius:9999px;height:6px;overflow:hidden;">
        <div class="variantiq-progress-fill" style="height:100%;background:#10b981;border-radius:9999px;width:0%;transition:width 0.3s;"></div>
      </div>
    `;
    const container = this.container.querySelector('.variantiq-fields-container');
    if (container) container.prepend(bar);
  }

  updateProgressBar() {
    const bar = this.container.querySelector('.variantiq-progress');
    if (!bar) return;
    const { fields } = this.templateData.template;
    const visibleRequired = this.getVisibleFields().filter(f => f.required);
    const done = visibleRequired.filter(f => {
      const v = this.fieldValues[f.id];
      return v && v.trim() !== '';
    }).length;
    const total = visibleRequired.length;
    bar.querySelector('.variantiq-progress-done').textContent = done;
    bar.querySelector('.variantiq-progress-label').innerHTML = `<span class="variantiq-progress-done">${done}</span> of ${total} required options selected`;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const fill = bar.querySelector('.variantiq-progress-fill');
    fill.style.width = pct + '%';
    fill.style.background = done === total && total > 0 ? '#10b981' : '#6366f1';
  }

  renderField(field) {

    const fieldOptions = field.optionsJson || [];
    const isRequired = field.required ? 'required' : '';
    const requiredMark = field.required ? '<span class="required">*</span>' : '';

    if (field.displayStyle === 'swatches') {
      return this.renderColorSwatches(field);
    }
    
    if (field.displayStyle === 'button_pills') {
      return this.renderButtonPills(field);
    }

    if (field.type === 'radio' || field.type === 'checkbox') {
      let html = `
        <fieldset class="variantiq-field js product-form__input" data-field-id="${field.id}" style="display: none; border: none; padding: 0; margin: 0 0 1rem 0;">
          <legend class="form__label" style="width: 100%; margin-bottom: 0.8rem; text-align: left; display: block;">${field.label}${requiredMark}</legend>
          <div style="display: flex; flex-wrap: wrap; gap: 10px; width: 100%;">
      `;

      fieldOptions.forEach((option, index) => {
        const optionPrice = field.priceAdjustmentsJson && field.priceAdjustmentsJson[option]
          ? ` <span class="variantiq-price-label">(+$${parseFloat(field.priceAdjustmentsJson[option]).toFixed(2)})</span>`
          : ` <span class="variantiq-price-label"></span>`;


        html += `
          <input 
            type="${field.type}" 
            id="vq-${this.instanceId}-${field.id}-${index}" 
            name="_vq_${this.instanceId}_${field.id}${field.type === 'checkbox' ? '[]' : ''}"
            value="${option}"
            ${isRequired}
            class="variantiq-${field.type}"
          />
          <label for="vq-${this.instanceId}-${field.id}-${index}" data-opt-value="${option}" class="variantiq-${field.type}-label">
            ${option}${optionPrice}
          </label>
        `;
      });
      html += `</div></fieldset>`;
      return html;
    } else {
      let html = `
        <div class="variantiq-field product-form__input" data-field-id="${field.id}" style="display: none; margin: 0 0 1rem 0; text-align: left;">
          <label class="form__label" for="vq-${this.instanceId}-${field.id}" style="margin-bottom: 0.5rem; display: block;">
            ${field.label}${requiredMark}
          </label>
      `;

      if (field.type === 'text') {
        html += `<input 
          type="text" 
          id="vq-${this.instanceId}-${field.id}" 
          name="_vq_${this.instanceId}_${field.id}"
          ${isRequired}
          class="variantiq-input"
          style="width: 100%; box-sizing: border-box;"
        />`;
      } else if (field.type === 'select') {
        html += `<select 
          id="vq-${this.instanceId}-${field.id}" 
          name="_vq_${this.instanceId}_${field.id}"
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
    // Listen for both clicks (radio/checkboxes) and input (text/selects)
    this.container.addEventListener('input', (e) => this.handleFieldChange(e));
    this.container.addEventListener('change', (e) => this.handleFieldChange(e));

    // Color swatch click handler
    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('.variantiq-swatch-btn');
      if (!btn) return;
      const fieldId = btn.dataset.fieldId;
      const value = btn.dataset.value;
      const fieldEl = this.container.querySelector(`.variantiq-field[data-field-id="${fieldId}"]`);
      if (!fieldEl) return;

      // Update hidden input
      const hidden = fieldEl.querySelector('.variantiq-swatch-input');
      if (hidden) hidden.value = value;

      // Update displayed selected label
      const label = fieldEl.querySelector('legend');
      const nameSpan = btn.querySelector('span:last-child') || btn;
      // No separate label span needed - just highlight the active button

      // Toggle active ring on swatches
      fieldEl.querySelectorAll('.variantiq-swatch-btn').forEach(b => {
        b.style.boxShadow = b === btn ? '0 0 0 3px #6366f1' : 'none';
        b.style.transform = b === btn ? 'scale(1.05)' : 'scale(1)';
        b.style.borderColor = b === btn ? '#6366f1' : '#d1d5db';
        b.style.fontWeight = b === btn ? '600' : 'normal';
      });

      // Store value and re-evaluate
      this.fieldValues[fieldId] = value;
      this.evaluateRules();

      // Check if this field has S&S style mapping — if so, fetch inventory for the selected style
      const swatchField = this.templateData.template.fields.find(f => f.id === fieldId);
      const swatchStyleId = swatchField ? this.getSSStyleIdForSelection(swatchField, value) : null;
      console.log(`[VariantIQ] Swatch click: field=${swatchField?.label}, value=${value}, styleId=${swatchStyleId}`);
      if (swatchStyleId) {
        this.fetchSSInventoryForStyle(swatchStyleId);
      }
      this.applySSInventoryRules();
      this.updateProgressBar();
    });

    // Button pill click handler
    this.container.addEventListener('click', (e) => {
      const btn = e.target.closest('.variantiq-pill-btn');
      if (!btn) return;
      const fieldId = btn.dataset.fieldId;
      const value = btn.dataset.value;
      const fieldEl = this.container.querySelector(`.variantiq-field[data-field-id="${fieldId}"]`);
      if (!fieldEl) return;

      // Update hidden input
      const hidden = fieldEl.querySelector('.variantiq-pill-input');
      if (hidden) hidden.value = value;

      // Toggle active style on pills
      const ta = this.themeBtnActive;
      const t = this.themeBtn;
      fieldEl.querySelectorAll('.variantiq-pill-btn').forEach(b => {
        b.style.borderColor = b === btn ? ta.borderColor : t.borderColor;
        b.style.background = b === btn ? ta.background : t.background;
        b.style.fontWeight = b === btn ? ta.fontWeight : t.fontWeight;
        b.style.color = b === btn ? ta.color : t.color;
      });

      // Store value and re-evaluate
      this.fieldValues[fieldId] = value;
      this.evaluateRules();

      // Check if this field has S&S style mapping — if so, fetch inventory for the selected style
      const pillField = this.templateData.template.fields.find(f => f.id === fieldId);
      const pillStyleId = pillField ? this.getSSStyleIdForSelection(pillField, value) : null;
      if (pillStyleId) {
        this.fetchSSInventoryForStyle(pillStyleId);
      }
      this.applySSInventoryRules();
      this.updateProgressBar();
    });

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

    // Check if this field has S&S style mapping — if so, fetch inventory for the selected style
    const changedField = this.templateData.template.fields.find(f => f.id === fieldId);
    const changedStyleId = changedField ? this.getSSStyleIdForSelection(changedField, value) : null;
    if (changedStyleId) {
      this.fetchSSInventoryForStyle(changedStyleId);
    }
    this.applySSInventoryRules();
    this.updateProgressBar();
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
      const fieldElement = this.container.querySelector(`.variantiq-field[data-field-id="${field.id}"]`);
      if (!fieldElement) return;

      const fieldRules = rulesByTarget[field.id];

      let shouldShow = true; // By default, everything is shown
      let limitOptionsSet = null;

      // Filter out rules with empty conditions — these are canvas position markers, not real rules
      const validRules = fieldRules.filter(r => {
        const conds = r.conditionsJson || [];
        return Array.isArray(conds) && conds.length > 0;
      });

      const showRules = validRules.filter(r => r.actionType === 'SHOW');
      const hideRules = validRules.filter(r => r.actionType === 'HIDE');
      const limitRules = validRules.filter(r => r.actionType === 'LIMIT_OPTIONS');
      const setPriceRules = validRules.filter(r => r.actionType === 'SET_PRICE');

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
      // If a previous required field was not filled out, enforce the waterfall cascade.
      // EXCEPTION: fields governed by SHOW rules already encode their ancestor conditions,
      // so we must not additionally override them with the waterfall — doing so would hide
      // deeply nested (3rd-level) dataset fields even when all their conditions pass.
      if (missingRequiredEncountered && showRules.length === 0) {
        shouldShow = false;
      }

      // Check for limits
      const passingLimitRules = limitRules.filter(evaluateRuleConditions);
      if (passingLimitRules.length > 0) {
        limitOptionsSet = new Set();
        // Union of all passing limit rules options
        passingLimitRules.forEach(r => {
          let opts = r.targetOptionsJson || [];
          // targetOptionsJson may arrive as a JSON string — parse it if so
          if (typeof opts === 'string') {
            try { opts = JSON.parse(opts); } catch (e) { opts = []; }
          }
          if (Array.isArray(opts)) {
            opts.forEach(o => limitOptionsSet.add(o));
          }
        });
      }

      // Check for Set Price
      let priceOverride = null;
      const passingPriceRules = setPriceRules.filter(evaluateRuleConditions);
      if (passingPriceRules.length > 0) {
        priceOverride = {};
        passingPriceRules.forEach(r => {
          const adjustments = r.targetPriceAdjustmentsJson || {};
          Object.assign(priceOverride, adjustments);
        });
      }
      this.dynamicFieldPrices[field.id] = priceOverride !== null ? priceOverride : field.priceAdjustmentsJson;

      // Apply visibility outcome
      if (shouldShow) {
        fieldElement.style.display = 'block';
        console.log(`[VariantIQ] evaluateRules: "${field.label}" → SHOW (showRules=${showRules.length}, hideRules=${hideRules.length}, waterfall=${missingRequiredEncountered})`);

        // Apply Limit Options to DOM choices
        if (limitOptionsSet !== null) {
          this.applyLimitToOptions(field, fieldElement, limitOptionsSet);
        } else {
          this.restoreAllOptions(field, fieldElement);
        }

        // Apply visual price label overrides to the DOM
        this.updateDOMPriceLabels(field, fieldElement, this.dynamicFieldPrices[field.id]);

      } else {
        fieldElement.style.display = 'none';
        console.log(`[VariantIQ] evaluateRules: "${field.label}" → HIDE (showRules=${showRules.length}, hideRules=${hideRules.length}, waterfall=${missingRequiredEncountered})`);
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
      const activePrices = this.dynamicFieldPrices[field.id] || field.priceAdjustmentsJson;

      if (val && activePrices) {
        if (field.type === 'checkbox') {
          const selectedOpts = val.split(', ').map(s => s.trim());
          selectedOpts.forEach(opt => {
            if (activePrices[opt]) {
              adjustmentsTotal += parseFloat(activePrices[opt]);
            }
          });
        } else {
          if (activePrices[val]) {
            adjustmentsTotal += parseFloat(activePrices[val]);
          }
        }
      }
    });

    // Write DOM modification
    if (adjustmentsTotal > 0) {
      const newTotal = (this.basePrice + adjustmentsTotal).toFixed(2);
      
      // Update innerHTML instead of innerText to preserve any span structures
      // We look for the first number sequence in the HTML and replace it
      let newHTML = this.originalPriceHTML;
      
      // Find the first occurrence of the number outside of HTML attributes
      // A simple heuristic is to replace the first number that isn't inside a tag definition
      const originalNumStr = this.originalPriceText.match(/[\d,\.]+/)[0];
      
      // If the HTML contains the exact string, replace it safely
      if (newHTML.includes(originalNumStr)) {
         newHTML = newHTML.replace(originalNumStr, newTotal);
         this.priceElement.innerHTML = newHTML;
      } else {
         // Fallback if formatting differs
         this.priceElement.innerText = this.originalPriceText.replace(originalNumStr, newTotal);
      }
    } else {
      // Revert exactly to the initial parsed text node or HTML
      this.priceElement.innerHTML = this.originalPriceHTML;
    }
  }

  updateDOMPriceLabels(field, fieldElement, activePrices) {
    if (field.type === 'text') return;

    // Selects
    if (field.type === 'select') {
      const options = fieldElement.querySelectorAll('option');
      options.forEach(opt => {
        if (!opt.value) return; // ignore placeholder
        const baseText = opt.dataset.optValue || opt.value;
        if (activePrices && activePrices[baseText] && parseFloat(activePrices[baseText]) > 0) {
          opt.textContent = `${baseText} (+$${parseFloat(activePrices[baseText]).toFixed(2)})`;
        } else {
          opt.textContent = baseText;
        }
      });
    }
    // Radios/Checkboxes
    else if (field.type === 'radio' || field.type === 'checkbox') {
      const labels = fieldElement.querySelectorAll('label[data-opt-value]');
      labels.forEach(label => {
        const baseText = label.dataset.optValue;
        const priceSpan = label.querySelector('.variantiq-price-label');
        if (priceSpan) {
          if (activePrices && activePrices[baseText] && parseFloat(activePrices[baseText]) > 0) {
            priceSpan.textContent = ` (+$${parseFloat(activePrices[baseText]).toFixed(2)})`;
          } else {
            priceSpan.textContent = '';
          }
        }
      });
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
        const input = this.container.querySelector('#' + inputId); // Unique ID globally per instance

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

  updateDOMPriceLabels(field, fieldElement, activePrices) {
    if (field.type === 'text') return;

    if (field.type === 'select') {
      const options = fieldElement.querySelectorAll('option');
      options.forEach(opt => {
        if (!opt.value) return;
        const val = opt.getAttribute('data-opt-value');
        const priceStr = activePrices && activePrices[val] ? ` (+$${parseFloat(activePrices[val]).toFixed(2)})` : '';
        opt.textContent = `${val}${priceStr}`;
      });
    } else if (field.type === 'radio' || field.type === 'checkbox') {
      const labels = fieldElement.querySelectorAll('label[data-opt-value]');
      labels.forEach(label => {
        const val = label.dataset.optValue;
        const priceSpan = label.querySelector('.variantiq-price-label');
        if (priceSpan) {
          priceSpan.textContent = activePrices && activePrices[val] ? ` (+$${parseFloat(activePrices[val]).toFixed(2)})` : '';
        }
      });
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

      // GUARD: only attach one listener — prevents duplicate cart adds when
      // multiple tryIntercept() retries all find the same button.
      if (addToCartButton.dataset.variantiqIntercepted) return true;
      addToCartButton.dataset.variantiqIntercepted = 'true';

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
        this.trackAnalytics('add_to_cart');

        if (form) {
          // Calculate active price fees and mapped variants
          let adjustmentsTotal = 0;
          let mappedVariantId = null;

          const visibleFields = this.getVisibleFields();
          visibleFields.forEach(field => {
            const val = this.fieldValues[field.id];
            if (val) {
              // 1. Check for Variant Mappings FIRST (these take priority for base items)
              if (field.variantMappingJson) {
                if (field.type === 'checkbox') {
                  val.split(', ').forEach(opt => {
                    if (field.variantMappingJson[opt.trim()]) {
                      mappedVariantId = field.variantMappingJson[opt.trim()];
                    }
                  });
                } else if (field.variantMappingJson[val]) {
                  mappedVariantId = field.variantMappingJson[val];
                }
              }

              // 2. Tally Up Price Adjustments
              const activePrices = this.dynamicFieldPrices[field.id] || field.priceAdjustmentsJson;
              if (activePrices) {
                if (field.type === 'checkbox') {
                  val.split(', ').forEach(opt => {
                    if (activePrices[opt.trim()]) {
                      adjustmentsTotal += parseFloat(activePrices[opt.trim()]);
                    }
                  });
                } else {
                  if (activePrices[val]) {
                    adjustmentsTotal += parseFloat(activePrices[val]);
                  }
                }
              }
            }
          });

          // If we found a mapped variant, inject it into the form's base ID field
          if (mappedVariantId) {
            console.log(`VariantIQ: Swapping Base Variant ID to Mapped ID: ${mappedVariantId}`);
            let idInput = form.querySelector('input[name="id"]');
            if (idInput) {
              idInput.value = mappedVariantId;
            } else {
              idInput = document.createElement('input');
              idInput.type = 'hidden';
              idInput.name = 'id';
              idInput.value = mappedVariantId;
              form.appendChild(idInput);
            }
          }

          // Hijack the cart submit to inject properties or bundle items via AJAX
          e.preventDefault();
          e.stopPropagation();
          
          const originalHTML = addToCartButton.innerHTML;
          addToCartButton.dataset.originalHtml = originalHTML;
          addToCartButton.innerHTML = adjustmentsTotal > 0 ? 'Syncing Cart...' : 'Adding...';
          addToCartButton.disabled = true;

          try {
            if (adjustmentsTotal > 0) {
              await this.addFeeAndPropertiesToCart(form, adjustmentsTotal);
            } else {
              // Build the properties object from visible field selections
              const properties = {};
              this.getVisibleFields().forEach(field => {
                const val = this.fieldValues[field.id];
                if (val && val.trim() !== '') {
                  const key = field.label || field.name;
                  properties[key] = val;
                }
              });

              // Build the cart/add.js payload from the form, merging in our properties
              const formData = new FormData(form);
              // Remove any pre-existing properties[...] keys the form may have added
              for (const key of [...formData.keys()]) {
                if (key.startsWith('properties[') || key.startsWith('vq_') || key.startsWith('_vq_')) formData.delete(key);
              }
              // Inject VariantIQ properties
              Object.entries(properties).forEach(([k, v]) => {
                formData.append(`properties[${k}]`, v);
              });

              const response = await fetch('/cart/add.js', {
                method: 'POST',
                body: formData,
              });

              if (!response.ok) throw new Error('cart/add.js failed');
            }

            // Dispatch events that AJAX cart themes listen to for drawer refresh
            document.dispatchEvent(new CustomEvent('cart:refresh'));
            document.dispatchEvent(new CustomEvent('theme:cart:open'));
            
            // Dawn / Debut style
            const cartDrawer = document.querySelector('cart-drawer');
            if (cartDrawer && typeof cartDrawer.renderContents === 'function') {
              const refreshRes = await fetch(`${window.Shopify.routes.root}cart.js`);
              const cartData = await refreshRes.json();
              cartDrawer.renderContents({ sections: {}, cartData });
            }

            // Generic fallback: trigger a page reload if no drawer found
            const hasDrawer = document.querySelector('cart-drawer, [id*="cart-drawer"], [class*="cart-drawer"]');
            if (!hasDrawer) {
              window.location.href = '/cart';
            } else {
              // Let the theme update its cart count badge
              fetch('/cart.js').then(r => r.json()).then(cart => {
                document.querySelectorAll('[data-cart-count]').forEach(el => {
                  el.textContent = cart.item_count;
                });
              });
            }
          } catch (err) {
            console.error('VariantIQ: cart/add.js failed, falling back to form submit', err);
            // Fallback: inject hidden inputs and let native form submit proceed
            this.addPropertiesToCart(form);
            HTMLFormElement.prototype.submit.call(form);
          } finally {
            addToCartButton.innerHTML = originalHTML;
            addToCartButton.disabled = false;
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
    // Get all currently visible fields in this component's DOM
    const visibleFieldElements = this.container.querySelectorAll('.variantiq-field');
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
      let value = this.fieldValues[field.id];
      if (value && value.trim() !== '') {
        const activePrices = this.dynamicFieldPrices[field.id] || field.priceAdjustmentsJson;
        if (activePrices) {
          if (field.type === 'checkbox') {
            const selectedOpts = value.split(', ').map(s => s.trim());
            const pricedOpts = selectedOpts.map(opt => {
              if (activePrices[opt] && parseFloat(activePrices[opt]) > 0) {
                return `${opt} (+$${parseFloat(activePrices[opt]).toFixed(2)})`;
              }
              return opt;
            });
            value = pricedOpts.join(', ');
          } else {
            if (activePrices[value] && parseFloat(activePrices[value]) > 0) {
              value = `${value} (+$${parseFloat(activePrices[value]).toFixed(2)})`;
            }
          }
        }

        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = `properties[${field.label || field.name}]`;
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

    // Strip raw vq_ inputs so only clean properties[Label] keys are sent
    const formData = new FormData(form);
    for (const key of [...formData.keys()]) {
      if (key.startsWith('vq_') || key.startsWith('_vq_')) formData.delete(key);
    }

    try {
      let dummyVariantId = this.templateData.dummyVariantId;
      
      if (!dummyVariantId) {
        const optionsRes = await fetch('/products/variantiq-options-fee-hidden.js');
        if (!optionsRes.ok) throw new Error('Dummy product missing from Shopify Storefront');
        const dummyProduct = await optionsRes.json();
        dummyVariantId = dummyProduct.variants[0].id;
      }
      
      let baseQuantity = 1;
      const quantityInput = form.querySelector('input[name="quantity"]');
      if (quantityInput && quantityInput.value) {
        baseQuantity = parseInt(quantityInput.value) || 1;
      }

      const feeQuantity = Math.round(adjustmentsTotal * 100) * baseQuantity;

      const mainId = formData.get('id');
      const mainProperties = {};
      for (const [key, value] of formData.entries()) {
        if (key.startsWith('properties[')) {
          const propName = key.slice(11, -1);
          mainProperties[propName] = value;
        }
      }

      const payload = {
        items: [
          {
            id: mainId,
            quantity: baseQuantity,
            properties: mainProperties
          },
          {
            id: dummyVariantId,
            quantity: feeQuantity,
            properties: {
              '_variantiq_group': groupId,
              '_variantiq_fee': 'true'
            }
          }
        ]
      };

      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(`Cart Add failed: ${errData.description || res.statusText}`);
      }

    } catch (e) {
      console.error('VariantIQ Cart Override Failed:', e);
      throw e; // Rethrow to let the interceptor handle the UI fallback
    }
  }

  applySSInventoryRules() {
    if (!this.ssInventory || this.ssInventory.length === 0) {
      console.log('[VariantIQ] applySSInventoryRules: no inventory data, skipping');
      // Still try to render auto-size field (hidden state)
      const autoSizeField = this.findAutoSizeField();
      if (autoSizeField) {
        const sizeEl = this.container.querySelector(`[data-field-id="${autoSizeField.id}"]`);
        if (sizeEl) sizeEl.style.display = 'none';
      }
      return;
    }
    console.log(`[VariantIQ] applySSInventoryRules: ${this.ssInventory.length} inventory items`);

    const { fields } = this.templateData.template;
    const colorField = fields.find(f => this.isColorField(f));
    const sizeField = fields.find(f => (f.label || f.name || '').toLowerCase().includes('size'));

    if (!colorField || !sizeField) return;

    const selectedColor = this.fieldValues[colorField.id];
    const selectedSize = this.fieldValues[sizeField.id];

    // Build color alias map: myOptionName -> ssColorName
    const colorAliases = colorField.ssColorAliasJson || {};

    // Helper: resolve a local color option name to an S&S color name
    const resolveColorName = (localName) => {
      // 1. Manual alias takes priority
      if (colorAliases[localName]) return { ssName: colorAliases[localName], matchType: 'alias' };
      // 2. Exact match
      const exactMatch = this.ssInventory.find(item => item.color === localName);
      if (exactMatch) return { ssName: localName, matchType: 'exact' };
      // 3. Fuzzy match (case-insensitive contains)
      const lowerLocal = localName.toLowerCase();
      const fuzzyMatch = this.ssInventory.find(item => {
        const lowerSS = item.color.toLowerCase();
        return lowerSS.includes(lowerLocal) || lowerLocal.includes(lowerSS);
      });
      if (fuzzyMatch) return { ssName: fuzzyMatch.color, matchType: 'fuzzy' };
      return { ssName: null, matchType: 'none' };
    };

    // Helper: resolve size name (simpler — exact then fuzzy, with Youth prefix stripping)
    const resolveSizeName = (localName) => {
      const exactMatch = this.ssInventory.find(item => item.size === localName);
      if (exactMatch) return localName;
      // Strip "Youth " prefix for matching (S&S returns "S" not "Youth S")
      const stripped = localName.startsWith('Youth ') ? localName.replace('Youth ', '') : localName;
      const strippedMatch = this.ssInventory.find(item => item.size === stripped);
      if (strippedMatch) return strippedMatch.size;
      const lowerLocal = stripped.toLowerCase();
      const fuzzyMatch = this.ssInventory.find(item => item.size.toLowerCase() === lowerLocal);
      if (fuzzyMatch) return fuzzyMatch.size;
      return null;
    };

    // Resolve the selected values to S&S names
    const resolvedSelectedColor = selectedColor ? resolveColorName(selectedColor).ssName : null;
    const resolvedSelectedSize = selectedSize ? resolveSizeName(selectedSize) : null;

    // Apply to color buttons
    const colorEl = this.container.querySelector(`[data-field-id="${colorField.id}"]`);
    if (colorEl) {
      const buttons = colorEl.querySelectorAll('button[data-value], input[type="radio"]');
      buttons.forEach(btn => {
        const colorName = btn.dataset?.value || btn.value;
        if (!colorName) return;

        const resolved = resolveColorName(colorName);
        let inStock = true;

        if (resolved.ssName) {
          if (resolvedSelectedSize) {
            const stock = this.ssInventory.find(item => item.color === resolved.ssName && item.size === resolvedSelectedSize);
            inStock = stock ? stock.qty > 0 : false;
          } else {
            const totalQty = this.ssInventory
              .filter(item => item.color === resolved.ssName)
              .reduce((a, b) => a + b.qty, 0);
            inStock = totalQty > 0;
          }
        } else {
          // No match found — can't verify stock, leave enabled
          inStock = true;
        }

        btn.disabled = !inStock;
        btn.style.opacity = inStock ? '1' : '0.3';
        btn.style.cursor = inStock ? 'pointer' : 'not-allowed';

        // Add/remove fuzzy match indicator
        const existingIndicator = btn.parentElement?.querySelector('.viq-fuzzy-indicator');
        if (existingIndicator) existingIndicator.remove();

        if (resolved.matchType === 'fuzzy' && resolved.ssName) {
          const indicator = document.createElement('span');
          indicator.className = 'viq-fuzzy-indicator';
          indicator.title = `Matched to S&S color: ${resolved.ssName}`;
          indicator.textContent = '⚡';
          indicator.style.cssText = 'font-size:10px;position:absolute;top:-2px;right:-2px;z-index:2;';
          if (btn.parentElement) {
            btn.parentElement.style.position = 'relative';
            btn.parentElement.appendChild(indicator);
          }
        }

        // Out-of-stock cross for swatches
        const existingCross = btn.querySelector('.viq-oos-cross');
        if (existingCross) existingCross.remove();
        if (!inStock && (btn.classList.contains('variantiq-swatch-btn') || btn.dataset.swatch)) {
          const cross = document.createElement('div');
          cross.className = 'viq-oos-cross';
          cross.style.cssText = 'position:absolute;top:50%;left:50%;width:100%;height:2px;background:#ef4444;transform:translate(-50%,-50%) rotate(-45deg);pointer-events:none;';
          btn.style.position = 'relative';
          btn.appendChild(cross);
        }
      });
    }

    // Apply to size buttons — for auto-size fields, dynamically show/hide with Adult/Youth groups
    const autoSizeField = this.findAutoSizeField();
    console.log(`[VariantIQ] applySSInventoryRules: autoSizeField=${autoSizeField?.label}, sizeField=${sizeField?.label}, selectedColor=${resolvedSelectedColor}`);
    if (autoSizeField) {
      this.renderAutoSizeField(autoSizeField, resolvedSelectedColor, resolveColorName, resolveSizeName);
    } else if (sizeField) {
      // Legacy: static size field — just enable/disable buttons
      const sizeEl = this.container.querySelector(`[data-field-id="${sizeField.id}"]`);
      if (sizeEl) {
        const buttons = sizeEl.querySelectorAll('button[data-value], input[type="radio"]');
        buttons.forEach(btn => {
          const sizeName = btn.dataset?.value || btn.value;
          if (!sizeName) return;
          const resolvedSize = resolveSizeName(sizeName);
          let inStock = true;
          if (resolvedSize) {
            if (resolvedSelectedColor) {
              const stock = this.ssInventory.find(item => item.size === resolvedSize && item.color === resolvedSelectedColor);
              inStock = stock ? stock.qty > 0 : false;
            } else {
              const totalQty = this.ssInventory
                .filter(item => item.size === resolvedSize)
                .reduce((a, b) => a + b.qty, 0);
              inStock = totalQty > 0;
            }
          }
          btn.disabled = !inStock;
          btn.style.opacity = inStock ? '1' : '0.3';
          btn.style.cursor = inStock ? 'pointer' : 'not-allowed';
          btn.style.textDecoration = inStock ? 'none' : 'line-through';
        });
      }
    }
  }

  renderAutoSizeField(sizeField, selectedColor, resolveColorName, resolveSizeName) {
    const sizeEl = this.container.querySelector(`[data-field-id="${sizeField.id}"]`);
    if (!sizeEl) return;

    const allSizes = sizeField.optionsJson || [];
    if (allSizes.length === 0) return;

    // Determine which sizes are available/in-stock
    const sizeOrder = ['XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL','Youth XS','Youth S','Youth M','Youth L','Youth XL','Youth 2XL','YXS','YS','YM','YL','YXL'];
    const isYouthSize = (s) => s.startsWith('Youth ') || (s.startsWith('Y') && s !== 'Yellow' && !s.startsWith('Youth'));
    const availableSizes = [];

    allSizes.forEach(size => {
      const resolvedSize = resolveSizeName ? resolveSizeName(size) : size;
      let inStock = false;
      let qty = 0;

      if (this.ssInventory && this.ssInventory.length > 0 && resolvedSize) {
        if (selectedColor) {
          const stock = this.ssInventory.find(item => item.size === resolvedSize && item.color === selectedColor);
          inStock = stock ? stock.qty > 0 : false;
          qty = stock ? stock.qty : 0;
        } else {
          qty = this.ssInventory
            .filter(item => item.size === resolvedSize)
            .reduce((a, b) => a + b.qty, 0);
          inStock = qty > 0;
        }
      } else if (!this.ssInventory || this.ssInventory.length === 0) {
        // No inventory loaded yet — show all sizes as available
        inStock = true;
      }

      availableSizes.push({ size, inStock, qty });
    });

    // Split into Adult and Youth
    const adultSizes = availableSizes.filter(s => !isYouthSize(s.size));
    const youthSizes = availableSizes.filter(s => isYouthSize(s.size));
    const currentValue = this.fieldValues[sizeField.id] || '';
    const isRequired = sizeField.required ? 'required' : '';

    // Build HTML
    let html = '';
    const renderSizeGroup = (label, sizes) => {
      if (sizes.length === 0) return '';
      let groupHtml = `<div style="margin-bottom:8px;">`;
      if (label) {
        groupHtml += `<div style="font-size:11px;font-weight:600;color:var(--color-base-text,#888);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">${label}</div>`;
      }
      groupHtml += `<div style="display:flex;flex-wrap:wrap;gap:6px;">`;
      sizes.forEach(({ size, inStock }) => {
        const isActive = currentValue === size;
        const activeStyle = isActive
          ? `border-color:${this.themeBtnActive.borderColor};background:${this.themeBtnActive.background};font-weight:${this.themeBtnActive.fontWeight};color:${this.themeBtnActive.color};`
          : `border-color:${this.themeBtn.borderColor};background:${this.themeBtn.background};font-weight:${this.themeBtn.fontWeight};color:${this.themeBtn.color};`;
        const stockStyle = inStock
          ? `opacity:1;cursor:pointer;`
          : `opacity:0.3;cursor:not-allowed;text-decoration:line-through;`;
        groupHtml += `
          <button type="button"
            class="variantiq-pill-btn variantiq-autosize-btn"
            data-field-id="${sizeField.id}"
            data-value="${size}"
            ${!inStock ? 'disabled' : ''}
            style="display:inline-flex;align-items:center;justify-content:center;padding:${this.themeBtn.padding};border-radius:${this.themeBtn.borderRadius};border:${this.themeBtn.borderWidth} ${this.themeBtn.borderStyle} ${this.themeBtn.borderColor};font-size:${this.themeBtn.fontSize};font-family:${this.themeBtn.fontFamily};letter-spacing:${this.themeBtn.letterSpacing};text-transform:${this.themeBtn.textTransform};line-height:${this.themeBtn.lineHeight};min-width:${this.themeBtn.minWidth};min-height:${this.themeBtn.minHeight};outline:none;transition:all 0.15s;box-sizing:border-box;${activeStyle}${stockStyle}"
          >${size}</button>`;
      });
      groupHtml += `</div></div>`;
      return groupHtml;
    };

    const requiredMark = sizeField.required ? '<span class="required">*</span>' : '';
    html = `
      <legend class="form__label" style="width:100%;margin-bottom:0.8rem;text-align:left;display:block;">${sizeField.label}${requiredMark}</legend>
      ${renderSizeGroup(youthSizes.length > 0 ? 'Adult Sizes' : '', adultSizes)}
      ${renderSizeGroup('Youth Sizes', youthSizes)}
      <input type="hidden" name="_vq_${this.instanceId}_${sizeField.id}" value="${currentValue}" id="vq-${this.instanceId}-${sizeField.id}" ${isRequired} class="variantiq-pill-input" />
    `;

    sizeEl.innerHTML = html;

    // Show the field if a color is selected and inventory is loaded
    if (selectedColor && this.ssInventory && this.ssInventory.length > 0) {
      sizeEl.style.display = '';
    } else if (!selectedColor) {
      sizeEl.style.display = 'none';
      // Clear the size value if no color selected
      this.fieldValues[sizeField.id] = '';
    }
  }

  showValidationError(message) {
    // Remove any existing error in this container
    const existingError = this.container.querySelector('.variantiq-validation-error');
    if (existingError) existingError.remove();

    // Find the first visible, unfilled required field and scroll to + flash it
    const visibleFields = this.getVisibleFields();
    let firstInvalidEl = null;
    for (const field of visibleFields) {
      if (field.required) {
        const val = this.fieldValues[field.id];
        if (!val || val.trim() === '') {
          firstInvalidEl = this.container.querySelector(`.variantiq-field[data-field-id="${field.id}"]`);
          break;
        }
      }
    }

    if (firstInvalidEl) {
      firstInvalidEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const origBorder = firstInvalidEl.style.border;
      firstInvalidEl.style.border = '2px solid #ef4444';
      firstInvalidEl.style.borderRadius = '6px';
      setTimeout(() => {
        firstInvalidEl.style.border = origBorder;
        firstInvalidEl.style.borderRadius = '';
      }, 2500);
    }

    // Also show banner error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'variantiq-validation-error';
    errorDiv.style.cssText = 'background: #fef2f2; border: 2px solid #ef4444; padding: 12px; margin: 16px 0; border-radius: 4px; color: #b91c1c; font-weight: 500;';
    errorDiv.textContent = message;
    const wrapper = this.container.querySelector('.variantiq-fields-container');
    if (wrapper) wrapper.prepend(errorDiv);
    setTimeout(() => errorDiv.remove(), 5000);
  }

  showError() {
    const errorDiv = this.container.querySelector('#variantiq-error');
    const container = this.container.querySelector(`#variantiq-fields-${this.productId}`);

    if (errorDiv) errorDiv.style.display = 'none';
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

// Fix BFCache stuck button issue when users click the browser Back button
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    const btn = document.querySelector('form[action^="/cart/add"] button[type="submit"], form[action^="/cart/add"] input[type="submit"]');
    if (btn) {
      btn.innerHTML = btn.dataset.originalHtml || 'Add to cart';
      btn.disabled = false;
    }
  }
});
