import React, { useState, useEffect, useMemo } from "react";
import {
    Card,
    Text,
    BlockStack,
    InlineGrid,
    Button,
    Badge,
    Divider,
    Box,
    InlineStack,
    Icon,
} from "@shopify/polaris";
import { DragHandleIcon } from "@shopify/polaris-icons";
import {
    DndContext,
    closestCorners,
    useSensor,
    useSensors,
    PointerSensor,
    KeyboardSensor,
    DragOverlay,
} from "@dnd-kit/core";
import {
    SortableContext,
    useSortable,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
    onSaveRules: (newRules: Partial<Rule>[]) => void;
}

// ----------------------------------------------------
// COMPONENTS
// ----------------------------------------------------

function SortableFieldNode({ field, options, childrenObj }: { field: Field, options: string[], childrenObj?: Record<string, string[]> }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: field.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        marginBottom: "12px",
    };

    return (
        <div ref={setNodeRef} style={style}>
            <Card padding="300">
                <BlockStack gap="200">
                    {/* Field Header */}
                    <InlineStack align="start" blockAlign="center" gap="200" wrap={false}>
                        <div {...attributes} {...listeners} style={{ cursor: "grab", marginTop: "2px" }}>
                            <Icon source={DragHandleIcon} tone="subdued" />
                        </div>
                        <div style={{ flex: 1 }}>
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                                {field.name}
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                                {" "}— {field.type}
                            </Text>
                        </div>
                    </InlineStack>

                    {/* Child Dropzones for Options */}
                    {options.length > 0 && (
                        <div style={{ marginLeft: "28px", marginTop: "8px", display: "flex", flexDirection: "column", gap: "12px" }}>
                            {options.map((opt) => {
                                const dropId = `${field.id}::${opt}`;
                                const nestedChildIds = childrenObj?.[dropId] || [];

                                return (
                                    <Card key={opt} background="bg-surface-secondary" padding="200">
                                        <BlockStack gap="200">
                                            <Text as="span" variant="bodySm" fontWeight="bold" tone="subdued">
                                                ↳ IF is "{opt}"
                                            </Text>

                                            <SortableContext id={dropId} items={nestedChildIds} strategy={verticalListSortingStrategy}>
                                                <div style={{ minHeight: "32px", padding: "4px", border: "1px dashed var(--p-color-border)", borderRadius: "var(--p-border-radius-100)" }}>
                                                    {nestedChildIds.length === 0 ? (
                                                        <Text as="span" variant="bodySm" tone="subdued">
                                                            Drop fields here to show...
                                                        </Text>
                                                    ) : (
                                                        nestedChildIds.map(childId => <RenderFieldNodeById key={childId} fieldId={childId} />)
                                                    )}
                                                </div>
                                            </SortableContext>
                                        </BlockStack>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </BlockStack>
            </Card>
        </div>
    );
}

// Helper to pull the node from global map so we don't drill fields infinitely
let globalFieldsMap: Record<string, Field> = {};
let globalTree: Record<string, string[]> = {};

function RenderFieldNodeById({ fieldId }: { fieldId: string }) {
    const f = globalFieldsMap[fieldId];
    if (!f) return null;
    const opts = (Array.isArray(f.optionsJson) ? f.optionsJson : []) as string[];
    return <SortableFieldNode field={f} options={opts} childrenObj={globalTree} />;
}


// ----------------------------------------------------
// MAIN BUILDER
// ----------------------------------------------------

export function VisualRuleBuilder({ fields, rules, onSaveRules }: VisualRuleBuilderProps) {
    const [activeId, setActiveId] = useState<string | null>(null);

    // tree shape: { "unassigned": [id, id], "root": [id], "field1::opt1": [id, id] }
    const [tree, setTree] = useState<Record<string, string[]>>({ unassigned: [], root: [] });

    useMemo(() => {
        fields.forEach(f => { globalFieldsMap[f.id] = f; });
    }, [fields]);

    useEffect(() => {
        globalTree = tree;
    }, [tree]);

    // Init tree on load
    useEffect(() => {
        const newTree: Record<string, string[]> = { unassigned: [], root: [] };

        fields.forEach(f => {
            const opts = Array.isArray(f.optionsJson) ? f.optionsJson : [];
            opts.forEach(opt => {
                newTree[`${f.id}::${opt}`] = [];
            });
        });

        const fieldsInTree = new Set<string>();

        rules.forEach(r => {
            // Right now the visual builder just maps the SHOW cascade
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
            }
        });

        // Anything not nested is unassigned (merchant must explicitly drag to root to keep order)
        newTree.unassigned = fields.map(f => f.id).filter(id => !fieldsInTree.has(id));
        setTree(newTree);
    }, [fields, rules]);

    // -------------------------
    // DND Handlers
    // -------------------------
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragStart = (event: any) => {
        setActiveId(event.active.id);
    };

    const handleDragOver = (event: any) => {
        const { active, over } = event;
        if (!over) return;

        const activeContainer = findContainer(active.id);
        const overContainer = over.id in tree ? over.id : findContainer(over.id);

        // Don't drag a field into itself or its own children (simple prevention)
        if (overContainer && overContainer.startsWith(`${active.id}::`)) return;

        if (!activeContainer || !overContainer || activeContainer === overContainer) {
            return;
        }

        setTree((prev) => {
            const activeItems = [...prev[activeContainer]];
            const overItems = [...prev[overContainer]];

            const activeIndex = activeItems.indexOf(active.id);
            const overIndex = over.id in prev ? overItems.length : overItems.indexOf(over.id);

            activeItems.splice(activeIndex, 1);

            const isBelowOverItem =
                over &&
                active.rect.current.translated &&
                active.rect.current.translated.top > over.rect.top + over.rect.height;

            const modifier = isBelowOverItem ? 1 : 0;
            const newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length;

            overItems.splice(newIndex, 0, active.id);

            return {
                ...prev,
                [activeContainer]: activeItems,
                [overContainer]: overItems,
            };
        });
    };

    const handleDragEnd = (event: any) => {
        setActiveId(null);
        const { active, over } = event;
        if (!over) return;

        const activeContainer = findContainer(active.id);
        const overContainer = over.id in tree ? over.id : findContainer(over.id);

        if (activeContainer && overContainer && activeContainer === overContainer) {
            const activeIndex = tree[activeContainer].indexOf(active.id);
            const overIndex = tree[overContainer].indexOf(over.id);

            if (activeIndex !== overIndex) {
                setTree((prev) => ({
                    ...prev,
                    [overContainer]: arrayMove(prev[overContainer], activeIndex, overIndex),
                }));
            }
        }
    };

    const findContainer = (id: string) => {
        if (id in tree) return id;
        return Object.keys(tree).find((key) => tree[key].includes(id));
    };


    // -------------------------
    // Save Logic
    // -------------------------
    const handleCompileRules = () => {
        const compiledRules: Partial<Rule>[] = [];

        Object.entries(tree).forEach(([containerId, children]) => {
            if (containerId === "unassigned" || containerId === "root") return;

            const [parentFieldId, parentValue] = containerId.split("::");

            children.forEach((childId) => {
                compiledRules.push({
                    targetFieldId: childId,
                    actionType: "SHOW",
                    conditionsJson: [{ fieldId: parentFieldId, operator: "EQUALS", value: parentValue }],
                });
            });
        });

        onSaveRules(compiledRules);
    };

    // -------------------------
    // Render
    // -------------------------
    const activeField = fields.find(f => f.id === activeId);

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <InlineGrid columns={{ xs: "1fr", md: "300px 1fr" }} gap="400" alignItems="start">
                {/* Unassigned Pool */}
                <Card>
                    <BlockStack gap="400">
                        <Text as="h3" variant="headingMd">
                            Unassigned Fields
                        </Text>
                        <Text as="p" tone="subdued">
                            Drag fields from here into the Root Canvas or into specific Options.
                        </Text>
                        <Divider />

                        <SortableContext id="unassigned" items={tree["unassigned"] || []} strategy={verticalListSortingStrategy}>
                            <div style={{ minHeight: "200px" }}>
                                {tree["unassigned"]?.map((id) => <RenderFieldNodeById key={id} fieldId={id} />)}
                            </div>
                        </SortableContext>
                    </BlockStack>
                </Card>

                {/* Main Canvas */}
                <Card>
                    <BlockStack gap="400">
                        <InlineStack align="space-between" blockAlign="center">
                            <BlockStack gap="100">
                                <Text as="h3" variant="headingMd">
                                    Visual Canvas
                                </Text>
                                <Text as="p" tone="subdued">
                                    Fields in the root are shown unconditionally. Fields inside options are only shown when that option is selected.
                                </Text>
                            </BlockStack>
                            <Button variant="primary" onClick={handleCompileRules}>
                                Save Rules Tree
                            </Button>
                        </InlineStack>

                        <Box background="bg-surface-secondary" padding="400" borderRadius="200" minHeight="400px">
                            <SortableContext id="root" items={tree["root"] || []} strategy={verticalListSortingStrategy}>
                                <div style={{ minHeight: "100%", paddingBottom: "100px" }}>
                                    {tree["root"]?.length === 0 && (
                                        <Text as="p" tone="subdued">Drop unconditional fields here...</Text>
                                    )}
                                    {tree["root"]?.map((id) => <RenderFieldNodeById key={id} fieldId={id} />)}
                                </div>
                            </SortableContext>
                        </Box>
                    </BlockStack>
                </Card>
            </InlineGrid>

            <DragOverlay>
                {activeField ? (
                    <div style={{ opacity: 0.9, cursor: "grabbing" }}>
                        <Card padding="300" background="bg-surface">
                            <InlineStack align="start" blockAlign="center" gap="200">
                                <Icon source={DragHandleIcon} tone="subdued" />
                                <Text as="span" variant="bodyMd" fontWeight="semibold">
                                    {activeField.name}
                                </Text>
                            </InlineStack>
                        </Card>
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
