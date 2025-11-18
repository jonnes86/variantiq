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
      await this.fetchTemplate();
      this.render();
      this.attachEventListeners();
    } catch (error) {
      console.error('VariantIQ initialization error:', error);
      this.showError();
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

    const { fields, rules } = this.templateData.template;
    
    if (!fields || fields.length === 0) {
      container.innerHTML = '<p class="variantiq-no-options">No customization options available.</p>';
      return;
    }

    // Find root fields (fields that aren't children in any rule)
    const childFieldIds = new Set(rules.map(r => r.childFieldId));
    const rootFields = fields.filter(f => !childFieldIds.has(f.id));

    let html = '<div class="variantiq-fields">';
    
    rootFields.forEach(field => {
      html += this.renderField(field);
    });
    
    html += '</div>';
    
    container.innerHTML = html;
  }

  renderField(field, options = null) {
    const fieldOptions = options || (field.optionsJson || []);
    const isRequired = field.required ? 'required' : '';
    const requiredMark = field.required ? '<span class="required">*</span>' : '';

    let html = `
      <div class="variantiq-field" data-field-id="${field.id}">
        <label for="field-${field.id}">
          ${field.label}${requiredMark}
        </label>
    `;

    switch (field.type) {
      case 'text':
        html += `<input 
          type="text" 
          id="field-${field.id}" 
          name="${field.name}"
          ${isRequired}
          class="variantiq-input"
        />`;
        break;

      case 'select':
        html += `<select 
          id="field-${field.id}" 
          name="${field.name}"
          ${isRequired}
          class="variantiq-select"
        >
          <option value="">Select ${field.label}...</option>`;
        
        fieldOptions.forEach(option => {
          html += `<option value="${option}">${option}</option>`;
        });
        
        html += `</select>`;
        break;

      case 'radio':
        html += `<div class="variantiq-radio-group">`;
        fieldOptions.forEach((option, index) => {
          html += `
            <label class="variantiq-radio-label">
              <input 
                type="radio" 
                id="field-${field.id}-${index}" 
                name="${field.name}"
                value="${option}"
                ${isRequired}
                class="variantiq-radio"
              />
              <span>${option}</span>
            </label>
          `;
        });
        html += `</div>`;
        break;

      case 'checkbox':
        html += `<div class="variantiq-checkbox-group">`;
        fieldOptions.forEach((option, index) => {
          html += `
            <label class="variantiq-checkbox-label">
              <input 
                type="checkbox" 
                id="field-${field.id}-${index}" 
                name="${field.name}[]"
                value="${option}"
                class="variantiq-checkbox"
              />
              <span>${option}</span>
            </label>
          `;
        });
        html += `</div>`;
        break;
    }

    html += `</div>`;
    return html;
  }

  attachEventListeners() {
    const container = document.getElementById(`variantiq-fields-${this.productId}`);
    
    container.addEventListener('change', (e) => {
      const fieldElement = e.target.closest('.variantiq-field');
      if (!fieldElement) return;
      
      const fieldId = fieldElement.dataset.fieldId;
      const value = e.target.value;
      
      this.fieldValues[fieldId] = value;
      this.handleCascade(fieldId, value);
    });
  }

  handleCascade(parentFieldId, parentValue) {
    const { rules, fields } = this.templateData.template;
    
    // Find all rules where this field is the parent
    const matchingRules = rules.filter(r => 
      r.parentFieldId === parentFieldId && r.parentValue === parentValue
    );

    // Remove any child fields that are no longer valid
    this.removeInvalidChildren(parentFieldId);

    // Add new child fields
    matchingRules.forEach(rule => {
      const childField = fields.find(f => f.id === rule.childFieldId);
      if (!childField) return;

      const existingChild = document.querySelector(`.variantiq-field[data-field-id="${rule.childFieldId}"]`);
      
      if (existingChild) {
        existingChild.remove();
      }

      // Find parent field element to insert after
      const parentElement = document.querySelector(`.variantiq-field[data-field-id="${parentFieldId}"]`);
      if (!parentElement) return;

      // Render child field with rule-specific options
      const childHtml = this.renderField(childField, rule.childOptionsJson);
      parentElement.insertAdjacentHTML('afterend', childHtml);
    });
  }

  removeInvalidChildren(parentFieldId) {
    const { rules } = this.templateData.template;
    
    // Get all possible child field IDs for this parent
    const childFieldIds = rules
      .filter(r => r.parentFieldId === parentFieldId)
      .map(r => r.childFieldId);

    // Remove all child fields of this parent
    childFieldIds.forEach(childId => {
      const childElement = document.querySelector(`.variantiq-field[data-field-id="${childId}"]`);
      if (childElement) {
        childElement.remove();
        delete this.fieldValues[childId];
        
        // Recursively remove children of this child
        this.removeInvalidChildren(childId);
      }
    });
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