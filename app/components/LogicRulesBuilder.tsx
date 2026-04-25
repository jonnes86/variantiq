import React, { useState, useEffect, useMemo } from "react";
import {
    Card,
    Text,
    BlockStack,
    Button,
    InlineStack,
    Select,
    Box,
    Badge,
    Divider,
    EmptyState,
} from "@shopify/polaris";
import { DeleteIcon, PlusIcon } from "@shopify/polaris-icons";

export interface Field {
    id: string;
    name: string;
    type: string;
    label: string;
    optionsJson: any;
    required?: boolean;
}

export interface Rule {
    id: string;
    conditionsJson: any;
    targetFieldId: string;
    actionType: string;
    targetOptionsJson: any;
}

interface LogicRulesBuilderProps {
    fields: Field[];
    rules: Rule[];
    datasets?: any[];
    onSaveRules: (newRules: Partial<Rule>[], fieldSortOrder?: Array<{ fieldId: string; sort: number }>) => void;
    onAddNewField?: (newField: Omit<Field, "id">) => string;
    onDeleteOrphanedField?: (fieldId: string) => void;
    onRegisterSaveRef?: (fn: () => void) => void;
    lastSavedAt?: Date | null;
}

export function LogicRulesBuilder({
    fields,
    rules: initialRules,
    datasets = [],
    onSaveRules,
    onRegisterSaveRef,
    lastSavedAt
}: LogicRulesBuilderProps) {
    const [rules, setRules] = useState<Partial<Rule>[]>([]);

    // Initialize local state from props
    useEffect(() => {
        // Deep copy rules to local state
        const parsed = initialRules.map(r => {
            let conds = [];
            try { conds = typeof r.conditionsJson === 'string' ? JSON.parse(r.conditionsJson) : (r.conditionsJson || []); } catch (e) { }
            let opts = {};
            try { opts = typeof r.targetOptionsJson === 'string' ? JSON.parse(r.targetOptionsJson) : (r.targetOptionsJson || {}); } catch (e) { }
            return {
                ...r,
                id: r.id,
                conditionsJson: conds,
                targetOptionsJson: opts
            };
        });
        setRules(parsed);
    }, [initialRules]);

    const handleSave = () => {
        // Validate rules before saving
        const validRules = rules.filter(r => {
            if (!r.actionType || !r.targetFieldId) return false;
            if (r.actionType === 'LIMIT_OPTIONS_DATASET' && !r.targetOptionsJson?.datasetId) return false;
            
            const conds = r.conditionsJson || [];
            if (conds.length === 0) return false;
            if (!conds[0].fieldId || !conds[0].value) return false;

            return true;
        });

        onSaveRules(validRules, []); // Sorting omitted in logic builder
    };

    // Register Cmd+S hook
    useEffect(() => {
        onRegisterSaveRef?.(handleSave);
    });

    const addRule = () => {
        const newId = `temp_${Date.now()}`;
        setRules(prev => [
            ...prev,
            {
                id: newId,
                actionType: "SHOW",
                targetFieldId: "",
                conditionsJson: [{ fieldId: "", operator: "EQUALS", value: "" }],
                targetOptionsJson: {}
            }
        ]);
    };

    const removeRule = (id: string) => {
        setRules(prev => prev.filter(r => r.id !== id));
    };

    const updateRule = (id: string, updates: Partial<Rule>) => {
        setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    };

    const updateCondition = (ruleId: string, condIndex: number, updates: any) => {
        setRules(prev => prev.map(r => {
            if (r.id !== ruleId) return r;
            const newConds = [...(r.conditionsJson || [])];
            newConds[condIndex] = { ...newConds[condIndex], ...updates };
            return { ...r, conditionsJson: newConds };
        }));
    };

    const fieldOptions = [{ label: "Select field...", value: "" }, ...fields.map(f => ({ label: f.label || f.name, value: f.id }))];
    const datasetOptions = [{ label: "Select dataset...", value: "" }, ...datasets.map(d => ({ label: d.name, value: d.id }))];

    return (
        <Card>
            <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                        <Text as="h3" variant="headingMd">Conditional Logic Rules</Text>
                        <Text as="p" tone="subdued">
                            Define exactly when specific fields should appear or change based on customer selections.
                        </Text>
                    </BlockStack>
                    <BlockStack gap="100" inlineAlign="end">
                        <InlineStack gap="200" blockAlign="center">
                            <Button variant="primary" onClick={handleSave}>Save Rules</Button>
                        </InlineStack>
                        {lastSavedAt && (
                            <Text as="span" variant="bodySm" tone="subdued">
                                Last saved {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        )}
                    </BlockStack>
                </InlineStack>

                <Divider />

                {rules.length === 0 ? (
                    <EmptyState
                        heading="No logic rules yet"
                        action={{ content: 'Add First Rule', onAction: addRule, icon: PlusIcon }}
                        image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                    >
                        <p>Currently, all your fields will be visible to everyone at all times.</p>
                    </EmptyState>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {rules.map((rule, i) => {
                            const cond = rule.conditionsJson?.[0] || { fieldId: "", operator: "EQUALS", value: "" };
                            const targetField = fields.find(f => f.id === rule.targetFieldId);
                            const conditionField = fields.find(f => f.id === cond.fieldId);
                            
                            let valueOptions = [{ label: "Select value...", value: "" }];
                            if (conditionField) {
                                let opts = [];
                                try { opts = typeof conditionField.optionsJson === 'string' ? JSON.parse(conditionField.optionsJson) : (conditionField.optionsJson || []); } catch(e){}
                                if (Array.isArray(opts)) {
                                    valueOptions = [...valueOptions, ...opts.map(o => ({ label: o, value: o }))];
                                }
                            }

                            return (
                                <Box key={rule.id || i} padding="300" background="bg-surface-secondary" borderRadius="200" borderColor="border" borderWidth="025">
                                    <BlockStack gap="300">
                                        <InlineStack align="space-between" blockAlign="start">
                                            <InlineStack gap="300" blockAlign="center">
                                                <Badge tone="info">RULE {i + 1}</Badge>
                                                <Select
                                                    label="Action Type"
                                                    labelHidden
                                                    options={[
                                                        { label: "SHOW FIELD", value: "SHOW" },
                                                        { label: "SWAP DATASET", value: "LIMIT_OPTIONS_DATASET" }
                                                    ]}
                                                    value={rule.actionType || "SHOW"}
                                                    onChange={(val) => updateRule(rule.id, { actionType: val })}
                                                />

                                                {rule.actionType === "SHOW" && (
                                                    <Select
                                                        label="Target Field"
                                                        labelHidden
                                                        options={fieldOptions}
                                                        value={rule.targetFieldId || ""}
                                                        onChange={(val) => updateRule(rule.id, { targetFieldId: val })}
                                                    />
                                                )}

                                                {rule.actionType === "LIMIT_OPTIONS_DATASET" && (
                                                    <InlineStack gap="200" blockAlign="center">
                                                        <Select
                                                            label="Dataset"
                                                            labelHidden
                                                            options={datasetOptions}
                                                            value={rule.targetOptionsJson?.datasetId || ""}
                                                            onChange={(val) => updateRule(rule.id, { targetOptionsJson: { ...rule.targetOptionsJson, datasetId: val } })}
                                                        />
                                                        <Text as="span" variant="bodyMd" tone="subdued">ON FIELD</Text>
                                                        <Select
                                                            label="Target Field"
                                                            labelHidden
                                                            options={fieldOptions}
                                                            value={rule.targetFieldId || ""}
                                                            onChange={(val) => updateRule(rule.id, { targetFieldId: val })}
                                                        />
                                                    </InlineStack>
                                                )}
                                            </InlineStack>

                                            <Button variant="plain" tone="critical" icon={DeleteIcon} onClick={() => removeRule(rule.id)} accessibilityLabel="Remove Rule" />
                                        </InlineStack>

                                        <div style={{ paddingLeft: "16px", borderLeft: "2px solid var(--p-color-border-subdued)", marginLeft: "8px" }}>
                                            <InlineStack gap="300" blockAlign="center">
                                                <Text as="span" variant="bodyMd" fontWeight="semibold" tone="subdued">↳ IF</Text>
                                                <Select
                                                    label="Condition Field"
                                                    labelHidden
                                                    options={fieldOptions}
                                                    value={cond.fieldId || ""}
                                                    onChange={(val) => updateCondition(rule.id, 0, { fieldId: val, value: "" })}
                                                />
                                                <Text as="span" variant="bodyMd">=</Text>
                                                <Select
                                                    label="Condition Value"
                                                    labelHidden
                                                    options={valueOptions}
                                                    value={cond.value || ""}
                                                    onChange={(val) => updateCondition(rule.id, 0, { value: val })}
                                                    disabled={!cond.fieldId}
                                                />
                                            </InlineStack>
                                        </div>
                                    </BlockStack>
                                </Box>
                            );
                        })}

                        <InlineStack align="center">
                            <Button variant="tertiary" icon={PlusIcon} onClick={addRule}>
                                Add New Rule
                            </Button>
                        </InlineStack>
                    </div>
                )}
            </BlockStack>
        </Card>
    );
}
