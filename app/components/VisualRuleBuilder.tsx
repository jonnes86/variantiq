import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    Card,
    Text,
    BlockStack,
    Button,
    Box,
    InlineStack,
    Select,
    Modal,
    TextField,
    Checkbox,
    InlineGrid
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

interface VisualRuleBuilderProps {
    fields: Field[];
    rules: Rule[];
    datasets?: any[];
    onSaveRules: (newRules: Partial<Rule>[]) => void;
    onAddNewField?: (newField: Omit<Field, "id">) => string; // Returns the generated ID
}

// ----------------------------------------------------
// CONTEXT
// ----------------------------------------------------
const VisualBuilderContext = React.createContext<{
    fieldsMap: Record<string, Field>;
    tree: Record<string, string[]>;
    datasets: any[];
    fieldDatasetMap: Record<string, string>;
    collapsedNodes: Set<string>;
    onToggleCollapse: (id: string) => void;
    onChangeDataset: (fieldId: string, datasetId: string) => void;
    onAddField: (fieldId: string, containerId: string) => void;
    onRemoveField: (fieldId: string) => void;
    availableFields: Field[];
    handleOpenNewFieldModal: (containerId: string) => void;
} | null>(null);

function useVisualBuilder() {
    const context = React.useContext(VisualBuilderContext);
    if (!context) throw new Error("Missing VisualBuilderContext");
    return context;
}

// ----------------------------------------------------
// COMPONENTS
// ----------------------------------------------------

