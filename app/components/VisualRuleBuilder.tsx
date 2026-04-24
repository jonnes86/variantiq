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
    onSaveRules: (newRules: Partial<Rule>[], fieldSortOrder?: Array<{ fieldId: string; sort: number }>) => void;
    onAddNewField?: (newField: Omit<Field, "id">) => string;
    onDeleteOrphanedField?: (fieldId: string) => void;
    onRegisterSaveRef?: (fn: () => void) => void;
    lastSavedAt?: Date | null;
}

// ----------------------------------------------------
// CONTEXT
// ----------------------------------------------------
const VisualBuilderContext = React.createContext<{
    fieldsMap: Record<string, Field>;
    tree: Record<string, string[]>;
    datasets: any[];
    fieldDatasetMap: Record<string, string>;
    savedTree: Record<string, string[]>;
    savedDatasetMap: Record<string, string>;
    collapsedNodes: Set<string>;
    conflictedFieldIds: Set<string>;
    onToggleCollapse: (id: string) => void;
    onChangeDataset: (nodeId: string, datasetId: string) => void;
    onAddField: (fieldId: string, containerId: string) => void;
    onRemoveField: (fieldId: string, containerId: string) => void;
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

// Alternating depth colours — higher contrast for easy visual scanning
const DEPTH_COLORS = [
    "#ffffff",  // depth 0 — root: white
    "#eef0ff",  // depth 1 — medium lavender
    "#e6f7ed",  // depth 2 — medium mint
    "#fef9e7",  // depth 3 — medium amber
    "#f3e8ff",  // depth 4 — medium violet
];

function FieldNode({
    field,
    options,
    isNested,
    containerId,
    depth = 0,
}: {
    field: Field,
    options: string[],
    isNested?: boolean,
    containerId: string,
    depth?: number,
}) {
    const { tree, collapsedNodes, onToggleCollapse, datasets, fieldDatasetMap, savedTree, savedDatasetMap, onChangeDataset, onAddField, onRemoveField, availableFields, handleOpenNewFieldModal, conflictedFieldIds } = useVisualBuilder();
    const nodeId = `${containerId}::${field.id}`;
    const datasetId = fieldDatasetMap[nodeId];

    // Dirty detection: field was moved OR dataset assignment changed
    const savedParentContents = savedTree[containerId] || [];
    const isPositionDirty = !savedParentContents.includes(field.id);
    const savedDataset = savedDatasetMap[nodeId];
    const isDatasetDirty = datasetId !== savedDataset;
    const isDirty = isPositionDirty || isDatasetDirty;

    const bgColor = DEPTH_COLORS[depth % DEPTH_COLORS.length];
    const dirtyStyle = isDirty ? { borderLeft: "3px solid #f59e0b", background: "#fffbeb" } : { background: bgColor };

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
            <div style={{ borderRadius: "var(--p-border-radius-200)", overflow: "hidden", border: "1px solid var(--p-color-border)", ...dirtyStyle }}>
                <div style={{ padding: "12px" }}>
                    <BlockStack gap="200">
                        {/* Field Header */}
                        <InlineStack align="space-between" blockAlign="center">
                            <InlineStack align="start" blockAlign="center" gap="200" wrap={false}>
                                {isDirty && (
                                    <span title="Unsaved changes" style={{ fontSize: "10px", background: "#f59e0b", color: "white", fontWeight: 700, padding: "1px 6px", borderRadius: "9999px", whiteSpace: "nowrap" }}>UNSAVED</span>
                                )}
                                {conflictedFieldIds.has(field.id) && (
                                    <span title="This field is assigned to more than one branch — only one will take effect" style={{ fontSize: "10px", background: "#ef4444", color: "white", fontWeight: 700, padding: "1px 6px", borderRadius: "9999px", whiteSpace: "nowrap" }}>⚠ CONFLICT</span>
                                )}
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span
                                            title="Swap this field's options with a Global Dataset on the storefront. Useful for colors or sizes managed centrally."
                                            style={{ cursor: 'help', fontSize: '12px', background: 'var(--p-color-bg-surface-secondary)', borderRadius: '50%', width: '16px', height: '16px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: 'var(--p-color-text-secondary)', border: '1px solid var(--p-color-border)', flexShrink: 0 }}
                                        >?</span>
                                        <Select
                                            label="Swap options with Dataset"
                                            labelHidden
                                            options={[{ label: 'Use own options', value: '' }, ...datasets.map(d => ({ label: `↔ Dataset: ${d.name}`, value: d.id }))]}
                                            value={datasetId || ''}
                                            onChange={(value) => onChangeDataset(nodeId, value)}
                                        />
                                    </div>
                                )}
                            </InlineStack>
                            <Button
                                variant="plain"
                                tone="critical"
                                icon={DeleteIcon}
                                onClick={() => onRemoveField(field.id, containerId)}
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
                                            borderLeft: `2px solid ${DEPTH_COLORS[(depth + 1) % DEPTH_COLORS.length] === "#ffffff" ? "var(--p-color-border)" : DEPTH_COLORS[(depth + 1) % DEPTH_COLORS.length]}`,
                                            marginLeft: "8px"
                                        }}>
                                            <BlockStack gap="200">
                                                <Text as="span" variant="bodySm" fontWeight="bold" tone="subdued">
                                                    ↳ If chosen: {opt}
                                                </Text>

                                                <div style={{ minHeight: "20px", padding: "8px", backgroundColor: DEPTH_COLORS[(depth + 1) % DEPTH_COLORS.length], borderRadius: "var(--p-border-radius-100)", border: "1px dashed var(--p-color-border)" }}>
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
                                                                containerId={dropId}
                                                                depth={depth + 1}
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
                </div>
            </div>
        </div>
    );
}

