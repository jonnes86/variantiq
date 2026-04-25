import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ReactFlow,
    Controls,
    Background,
    applyNodeChanges,
    applyEdgeChanges,
    addEdge,
    Handle,
    Position,
    Node,
    Edge,
    NodeTypes,
    OnNodesChange,
    OnEdgesChange,
    OnConnect,
    useReactFlow,
    ReactFlowProvider,
} from '@xyflow/react';
import dagre from 'dagre';
import '@xyflow/react/dist/style.css';
import { Card, BlockStack, Text, Button, InlineStack, Select, Badge, Box, Icon } from '@shopify/polaris';
import { EditIcon } from '@shopify/polaris-icons';

export interface Field {
    id: string;
    name: string;
    type: string;
    label: string;
    optionsJson: any;
}

export interface Rule {
    id: string;
    conditionsJson: any;
    targetFieldId: string;
    actionType: string;
    targetOptionsJson: any;
}

function FieldNodeComponent({ data, id }: any) {
    const { field, onDelete, onEditField, onDatasetChange, datasets, selectedDatasetId } = data;
    const options = Array.isArray(field.optionsJson) ? field.optionsJson : [];

    return (
        <div style={{ background: '#ffffff', border: '1px solid var(--p-color-border-strong)', borderRadius: '8px', minWidth: '220px', boxShadow: 'var(--p-shadow-100)' }}>
            <Handle type="target" position={Position.Top} style={{ background: 'var(--p-color-bg-fill-info)', width: '16px', height: '16px', borderRadius: '4px' }} />
            
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--p-color-border-subdued)', background: 'var(--p-color-bg-surface-secondary)', borderTopLeftRadius: '8px', borderTopRightRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text as="span" variant="bodyMd" fontWeight="bold">👖 {field.label || field.name}</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div onClick={(e) => { e.stopPropagation(); onEditField?.(id); }} style={{ cursor: 'pointer' }}>
                        <Icon source={EditIcon} tone="subdued" />
                    </div>
                    <div onClick={(e) => { e.stopPropagation(); onDelete(id); }} style={{ cursor: 'pointer', color: 'var(--p-color-text-critical)', fontSize: '18px', lineHeight: '1', paddingLeft: '4px' }}>
                        ×
                    </div>
                </div>
            </div>

            {datasets && datasets.length > 0 && options.length > 0 && (
                <div style={{ padding: '8px', borderBottom: '1px solid var(--p-color-border-subdued)' }} className="nodrag">
                    <Select
                        label="Attach Dataset"
                        labelHidden={false}
                        options={[{label: 'Use own options', value: ''}, ...datasets.map((d: any) => ({ label: `Dataset: ${d.name}`, value: d.id }))]}
                        value={selectedDatasetId || ''}
                        onChange={(val) => onDatasetChange(id, val)}
                    />
                </div>
            )}

            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {options.length === 0 ? (
                    <div style={{ padding: '0 12px' }}>
                        <Text as="span" variant="bodySm" tone="subdued">No options available</Text>
                    </div>
                ) : (
                    options.map((opt: string) => (
                        <div key={opt} style={{ position: 'relative', textAlign: 'right', padding: '4px 30px 4px 12px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <Text as="span" variant="bodySm" tone="subdued" fontWeight="medium" truncate>
                                drag →
                            </Text>
                            <div style={{ paddingLeft: '8px' }}>
                                <Badge tone="success">{opt}</Badge>
                            </div>
                            <Handle 
                                type="source" 
                                position={Position.Right} 
                                id={opt} 
                                style={{ top: '50%', right: '-8px', background: '#f59e0b', width: '16px', height: '16px', border: '2px solid #fff' }} 
                            />
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

const nodeTypes: NodeTypes = { fieldNode: FieldNodeComponent };

interface CanvasRuleBuilderProps {
    fields: Field[];
    rules: Rule[];
    datasets?: any[];
    onSaveRules: (newRules: Partial<Rule>[], fieldSortOrder?: any[]) => void;
    onAddNewField?: () => void;
    onEditField?: (fieldId: string) => void;
    onRegisterSaveRef?: (fn: () => void) => void;
    lastSavedAt?: Date | null;
}

export function CanvasRuleBuilder(props: CanvasRuleBuilderProps) {
    return (
        <ReactFlowProvider>
            <CanvasRuleBuilderInner {...props} />
        </ReactFlowProvider>
    );
}

function CanvasRuleBuilderInner({ fields, rules, datasets = [], onSaveRules, onAddNewField, onEditField, onRegisterSaveRef, lastSavedAt }: CanvasRuleBuilderProps) {
    const [nodes, setNodes] = useState<Node[]>([]);
    const [edges, setEdges] = useState<Edge[]>([]);
    const nodesRef = React.useRef<Node[]>([]);
    const edgesRef = React.useRef<Edge[]>([]);
    const [history, setHistory] = useState<{nodes: Node[], edges: Edge[]}[]>([]);
    const { fitView } = useReactFlow();

    useEffect(() => {
        nodesRef.current = nodes;
        edgesRef.current = edges;
    }, [nodes, edges]);

    const saveHistory = useCallback(() => {
        setHistory(prev => [...prev.slice(-19), { nodes: nodesRef.current, edges: edgesRef.current }]);
    }, []);

    const handleUndo = useCallback(() => {
        if (history.length === 0) return;
        const lastState = history[history.length - 1];
        setNodes(lastState.nodes);
        setEdges(lastState.edges);
        setHistory(prev => prev.slice(0, -1));
    }, [history]);

    const onNodesChange: OnNodesChange = useCallback(
        (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
        []
    );
    const onEdgesChange: OnEdgesChange = useCallback(
        (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
        []
    );
    const onConnect: OnConnect = useCallback(
        (connection) => {
            saveHistory();
            setEdges((eds) => addEdge({ ...connection, type: 'smoothstep', animated: true, style: { stroke: '#f59e0b', strokeWidth: 2 } }, eds));
        },
        [saveHistory]
    );

    const handleDeleteNode = useCallback((nodeId: string) => {
        saveHistory();
        setNodes((nds) => nds.filter((n) => n.id !== nodeId));
        setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    }, [saveHistory]);

    const handleDatasetChange = useCallback((nodeId: string, datasetId: string) => {
        setNodes((nds) => nds.map(n => {
            if (n.id === nodeId) {
                return { ...n, data: { ...n.data, selectedDatasetId: datasetId } };
            }
            return n;
        }));
    }, []);

    // Initialize from existing rules
    useEffect(() => {
        const initialNodes: Node[] = [];
        const initialEdges: Edge[] = [];
        const addedFields = new Set<string>();
        
        let rootX = 50;
        let rootY = 50;

        rules.forEach(r => {
            let conds = [];
            try { conds = typeof r.conditionsJson === 'string' ? JSON.parse(r.conditionsJson) : (r.conditionsJson || []); } catch(e){}
            let targetOpts = {};
            try { targetOpts = typeof r.targetOptionsJson === 'string' ? JSON.parse(r.targetOptionsJson) : (r.targetOptionsJson || {}); } catch(e){}
            
            if (r.actionType === 'SHOW' && conds.length > 0) {
                const c = conds[conds.length - 1]; // last condition usually dictates immediate parent
                if (c.operator === 'EQUALS') {
                    // Create edge
                    initialEdges.push({
                        id: `e_${c.fieldId}_${c.value}_${r.targetFieldId}`,
                        source: c.fieldId,
                        sourceHandle: c.value,
                        target: r.targetFieldId,
                        type: 'smoothstep',
                        animated: true,
                        style: { stroke: '#f59e0b', strokeWidth: 2 }
                    });

                    // Add nodes if they don't exist
                    [c.fieldId, r.targetFieldId].forEach(id => {
                        if (!addedFields.has(id)) {
                            const fieldDef = fields.find(f => f.id === id);
                            if (fieldDef) {
                                initialNodes.push({
                                    id,
                                    type: 'fieldNode',
                                    position: id === r.targetFieldId && targetOpts.x ? { x: targetOpts.x, y: targetOpts.y } : { x: rootX, y: rootY },
                                    data: { field: fieldDef, onDelete: handleDeleteNode, onDatasetChange: handleDatasetChange, datasets, selectedDatasetId: '' }
                                });
                                addedFields.add(id);
                                rootX += 50;
                                rootY += 50;
                            }
                        }
                    });
                }
            } else if (r.actionType === 'LIMIT_OPTIONS_DATASET' && targetOpts.datasetId) {
                // Attach dataset to existing node
                const node = initialNodes.find(n => n.id === r.targetFieldId);
                if (node) {
                    node.data.selectedDatasetId = targetOpts.datasetId;
                }
            }
        });

        // Update data callbacks dynamically
        const updatedNodes = initialNodes.map(n => ({
            ...n,
            data: { ...n.data, onDelete: handleDeleteNode, onEditField, onDatasetChange: handleDatasetChange, datasets }
        }));

        // Apply auto-layout if any nodes are missing saved coordinates (x=50, y=50 pattern)
        const needsLayout = updatedNodes.some(n => n.position.x === 50 && n.position.y === 50);
        
        if (needsLayout && updatedNodes.length > 0) {
            const dagreGraph = new dagre.graphlib.Graph();
            dagreGraph.setDefaultEdgeLabel(() => ({}));
            dagreGraph.setGraph({ rankdir: 'LR', align: 'UL', ranksep: 100, nodesep: 50 });

            updatedNodes.forEach((node) => {
                dagreGraph.setNode(node.id, { width: 280, height: 150 });
            });

            initialEdges.forEach((edge) => {
                dagreGraph.setEdge(edge.source, edge.target);
            });

            dagre.layout(dagreGraph);

            updatedNodes.forEach((node) => {
                const nodeWithPosition = dagreGraph.node(node.id);
                // Only override if it didn't have a specifically saved manual position
                node.position = {
                    x: nodeWithPosition.x - 140,
                    y: nodeWithPosition.y - 75,
                };
            });
        }

        setNodes(updatedNodes);
        setEdges(initialEdges);

        setTimeout(() => {
            fitView({ padding: 0.2, duration: 800 });
        }, 50);
    }, [fields, rules, datasets, handleDeleteNode, handleDatasetChange, fitView, onEditField]);

    const onLayout = useCallback(() => {
        saveHistory();
        const dagreGraph = new dagre.graphlib.Graph();
        dagreGraph.setDefaultEdgeLabel(() => ({}));
        dagreGraph.setGraph({ rankdir: 'LR', ranksep: 150, nodesep: 50 });

        nodes.forEach((node) => {
            dagreGraph.setNode(node.id, { width: 280, height: 150 });
        });

        edges.forEach((edge) => {
            dagreGraph.setEdge(edge.source, edge.target);
        });

        dagre.layout(dagreGraph);

        setNodes((nds) =>
            nds.map((node) => {
                const nodeWithPosition = dagreGraph.node(node.id);
                return {
                    ...node,
                    position: {
                        x: nodeWithPosition.x - 140,
                        y: nodeWithPosition.y - 75,
                    },
                };
            })
        );

        setTimeout(() => {
            fitView({ padding: 0.2, duration: 800 });
        }, 50);
    }, [nodes, edges, saveHistory, fitView]);

    const handleSave = () => {
        const compiledRules: Partial<Rule>[] = [];
        
        edges.forEach(edge => {
            const targetNode = nodes.find(n => n.id === edge.target);
            const datasetId = targetNode?.data?.selectedDatasetId;
            const x = targetNode?.position?.x || 0;
            const y = targetNode?.position?.y || 0;

            compiledRules.push({
                targetFieldId: edge.target,
                actionType: "SHOW",
                conditionsJson: [{ fieldId: edge.source, operator: "EQUALS", value: edge.sourceHandle }],
                targetOptionsJson: { x, y }
            });

            if (datasetId) {
                compiledRules.push({
                    targetFieldId: edge.target,
                    actionType: "LIMIT_OPTIONS_DATASET",
                    conditionsJson: [{ fieldId: edge.source, operator: "EQUALS", value: edge.sourceHandle }],
                    targetOptionsJson: { datasetId, x, y }
                });
            }
        });

        onSaveRules(compiledRules, []);
    };

    useEffect(() => {
        onRegisterSaveRef?.(handleSave);
    });

    const addFieldToCanvas = (fieldId: string) => {
        if (!fieldId) return;
        const fieldDef = fields.find(f => f.id === fieldId);
        if (!fieldDef) return;

        // Ensure we don't add duplicates
        if (nodes.some(n => n.id === fieldId)) {
            alert("This field is already on the canvas.");
            return;
        }

        saveHistory();

        setNodes(nds => [
            ...nds,
            {
                id: fieldId,
                type: 'fieldNode',
                position: { x: 100, y: 100 },
                data: { field: fieldDef, onDelete: handleDeleteNode, onDatasetChange: handleDatasetChange, datasets, selectedDatasetId: '' }
            }
        ]);
    };

    const fieldOptions = [{ label: "Add field to canvas...", value: "" }, ...fields.map(f => ({ label: f.label || f.name, value: f.id }))];

    return (
        <Card padding="0">
            <div style={{ padding: '16px', borderBottom: '1px solid var(--p-color-border-subdued)' }}>
                <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                        <Text as="h3" variant="headingMd">2D Visual Logic Graph</Text>
                        <Text as="p" tone="subdued">
                            Drag Option Sets onto the canvas. Connect an option (orange dot) to another Option Set (blue dot) to create conditional logic.
                        </Text>
                    </BlockStack>
                    <InlineStack gap="300" blockAlign="center">
                        <Button variant="plain" onClick={onLayout}>Auto Layout</Button>
                        {history.length > 0 && (
                            <Button variant="plain" onClick={handleUndo}>Undo</Button>
                        )}
                        <Button onClick={onAddNewField}>Add Option Set</Button>
                        <Select
                            label="Add Node"
                            labelHidden
                            options={fieldOptions}
                            value=""
                            onChange={addFieldToCanvas}
                        />
                        <Button variant="primary" onClick={handleSave}>Save Canvas</Button>
                    </InlineStack>
                </InlineStack>
            </div>
            
            <div style={{ height: '600px', width: '100%', backgroundColor: '#fafafa' }}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    nodeTypes={nodeTypes}
                    fitView
                    defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
                >
                    <Background color="#ccc" gap={16} />
                    <Controls />
                </ReactFlow>
            </div>
        </Card>
    );
}
