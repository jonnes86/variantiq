import fs from 'fs';

const fields = [
    { id: 'cmlyhuvtq0002s20dt5tzdzb0', sort: 1, required: true, name: 'AdultShirtType' },
    { id: 'cmlym3jz80001mw0dkpu3p590', sort: 3, required: true, name: 'YouthShirtType' },
    { id: 'cmlzg0vr30001qj0dnpx29s9k', sort: 4, required: true, name: 'ToddlerShirtType' },
    { id: 'cmlzih6500001rz0du0kvtxmg', sort: 5, required: true, name: 'FirstRowSizeType' }
];

const rules = [
    { targetFieldId: 'cmlyhuvtq0002s20dt5tzdzb0', actionType: 'SHOW', conditionsJson: [{ fieldId: 'cmlzih6500001rz0du0kvtxmg', operator: 'EQUALS', value: 'Adult' }] },
    { targetFieldId: 'cmlym3jz80001mw0dkpu3p590', actionType: 'SHOW', conditionsJson: [{ fieldId: 'cmlzih6500001rz0du0kvtxmg', operator: 'EQUALS', value: 'Youth' }] },
    { targetFieldId: 'cmlzg0vr30001qj0dnpx29s9k', actionType: 'SHOW', conditionsJson: [{ fieldId: 'cmlzih6500001rz0du0kvtxmg', operator: 'EQUALS', value: 'Toddler' }] }
];

let fieldValues = { 'cmlzih6500001rz0du0kvtxmg': 'Adult' };
let rulesByTarget = {};
fields.forEach(f => rulesByTarget[f.id] = []);
rules.forEach(r => rulesByTarget[r.targetFieldId].push(r));

let missingRequiredEncountered = false;
fields.sort((a, b) => a.sort - b.sort);

fields.forEach(field => {
    const fieldRules = rulesByTarget[field.id];
    let shouldShow = true;

    const showRules = fieldRules.filter(r => r.actionType === 'SHOW');
    const evaluateRuleConditions = (rule) => {
        return rule.conditionsJson.every(c => {
            const val = fieldValues[c.fieldId] || "";
            if (c.operator === 'EQUALS') return val === c.value;
            return false;
        });
    };

    if (showRules.length > 0) {
        shouldShow = showRules.some(evaluateRuleConditions);
    }

    if (missingRequiredEncountered) {
        shouldShow = false;
    }

    console.log(`Field ${field.name} (sort: ${field.sort}): shouldShow=${shouldShow}, missingRequired=${missingRequiredEncountered}`);

    if (!shouldShow) {
        fieldValues[field.id] = "";
        console.log(` -> HIDING ${field.name}`);
    }

    if (shouldShow && field.required) {
        const val = fieldValues[field.id];
        if (!val || val.trim() === '') {
            missingRequiredEncountered = true;
            console.log(` -> Triggers missingRequiredEncountered`);
        }
    }
});
