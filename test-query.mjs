class MockStorefront {
    constructor(rules, fields) {
        this.templateData = { template: { rules, fields } };
        // User clicked Adult -> Short Sleeve -> ?
        this.fieldValues = {
            "cmlzih6500001rz0du0kvtxmg": "Adult", // Size Type
            "cmlyhuvtq0002s20dt5tzdzb0": "Short-Sleeve T-Shirt" // Shirt Type
        };
        this.evaluateRules();
    }

    evaluateRules() {
        const { fields, rules } = this.templateData.template;
        const rulesByTarget = {};
        fields.forEach(f => rulesByTarget[f.id] = []);
        rules.forEach(r => { if (rulesByTarget[r.targetFieldId]) rulesByTarget[r.targetFieldId].push(r); });

        // Exact port of product-fields.js logic
        let missingRequiredEncountered = false;
        const sortedFields = [...fields].sort((a, b) => a.sort - b.sort);

        sortedFields.forEach(field => {
            const fieldRules = rulesByTarget[field.id];
            let shouldShow = true;

            const showRules = fieldRules.filter(r => r.actionType === 'SHOW');
            const hideRules = fieldRules.filter(r => r.actionType === 'HIDE');

            const evaluateRuleConditions = (rule) => {
                const conditions = rule.conditionsJson || [];
                if (!conditions || conditions.length === 0) return false;
                return conditions.every(c => {
                    const val = this.fieldValues[c.fieldId] || "";
                    switch (c.operator) {
                        case 'EQUALS': return val === c.value;
                        case 'NOT_EQUALS': return val !== "" && val !== c.value;
                        case 'CONTAINS': return val !== "" && val.includes(c.value);
                        default: return false;
                    }
                });
            };

            if (showRules.length > 0) {
                shouldShow = showRules.some(evaluateRuleConditions);
            } else if (hideRules.length > 0) {
                shouldShow = !hideRules.some(evaluateRuleConditions);
            }

            if (missingRequiredEncountered) {
                shouldShow = false;
            }

            console.log(`Field ${field.id}: shouldShow=${shouldShow}, required=${field.required}`);

            // Waterfall advance
            if (shouldShow && field.required) {
                const val = this.fieldValues[field.id];
                if (!val || val.trim() === '') {
                    missingRequiredEncountered = true;
                }
            }
        });
    }
}

const mockRules = [
    {
        "id": "cmm1grn99000apb0dt3e6ch5e",
        "templateId": "cmly8zug70000s20dwf5wp1yu",
        "conditionsJson": [
            {
                "value": "Adult",
                "fieldId": "cmlzih6500001rz0du0kvtxmg",
                "operator": "EQUALS"
            }
        ],
        "targetFieldId": "cmlyhuvtq0002s20dt5tzdzb0",
        "actionType": "SHOW",
    },
    {
        "id": "cmm1grn99000dpb0d11nupjuw",
        "templateId": "cmly8zug70000s20dwf5wp1yu",
        "conditionsJson": [
            {
                "value": "Short-Sleeve T-Shirt",
                "fieldId": "cmlyhuvtq0002s20dt5tzdzb0",
                "operator": "EQUALS"
            }
        ],
        "targetFieldId": "cmm1ehzhu000nld0dtlumqasp",
        "actionType": "SHOW",
    }
];

const mockFields = [
    { id: "cmlzih6500001rz0du0kvtxmg", required: true, sort: 1 },
    { id: "cmlyhuvtq0002s20dt5tzdzb0", required: true, sort: 2 },
    { id: "cmm1ehzhu000nld0dtlumqasp", required: false, sort: 3 }
];

new MockStorefront(mockRules, mockFields);