function RenderFieldNodeById({
    fieldId,
    isNested,
    containerId,
    depth = 0,
}: {
    fieldId: string,
    isNested?: boolean,
    containerId: string,
    depth?: number,
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
            containerId={containerId}
            depth={depth}
        />
    );
}

// ----------------------------------------------------
// MAIN BUILDER
// ----------------------------------------------------

export function VisualRuleBuilder({ fields, rules, datasets, onSaveRules, onAddNewField, onDeleteOrphanedField, onRegisterSaveRef, lastSavedAt }: VisualRuleBuilderProps) {
    const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set());
    const [tree, setTree] = useState<Record<string, string[]>>({ root: [] });
    const [fieldDatasetMap, setFieldDatasetMap] = useState<Record<string, string>>({});

    // Snapshot of the last-saved state — used to detect unsaved changes in FieldNode
    const savedTreeRef = React.useRef<Record<string, string[]>>({ root: [] });
    const savedDatasetMapRef = React.useRef<Record<string, string>>({});
    const [savedTree, setSavedTree] = useState<Record<string, string[]>>({ root: [] });
    const [savedDatasetMap, setSavedDatasetMap] = useState<Record<string, string>>({});

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalTargetContainer, setModalTargetContainer] = useState("");
    const [newFieldType, setNewFieldType] = useState("select");
    const [newFieldLabel, setNewFieldLabel] = useState("");
    const [newFieldName, setNewFieldName] = useState("");
    const [newFieldOptions, setNewFieldOptions] = useState<string[]>([""]);

    // Undo/Redo history
    type Snapshot = { tree: Record<string, string[]>; map: Record<string, string> };
    const [history, setHistory] = useState<Snapshot[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const pushHistory = (currentTree: Record<string, string[]>, currentMap: Record<string, string>) => {
        setHistory(prev => {
            const trimmed = prev.slice(0, historyIndex + 1);
            return [...trimmed, { tree: JSON.parse(JSON.stringify(currentTree)), map: { ...currentMap } }].slice(-50);
        });
        setHistoryIndex(prev => Math.min(prev + 1, 49));
    };

    const handleUndo = () => {
        if (historyIndex <= 0) return;
        const snap = history[historyIndex - 1];
        setTree(JSON.parse(JSON.stringify(snap.tree)));
        setFieldDatasetMap({ ...snap.map });
        setHistoryIndex(prev => prev - 1);
    };

    const handleRedo = () => {
        if (historyIndex >= history.length - 1) return;
        const snap = history[historyIndex + 1];
        setTree(JSON.parse(JSON.stringify(snap.tree)));
        setFieldDatasetMap({ ...snap.map });
        setHistoryIndex(prev => prev + 1);
    };

    // Cmd+Z / Cmd+Y keyboard shortcuts for undo/redo
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey) {
                if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
                if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [historyIndex, history]);

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

                // Check if this dataset has already been imported into this template as a field
                const existingField = fields.find(f => f.name === safeName);
                if (existingField) {
                    actualFieldId = existingField.id;
                } else {
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
                }

                // Bind the dataset mapping
                const nodeId = `${containerId}::${actualFieldId}`;
                setFieldDatasetMap(prev => ({ ...prev, [nodeId]: datasetId }));
            } else {
                return; // Silently fail if dataset not found or hook not provided
            }
        }

        setTree(prev => ({
            ...prev,
            [containerId]: [...(prev[containerId] || []), actualFieldId]
        }));
    };

    const handleRemoveField = (fieldId: string, containerId: string) => {
        setTree(prev => {
            pushHistory(prev, fieldDatasetMap);
            const next = { ...prev };
            if (next[containerId]) {
                next[containerId] = next[containerId].filter(id => id !== fieldId);
            }

            const isUsedElsewhere = Object.keys(next).some(k => next[k].includes(fieldId));
            if (!isUsedElsewhere) {
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
            }
            return next;
        });

        setFieldDatasetMap(prev => {
            const next = { ...prev };
            const nodeId = `${containerId}::${fieldId}`;
            delete next[nodeId];
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

    // Detect fields assigned to genuinely conflicting branches.
    // A field under multiple options of the SAME parent (e.g. Size::Small + Size::Large)
    // is fine — those are mutually exclusive. Only flag when a field appears under
    // DIFFERENT parent fields, which could both be active simultaneously.
    const conflictedFieldIds = useMemo(() => {
        const fieldParents: Record<string, Set<string>> = {};
        Object.entries(tree).forEach(([containerId, childIds]) => {
            // Extract the parent field ID from the container key (format: "parentFieldId::optionValue")
            const parentFieldId = containerId === 'root' ? '__root__' : containerId.split('::')[0];
            childIds.forEach(id => {
                if (!fieldParents[id]) fieldParents[id] = new Set();
                fieldParents[id].add(parentFieldId);
            });
        });
        // Conflict only if the field lives under 2+ distinct parent fields
        return new Set(
            Object.entries(fieldParents)
                .filter(([, parents]) => parents.size > 1)
                .map(([id]) => id)
        );
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
        savedTree,
        savedDatasetMap,
        collapsedNodes,
        conflictedFieldIds,
        onToggleCollapse: handleToggleCollapse,
        onChangeDataset: (nodeId: string, datasetId: string) => {
            pushHistory(tree, fieldDatasetMap);
            setFieldDatasetMap(prev => ({ ...prev, [nodeId]: datasetId }));
        },
        onAddField: handleAddField,
        onRemoveField: handleRemoveField,
        availableFields,
        handleOpenNewFieldModal: openNewFieldModal
    }), [fieldsMap, tree, datasets, fieldDatasetMap, savedTree, savedDatasetMap, collapsedNodes, availableFields]);

    // --- Effect 1: full tree rebuild (only when SAVED rules change) ---
    // Fingerprint based on rule IDs + actions. This only changes after a server save,
    // NOT when only localFields changes (which would wipe local edits).
    const rulesFingerprintRef = React.useRef<string>("");

    useEffect(() => {
        const fingerprint = rules.map(r => `${r.id}:${r.actionType}:${r.targetFieldId}`).join("|");
        if (fingerprint === rulesFingerprintRef.current) return; // rules unchanged — skip rebuild
        rulesFingerprintRef.current = fingerprint;

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
                if (Array.isArray(conds) && conds.length > 0) {
                    const lastCond = conds[conds.length - 1];
                    if (lastCond && lastCond.operator === 'EQUALS') {
                        const pId = `${lastCond.fieldId}::${lastCond.value}`;
                        if (!newTree[pId]) newTree[pId] = [];
                        if (!newTree[pId].includes(r.targetFieldId)) {
                            newTree[pId].push(r.targetFieldId);
                            fieldsInTree.add(r.targetFieldId);
                        }
                    }
                }
            } else if (r.actionType === "LIMIT_OPTIONS_DATASET") {
                try {
                    const parsed = typeof r.targetOptionsJson === 'string' ? JSON.parse(r.targetOptionsJson) : r.targetOptionsJson;
                    if (parsed && parsed.datasetId) {
                        let conds = [];
                        try { conds = typeof r.conditionsJson === 'string' ? JSON.parse(r.conditionsJson) : r.conditionsJson; } catch (e) { }
                        if (Array.isArray(conds) && conds.length > 0) {
                            const lastCond = conds[conds.length - 1];
                            if (lastCond && lastCond.operator === 'EQUALS') {
                                const pId = `${lastCond.fieldId}::${lastCond.value}`;
                                const nodeId = `${pId}::${r.targetFieldId}`;
                                newFieldDatasetMap[nodeId] = parsed.datasetId;
                            }
                        }
                    }
                } catch (e) { }
            }
        });

        newTree.root = fields.map(f => f.id).filter(id => !fieldsInTree.has(id));
        setTree(newTree);
        setFieldDatasetMap(newFieldDatasetMap);
        // Collapse only leaf fields by default
        const leafIds = new Set(
            fields
                .filter(f => {
                    const opts = Array.isArray(f.optionsJson) ? f.optionsJson : [];
                    if (opts.length === 0) return false;
                    return opts.every(opt => (newTree[`${f.id}::${opt}`] || []).length === 0);
                })
                .map(f => f.id)
        );
        setCollapsedNodes(leafIds);
        setSavedTree(JSON.parse(JSON.stringify(newTree)));
        setSavedDatasetMap({ ...newFieldDatasetMap });
    }, [fields, rules]); // eslint-disable-line react-hooks/exhaustive-deps

    // --- Effect 2: patch option-slot keys for newly added local fields ---
    // When a new local field is added (via dataset dropdown or modal), `fields` changes
    // but `rules` don't. We just ensure the field's option-slot keys exist in the tree
    // so it can be rendered — without resetting any existing placements.
    useEffect(() => {
        setTree(prev => {
            let changed = false;
            const next = { ...prev };
            fields.forEach(f => {
                const opts = Array.isArray(f.optionsJson) ? f.optionsJson : [];
                opts.forEach(opt => {
                    const key = `${f.id}::${opt}`;
                    if (!(key in next)) {
                        next[key] = [];
                        changed = true;
                    }
                });
            });
            return changed ? next : prev;
        });
    }, [fields]);

    const handleCompileRules = () => {
        if (conflictedFieldIds.size > 0) {
            if (!window.confirm("Warning: You have fields with CONFLICTS in your tree (assigned to multiple parent branches). This may cause them to be hidden unexpectedly.\n\nAre you sure you want to save?")) {
                return;
            }
        }

        if (availableFields.length > 0) {
            if (!window.confirm(`Warning: You have ${availableFields.length} unassigned field(s) below the tree.\n\nUnassigned fields are UNCONDITIONALLY visible to all customers. This can cause duplicate fields if they are orphaned datasets.\n\nAre you sure you want to save? (To remove them, cancel and delete them from the Unassigned Fields list).`)) {
                return;
            }
        }

        const compiledRules: Partial<Rule>[] = [];
        // Track each field's position in a DFS traversal so the backend can
        // re-sort fields to visually match the tree depth order.
        const fieldSortOrder: Array<{ fieldId: string; sort: number }> = [];
        const seenFieldIds = new Set<string>();

        const traverse = (containerId: string, inheritedConditions: any[]) => {
            const children = tree[containerId] || [];

            let currentConditions = [...inheritedConditions];
            if (containerId !== "root") {
                const [parentFieldId, parentValue] = containerId.split("::");
                currentConditions.push({ fieldId: parentFieldId, operator: "EQUALS", value: parentValue });
            }

            children.forEach((childId) => {
                // Record DFS order for sorting (first encounter only)
                if (!seenFieldIds.has(childId)) {
                    seenFieldIds.add(childId);
                    fieldSortOrder.push({ fieldId: childId, sort: fieldSortOrder.length });
                }

                if (containerId !== "root") {
                    compiledRules.push({
                        targetFieldId: childId,
                        actionType: "SHOW",
                        conditionsJson: currentConditions,
                    });
                }

                // Regardless of root or logic, apply dataset constraints if any
                const nodeId = `${containerId}::${childId}`;
                if (fieldDatasetMap[nodeId]) {
                    compiledRules.push({
                        targetFieldId: childId,
                        actionType: "LIMIT_OPTIONS_DATASET",
                        targetOptionsJson: { datasetId: fieldDatasetMap[nodeId] },
                        conditionsJson: currentConditions,
                    });
                }

                // Recursively traverse this child's options
                const field = fieldsMap[childId];
                if (field && Array.isArray(field.optionsJson)) {
                    field.optionsJson.forEach((opt: string) => {
                        traverse(`${childId}::${opt}`, currentConditions);
                    });
                } else if (fieldDatasetMap[nodeId]) {
                    // Fallback to reading from the dataset directly if it's a completely new uncommitted field
                    const datasetId = fieldDatasetMap[nodeId];
                    const dataset = datasets?.find(d => d.id === datasetId);
                    let opts = [];
                    try { opts = typeof dataset?.optionsJson === 'string' ? JSON.parse(dataset.optionsJson) : (dataset?.optionsJson || []); } catch (e) { }
                    if (Array.isArray(opts)) {
                        opts.forEach((opt: string) => {
                            traverse(`${childId}::${opt}`, currentConditions);
                        });
                    }
                }
            });
        };

        traverse("root", []);
        onSaveRules(compiledRules, fieldSortOrder);
    };

    // Register the save function with the parent for Cmd+S support
    useEffect(() => {
        onRegisterSaveRef?.(handleCompileRules);
    }); // runs every render so the ref always points to fresh handleCompileRules

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
                        <BlockStack gap="100" inlineAlign="end">
                            <InlineStack gap="200" blockAlign="center">
                                <Button
                                    variant="tertiary"
                                    disabled={historyIndex <= 0}
                                    onClick={handleUndo}
                                    accessibilityLabel="Undo"
                                >
                                    ↩ Undo
                                </Button>
                                <Button
                                    variant="tertiary"
                                    disabled={historyIndex >= history.length - 1}
                                    onClick={handleRedo}
                                    accessibilityLabel="Redo"
                                >
                                    ↪ Redo
                                </Button>
                                <Button variant="primary" onClick={handleCompileRules}>
                                    Save Rules Tree
                                </Button>
                            </InlineStack>
                            {lastSavedAt && (
                                <Text as="span" variant="bodySm" tone="subdued">
                                    Last saved {lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Text>
                            )}
                            <Text as="span" variant="bodySm" tone="subdued">
                                Tip: ⌘S / Ctrl+S also saves
                            </Text>
                        </BlockStack>
                    </InlineStack>

                    <Box background="bg-surface-secondary" padding="400" borderRadius="200" minHeight="400px">
                        <div style={{ paddingBottom: "100px" }}>
                            {tree["root"]?.length === 0 && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', gap: '12px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '40px' }}>🌳</div>
                                    <Text as="p" variant="bodyMd" fontWeight="semibold">Your rule tree is empty</Text>
                                    <Text as="p" variant="bodySm" tone="subdued">Use the dropdown below to add your first root field. Root fields are always visible to customers — then nest deeper fields conditionally under each option.</Text>
                                </div>
                            )}
                            {tree["root"]?.map((id) => (
                                <RenderFieldNodeById
                                    key={id}
                                    fieldId={id}
                                    containerId="root"
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

                    {availableFields.length > 0 && (
                        <Box background="bg-surface-warning" padding="400" borderRadius="200">
                            <BlockStack gap="200">
                                <Text as="h4" variant="headingSm">
                                    ⚠️ Unassigned Fields ({availableFields.length})
                                </Text>
                                <Text as="p" tone="subdued">
                                    The following fields are not in your Visual Tree and have no SHOW rules. They will be unconditionally visible to everyone. If these are orphaned Datasets, you can safely delete them absolutely.
                                </Text>
                                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                                    {availableFields.map(f => (
                                        <Card key={f.id} padding="300">
                                            <InlineStack align="space-between" blockAlign="center">
                                                <div>
                                                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                                                        {f.label || f.name}
                                                    </Text>
                                                    <Text as="span" variant="bodySm" tone="subdued">
                                                        {" "} (Internal: {f.name})
                                                    </Text>
                                                </div>
                                                <Button
                                                    variant="plain"
                                                    tone="critical"
                                                    icon={DeleteIcon}
                                                    onClick={() => {
                                                        if (onDeleteOrphanedField) onDeleteOrphanedField(f.id);
                                                    }}
                                                    accessibilityLabel="Remove field entirely"
                                                />
                                            </InlineStack>
                                        </Card>
                                    ))}
                                </div>
                            </BlockStack>
                        </Box>
                    )}
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