function FieldNode({
    field,
    options,
    isNested,
}: {
    field: Field,
    options: string[],
    isNested?: boolean,
}) {
    const { tree, collapsedNodes, onToggleCollapse, datasets, fieldDatasetMap, onChangeDataset, onAddField, onRemoveField, availableFields, handleOpenNewFieldModal } = useVisualBuilder();
    const datasetId = fieldDatasetMap[field.id];

    // Build the dropdown options to include Fields AND Datasets
    const dropdownOptions = [
        { label: "Assign rule: Show field...", value: "" },
        { label: "+ Create New Field", value: "CREATE_NEW" },
        ...availableFields.map(f => ({ label: `[Field] ${f.name}`, value: f.id })),
        ...datasets.map(d => ({ label: `[Dataset] ${d.name}`, value: `dataset_${d.id}` }))
    ];

    const handleSelectChange = (val: string, containerId: string) => {
        if (!val) return;
        if (val === "CREATE_NEW") {
            handleOpenNewFieldModal(containerId);
        } else {
            onAddField(val, containerId);
        }
    };

    return (
        <div style={{ marginBottom: "12px" }}>
            <Card padding="300">
                <BlockStack gap="200">
                    {/* Field Header */}
                    <InlineStack align="space-between" blockAlign="center">
                        <InlineStack align="start" blockAlign="center" gap="200" wrap={false}>
                            <div style={{ flex: 1 }}>
                                <Text as="span" variant="bodyMd" fontWeight="semibold">
                                    {field.label || field.name}
                                </Text>
                                <Text as="span" variant="bodySm" tone="subdued">
                                    {" "} {field.label ? `(Internal: ${field.name})` : `— ${field.type}`}
                                </Text>
                            </div>

                            {options.length > 0 && (
                                <Button
                                    size="micro"
                                    variant="tertiary"
                                    onClick={() => onToggleCollapse(field.id)}
                                >
                                    {collapsedNodes.has(field.id) ? `Expand ${options.length} Options` : `Collapse Options`}
                                </Button>
                            )}
                            {isNested && datasets.length > 0 && options.length > 0 && (
                                <Select
                                    label="Limit options to dataset"
                                    labelHidden
                                    options={[{ label: 'All Options Available', value: '' }, ...datasets.map(d => ({ label: `Limit to: ${d.name}`, value: d.id }))]}
                                    value={datasetId || ''}
                                    onChange={(value) => onChangeDataset(field.id, value)}
                                />
                            )}
                        </InlineStack>
                        <Button
                            variant="plain"
                            tone="critical"
                            icon={DeleteIcon}
                            onClick={() => onRemoveField(field.id)}
                            accessibilityLabel="Remove field"
                        />
                    </InlineStack>

                    {/* Child Zones for Options */}
                    {options.length > 0 && !collapsedNodes.has(field.id) && (
                        <div style={{ marginLeft: "14px", marginTop: "8px", display: "flex", flexDirection: "column", gap: "8px" }}>
                            {options.map((opt) => {
                                const dropId = `${field.id}::${opt}`;
                                const nestedChildIds = tree[dropId] || [];

                                return (
                                    <div key={opt} style={{
                                        paddingLeft: "16px",
                                        borderLeft: "2px solid var(--p-color-border)",
                                        marginLeft: "8px"
                                    }}>
                                        <BlockStack gap="200">
                                            <Text as="span" variant="bodySm" fontWeight="bold" tone="subdued">
                                                ↳ If chosen: {opt}
                                            </Text>

                                            <div style={{ minHeight: "20px", padding: "8px", backgroundColor: "var(--p-color-bg-surface)", borderRadius: "var(--p-border-radius-100)", border: "1px dashed var(--p-color-border)" }}>
                                                {nestedChildIds.length === 0 ? (
                                                    <Text as="span" variant="bodySm" tone="subdued">
                                                        No fields assigned to this choice.
                                                    </Text>
                                                ) : (
                                                    nestedChildIds.map(childId => (
                                                        <RenderFieldNodeById
                                                            key={childId}
                                                            fieldId={childId}
                                                            isNested={true}
                                                        />
                                                    ))
                                                )}

                                                <div style={{ marginTop: "12px", maxWidth: "300px" }}>
                                                    <Select
                                                        label="Assign rule: Show field"
                                                        labelHidden
                                                        options={dropdownOptions}
                                                        value=""
                                                        onChange={(val) => handleSelectChange(val, dropId)}
                                                    />
                                                </div>
                                            </div>
                                        </BlockStack>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </BlockStack>
            </Card>
        </div>
    );
}

function RenderFieldNodeById({
    fieldId,
    isNested
}: {
    fieldId: string,
    isNested?: boolean,
}) {
    const { fieldsMap } = useVisualBuilder();
    const f = fieldsMap[fieldId];
    if (!f) return null;
    const opts = (Array.isArray(f.optionsJson) ? f.optionsJson : []) as string[];

    return (
        <FieldNode
            field={f}
            options={opts}
            isNested={isNested}
        />
    );
}

// ----------------------------------------------------
// MAIN BUILDER
// ----------------------------------------------------

export function VisualRuleBuilder({ fields, rules, datasets, onSaveRules, onAddNewField }: VisualRuleBuilderProps) {
    const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
    const [tree, setTree] = useState<Record<string, string[]>>({ root: [] });
    const [fieldDatasetMap, setFieldDatasetMap] = useState<Record<string, string>>({});

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalTargetContainer, setModalTargetContainer] = useState("");
    const [newFieldType, setNewFieldType] = useState("select");
    const [newFieldLabel, setNewFieldLabel] = useState("");
    const [newFieldName, setNewFieldName] = useState("");
    const [newFieldOptions, setNewFieldOptions] = useState<string[]>([""]);

    const handleToggleCollapse = (id: string) => {
        setCollapsedNodes(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleAddField = (rawVal: string, containerId: string) => {
        let actualFieldId = rawVal;

        // If a dataset was selected from the dropdown, generate a local field for it automatically
        if (rawVal.startsWith("dataset_")) {
            const datasetId = rawVal.replace("dataset_", "");
            const dataset = datasets?.find(d => d.id === datasetId);
            if (dataset && onAddNewField) {
                // Determine a safe internal name
                let safeName = dataset.name.replace(/\s+/g, '_').toLowerCase();
                const baseName = safeName;
                let counter = 1;
                while (fields.some(f => f.name === safeName)) {
                    safeName = `${baseName}_${counter}`;
                    counter++;
                }

                actualFieldId = onAddNewField({
                    type: "select",
                    name: safeName,
                    label: dataset.name,
                    optionsJson: dataset.optionsJson,
                    required: false
                });

                // Bind the dataset mapping
                setFieldDatasetMap(prev => ({ ...prev, [actualFieldId]: datasetId }));
            } else {
                return; // Silently fail if dataset not found or hook not provided
            }
        }

        setTree(prev => ({
            ...prev,
            [containerId]: [...(prev[containerId] || []), actualFieldId]
        }));
    };

    const handleRemoveField = (fieldId: string) => {
        setTree(prev => {
            const next = { ...prev };
            const containerId = Object.keys(next).find(k => next[k].includes(fieldId));
            if (containerId) {
                next[containerId] = next[containerId].filter(id => id !== fieldId);
            }
            const recursiveRemove = (id: string) => {
                const f = fields.find(field => field.id === id);
                if (!f) return;
                const opts = Array.isArray(f.optionsJson) ? f.optionsJson : [];
                opts.forEach(opt => {
                    const dropId = `${id}::${opt}`;
                    const children = next[dropId] || [];
                    children.forEach(childId => recursiveRemove(childId));
                    next[dropId] = [];
                });
            };
            recursiveRemove(fieldId);
            return next;
        });

        setFieldDatasetMap(prev => {
            const next = { ...prev };
            delete next[fieldId];
            return next;
        });
    };

    const fieldsMap = useMemo(() => {
        const map: Record<string, Field> = {};
        fields.forEach(f => { map[f.id] = f; });
        return map;
    }, [fields]);

    const activeFieldIds = useMemo(() => {
        const ids = new Set<string>();
        Object.values(tree).forEach(arr => arr.forEach(id => ids.add(id)));
        return ids;
    }, [tree]);

    const availableFields = useMemo(() => {
        return fields.filter(f => !activeFieldIds.has(f.id));
    }, [fields, activeFieldIds]);

    const openNewFieldModal = (containerId: string) => {
        setModalTargetContainer(containerId);
        setNewFieldType("select");
        setNewFieldLabel("");
        setNewFieldName("");
        setNewFieldOptions([""]);
        setIsModalOpen(true);
    };

    const commitNewFieldModal = () => {
        if (!newFieldLabel || !newFieldName || !onAddNewField) return;

        const optionsJson = ["select", "radio", "checkbox"].includes(newFieldType) ? newFieldOptions.filter(o => o.trim() !== "") : null;

        const actualId = onAddNewField({
            type: newFieldType,
            label: newFieldLabel,
            name: newFieldName,
            optionsJson,
            required: false,
        });

        handleAddField(actualId, modalTargetContainer);
        setIsModalOpen(false);
    };

    const contextValue = useMemo(() => ({
        fieldsMap,
        tree,
        datasets: datasets || [],
        fieldDatasetMap,
        collapsedNodes,
        onToggleCollapse: handleToggleCollapse,
        onChangeDataset: (fieldId: string, datasetId: string) => {
            setFieldDatasetMap(prev => ({ ...prev, [fieldId]: datasetId }));
        },
        onAddField: handleAddField,
        onRemoveField: handleRemoveField,
        availableFields,
        handleOpenNewFieldModal: openNewFieldModal
    }), [fieldsMap, tree, datasets, fieldDatasetMap, collapsedNodes, availableFields]);

    useEffect(() => {
        const newTree: Record<string, string[]> = { root: [] };
        fields.forEach(f => {
            const opts = Array.isArray(f.optionsJson) ? f.optionsJson : [];
            opts.forEach(opt => {
                newTree[`${f.id}::${opt}`] = [];
            });
        });

        const fieldsInTree = new Set<string>();
        const newFieldDatasetMap: Record<string, string> = {};

        rules.forEach(r => {
            if (r.actionType === "SHOW") {
                let conds = [];
                try { conds = typeof r.conditionsJson === 'string' ? JSON.parse(r.conditionsJson) : r.conditionsJson; } catch (e) { }
                if (Array.isArray(conds) && conds.length === 1 && conds[0].operator === 'EQUALS') {
                    const pId = `${conds[0].fieldId}::${conds[0].value}`;
                    if (!newTree[pId]) newTree[pId] = [];
                    if (!newTree[pId].includes(r.targetFieldId)) {
                        newTree[pId].push(r.targetFieldId);
                        fieldsInTree.add(r.targetFieldId);
                    }
                }
            } else if (r.actionType === "LIMIT_OPTIONS_DATASET") {
                try {
                    const parsed = typeof r.targetOptionsJson === 'string' ? JSON.parse(r.targetOptionsJson) : r.targetOptionsJson;
                    if (parsed && parsed.datasetId) {
                        newFieldDatasetMap[r.targetFieldId] = parsed.datasetId;
                    }
                } catch (e) { }
            }
        });

        newTree.root = fields.map(f => f.id).filter(id => !fieldsInTree.has(id));
        setTree(newTree);
        setFieldDatasetMap(newFieldDatasetMap);
    }, [fields, rules]);

    const handleCompileRules = () => {
        const compiledRules: Partial<Rule>[] = [];
        Object.entries(tree).forEach(([containerId, children]) => {
            if (containerId === "root") return;
            const [parentFieldId, parentValue] = containerId.split("::");
            children.forEach((childId) => {
                compiledRules.push({
                    targetFieldId: childId,
                    actionType: "SHOW",
                    conditionsJson: [{ fieldId: parentFieldId, operator: "EQUALS", value: parentValue }],
                });
                if (fieldDatasetMap[childId]) {
                    compiledRules.push({
                        targetFieldId: childId,
                        actionType: "LIMIT_OPTIONS_DATASET",
                        targetOptionsJson: { datasetId: fieldDatasetMap[childId] },
                        conditionsJson: [{ fieldId: parentFieldId, operator: "EQUALS", value: parentValue }],
                    });
                }
            });
        });
        onSaveRules(compiledRules);
    };

    const rootDropdownOptions = [
        { label: "Add root field...", value: "" },
        { label: "+ Create New Field", value: "CREATE_NEW" },
        ...availableFields.map(f => ({ label: `[Field] ${f.name}`, value: f.id })),
        ...datasets?.map(d => ({ label: `[Dataset] ${d.name}`, value: `dataset_${d.id}` })) || []
    ];

    const handleRootSelectChange = (val: string) => {
        if (!val) return;
        if (val === "CREATE_NEW") {
            openNewFieldModal("root");
        } else {
            handleAddField(val, "root");
        }
    };

    return (
        <VisualBuilderContext.Provider value={contextValue}>
            <Card>
                <BlockStack gap="400">
                    <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                            <Text as="h3" variant="headingMd">
                                Visual Rule Tree
                            </Text>
                            <Text as="p" tone="subdued">
                                Select fields to add to the root to show them unconditionally. Select fields inside specific Option outcomes to show them conditionally.
                            </Text>
                        </BlockStack>
                        <Button variant="primary" onClick={handleCompileRules}>
                            Save Rules Tree
                        </Button>
                    </InlineStack>

                    <Box background="bg-surface-secondary" padding="400" borderRadius="200" minHeight="400px">
                        <div style={{ paddingBottom: "100px" }}>
                            {tree["root"]?.length === 0 && (
                                <Text as="p" tone="subdued">No root fields added.</Text>
                            )}
                            {tree["root"]?.map((id) => (
                                <RenderFieldNodeById
                                    key={id}
                                    fieldId={id}
                                />
                            ))}

                            <div style={{ marginTop: "16px", maxWidth: "300px" }}>
                                <Select
                                    label="Add root field"
                                    labelHidden
                                    options={rootDropdownOptions}
                                    value=""
                                    onChange={handleRootSelectChange}
                                />
                            </div>
                        </div>
                    </Box>
                </BlockStack>
            </Card>

            <Modal
                title="Create New Field"
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                primaryAction={{
                    content: "Add Field",
                    onAction: commitNewFieldModal,
                    disabled: !newFieldLabel || !newFieldName
                }}
                secondaryActions={[
                    { content: "Cancel", onAction: () => setIsModalOpen(false) }
                ]}
            >
                <Modal.Section>
                    <BlockStack gap="300">
                        <Select
                            label="Field Type"
                            options={[
                                { label: 'Dropdown / Select', value: 'select' },
                                { label: 'Radio Buttons', value: 'radio' },
                                { label: 'Checkboxes (Multiple Option)', value: 'checkbox' },
                                { label: 'Short Text Input', value: 'text' },
                            ]}
                            value={newFieldType}
                            onChange={setNewFieldType}
                        />
                        <TextField
                            label="Display Label"
                            value={newFieldLabel}
                            onChange={(v) => {
                                setNewFieldLabel(v);
                                if (!newFieldName) setNewFieldName(v.replace(/\s+/g, '_').toLowerCase());
                            }}
                            autoComplete="off"
                        />
                        <TextField
                            label="Internal Name (No Spaces, used for mapping to cart properties)"
                            value={newFieldName}
                            onChange={setNewFieldName}
                            autoComplete="off"
                        />
                        {["select", "radio", "checkbox"].includes(newFieldType) && (
                            <BlockStack gap="200">
                                <Text as="h4" variant="headingSm">Options</Text>
                                {newFieldOptions.map((opt, i) => (
                                    <TextField
                                        key={i}
                                        labelHidden
                                        label={`Option ${i + 1}`}
                                        value={opt}
                                        onChange={(v) => {
                                            const next = [...newFieldOptions];
                                            next[i] = v;
                                            setNewFieldOptions(next);
                                        }}
                                        autoComplete="off"
                                    />
                                ))}
                                <InlineStack>
                                    <Button onClick={() => setNewFieldOptions([...newFieldOptions, ""])}>+ Add Option</Button>
                                </InlineStack>
                            </BlockStack>
                        )}
                    </BlockStack>
                </Modal.Section>
            </Modal>
        </VisualBuilderContext.Provider>
    );
}
