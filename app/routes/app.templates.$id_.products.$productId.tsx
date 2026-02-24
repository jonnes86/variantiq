import {
    json,
    redirect,
    type ActionFunctionArgs,
    type LoaderFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useSubmit, Form, useNavigate } from "@remix-run/react";
import {
    Page,
    Card,
    TextField,
    Button,
    BlockStack,
    Tabs,
    Text,
    InlineGrid,
    Select,
    Checkbox,
    Banner,
    ResourceList,
    ResourceItem,
    InlineStack,
    Tag,
    Divider,
    Layout,
    ButtonGroup,
} from "@shopify/polaris";
import { prisma } from "../db.server";
import { Prisma } from "@prisma/client";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { VisualRuleBuilder } from "../components/VisualRuleBuilder";

// We use the same random IDs for in-memory unsaved items
function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
    const { session } = await authenticate.admin(request);
    if (!session) return redirect("/auth/login");

    const templateId = params.id;
    const productId = params.productId;

    if (!templateId || !productId) return redirect("/app");

    const productGid = `gid://shopify/Product/${productId}`;

    // Find the link between product and template
    const link = await prisma.productTemplateLink.findFirst({
        where: { productGid, templateId, shop: session.shop },
        include: {
            template: {
                include: {
                    fields: { orderBy: { sort: "asc" } },
                    rules: { orderBy: { sort: "asc" } },
                },
            },
        },
    });

    if (!link) {
        throw new Response("Product not linked to template", { status: 404 });
    }

    // Fetch product info from Shopify Graphql to show title in UI
    const { admin } = await authenticate.admin(request);
    const response = await admin.graphql(
        `#graphql
      query getProduct($id: ID!) {
        product(id: $id) {
          title
        }
      }`,
        {
            variables: {
                id: productGid,
            },
        }
    );

    const parsedResponse = await response.json();
    const productTitle = parsedResponse.data?.product?.title || "Product";

    // Provide initial state: either the existing overrides, or fall back to template defaults to start customizing
    const activeFields = (link as any).customFieldsJson || link.template.fields;
    const activeRules = (link as any).customRulesJson || link.template.rules;

    return json({
        linkId: link.id,
        templateId,
        productGid,
        productId,
        productTitle,
        templateName: link.template.name,
        hasOverrides: !!((link as any).customFieldsJson || (link as any).customRulesJson),
        initialFields: activeFields,
        initialRules: activeRules
    });
}

export async function action({ request, params }: ActionFunctionArgs) {
    const { session } = await authenticate.admin(request);
    if (!session) return redirect("/auth/login");

    const form = await request.formData();
    const intent = String(form.get("_intent"));
    const linkId = String(form.get("linkId"));

    if (!linkId) return json({ error: "Link ID required" }, { status: 400 });

    if (intent === "saveOverrides") {
        const customFieldsStr = String(form.get("customFieldsJson") || "[]");
        const customRulesStr = String(form.get("customRulesJson") || "[]");

        let customFieldsJson, customRulesJson;
        try {
            customFieldsJson = JSON.parse(customFieldsStr);
            customRulesJson = JSON.parse(customRulesStr);
        } catch (e) {
            return json({ error: "Invalid JSON data" }, { status: 400 });
        }

        await prisma.productTemplateLink.update({
            where: { id: linkId },
            data: {
                customFieldsJson: customFieldsJson as any,
                customRulesJson: customRulesJson as any,
            } as any,
        });

        return json({ success: true });
    }

    if (intent === "clearOverrides") {
        // Reset to use global template by nulling out the JSON blobs
        await prisma.productTemplateLink.update({
            where: { id: linkId },
            data: {
                customFieldsJson: Prisma.DbNull as any,
                customRulesJson: Prisma.DbNull as any,
            } as any,
        });
        return json({ success: true });
    }

    return null;
}

export default function ProductOverrideDetail() {
    const {
        linkId,
        templateId,
        productId,
        productTitle,
        templateName,
        hasOverrides,
        initialFields,
        initialRules
    } = useLoaderData<typeof loader>();

    const submit = useSubmit();
    const navigate = useNavigate();
    const [selectedTab, setSelectedTab] = useState(0);

    // Sticky UI Rule Toggle
    const [ruleBuilderMode, setRuleBuilderMode] = useState<"TRADITIONAL" | "VISUAL">("VISUAL");
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
        const savedMode = localStorage.getItem("variantiq_rule_builder_mode");
        if (savedMode === "TRADITIONAL" || savedMode === "VISUAL") {
            setRuleBuilderMode(savedMode);
        }
    }, []);

    const handleRuleBuilderModeChange = (mode: "TRADITIONAL" | "VISUAL") => {
        setRuleBuilderMode(mode);
        localStorage.setItem("variantiq_rule_builder_mode", mode);
    };

    // In-memory state for fields and rules being edited
    const [fields, setFields] = useState<any[]>(initialFields as any[]);
    const [rules, setRules] = useState<any[]>(initialRules as any[]);

    // Field form state
    const [showFieldForm, setShowFieldForm] = useState(false);
    const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
    const [fieldType, setFieldType] = useState("text");
    const [fieldName, setFieldName] = useState("");
    const [fieldLabel, setFieldLabel] = useState("");
    const [fieldRequired, setFieldRequired] = useState(false);
    const [fieldOptionsList, setFieldOptionsList] = useState<Array<{ label: string, price: string, variantMapping: string }>>([]);

    const handleAddField = () => {
        if (!fieldType || !fieldName || !fieldLabel) return;

        let optionsJson = null;
        let priceAdjustmentsJson: Record<string, number> | null = null;

        let variantMappingJson: Record<string, string> | null = null;

        if (["select", "radio", "checkbox"].includes(fieldType) && fieldOptionsList.length > 0) {
            const validOptions = fieldOptionsList.filter(o => o.label.trim() !== "");
            optionsJson = validOptions.map(o => o.label.trim());

            let hasPrices = false;
            let hasMappings = false;
            const priceMap: Record<string, number> = {};
            const mappingMap: Record<string, string> = {};

            validOptions.forEach(o => {
                const price = parseFloat(o.price);
                if (!isNaN(price) && price > 0) {
                    priceMap[o.label.trim()] = price;
                    hasPrices = true;
                }
                if (o.variantMapping && o.variantMapping.trim() !== "") {
                    mappingMap[o.label.trim()] = o.variantMapping.trim();
                    hasMappings = true;
                }
            });
            if (hasPrices) priceAdjustmentsJson = priceMap;
            if (hasMappings) variantMappingJson = mappingMap;
        }

        if (editingFieldId) {
            setFields(fields.map(f => f.id === editingFieldId ? {
                ...f,
                type: fieldType,
                name: fieldName,
                label: fieldLabel,
                required: fieldRequired,
                optionsJson,
                priceAdjustmentsJson,
                variantMappingJson,
            } : f));
        } else {
            const newField = {
                id: "local_" + generateId(),
                type: fieldType,
                name: fieldName,
                label: fieldLabel,
                required: fieldRequired,
                optionsJson,
                priceAdjustmentsJson,
                variantMappingJson,
                sort: fields.length + 1
            };
            setFields([...fields, newField]);
        }

        resetFieldForm();
    };

    const resetFieldForm = () => {
        setFieldType("text");
        setFieldName("");
        setFieldLabel("");
        setFieldRequired(false);
        setFieldOptionsList([]);
        setEditingFieldId(null);
        setShowFieldForm(false);
    };

    const handleEditFieldClick = (field: any) => {
        setEditingFieldId(field.id);
        setFieldType(field.type);
        setFieldName(field.name);
        setFieldLabel(field.label);
        setFieldRequired(field.required);

        const list: Array<{ label: string, price: string, variantMapping: string }> = [];
        if (field.optionsJson && Array.isArray(field.optionsJson)) {
            field.optionsJson.forEach((opt: string) => {
                const price = field.priceAdjustmentsJson?.[opt];
                const mapping = field.variantMappingJson?.[opt];
                list.push({
                    label: opt,
                    price: price ? price.toString() : "",
                    variantMapping: mapping ? mapping.toString() : ""
                });
            });
        }
        setFieldOptionsList(list);

        setShowFieldForm(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleMoveField = (fieldId: string, direction: "up" | "down") => {
        const index = fields.findIndex(f => f.id === fieldId);
        if (index === -1) return;
        const newFields = [...fields];
        if (direction === "up" && index > 0) {
            const temp = newFields[index];
            newFields[index] = newFields[index - 1];
            newFields[index - 1] = temp;
        } else if (direction === "down" && index < fields.length - 1) {
            const temp = newFields[index];
            newFields[index] = newFields[index + 1];
            newFields[index + 1] = temp;
        }
        setFields(newFields);
    };

    const handleDeleteField = (id: string) => {
        setFields(fields.filter(f => f.id !== id));
        // Also cleanup rules that target this field
        setRules(rules.filter(r => r.targetFieldId !== id));
    };

    const handleSaveOverrides = () => {
        const formData = new FormData();
        formData.append("_intent", "saveOverrides");
        formData.append("linkId", linkId);
        formData.append("customFieldsJson", JSON.stringify(fields));
        formData.append("customRulesJson", JSON.stringify(rules));
        submit(formData, { method: "post" });
    };

    const handleClearOverrides = () => {
        if (confirm("Are you sure you want to revert to the global template? All product-specific options and rules will be lost.")) {
            const formData = new FormData();
            formData.append("_intent", "clearOverrides");
            formData.append("linkId", linkId);
            submit(formData, { method: "post" });
        }
    };

    // Rule visual builder state
    const [showRuleForm, setShowRuleForm] = useState(false);
    const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
    const [ruleConditions, setRuleConditions] = useState<any[]>([]);
    const [targetFieldId, setTargetFieldId] = useState("");
    const [actionType, setActionType] = useState("SHOW");
    // Limit Options State
    const [selectedLimitOptions, setSelectedLimitOptions] = useState<string[]>([]);


    const addBlankCondition = () => {
        setRuleConditions([...ruleConditions, { fieldId: "", operator: "EQUALS", value: "" }]);
    };

    const updateCondition = (index: number, key: string, val: string) => {
        const newConditions = [...ruleConditions];
        newConditions[index][key] = val;
        setRuleConditions(newConditions);
    };

    const removeCondition = (index: number) => {
        setRuleConditions(ruleConditions.filter((_, i) => i !== index));
    };


    const targetFieldObj = fields.find((f: any) => f.id === targetFieldId);

    const handleAddRule = () => {
        if (!targetFieldId) return;

        // Filter out incomplete conditions
        const validConditions = ruleConditions.filter(c => c.fieldId && c.value);
        if (validConditions.length === 0) return;

        let targetOptionsJson = null;
        if (actionType === "LIMIT_OPTIONS") {
            targetOptionsJson = selectedLimitOptions;
            if (targetOptionsJson.length === 0) return; // Must select at least one limit option
        }

        if (editingRuleId) {
            setRules(rules.map(r => r.id === editingRuleId ? {
                ...r,
                conditionsJson: validConditions,
                targetFieldId,
                actionType,
                targetOptionsJson,
            } : r));
        } else {
            const newRule = {
                id: "local_" + generateId(),
                conditionsJson: validConditions,
                targetFieldId,
                actionType,
                targetOptionsJson,
                sort: rules.length + 1
            };
            setRules([...rules, newRule]);
        }

        resetRuleForm();
    };

    const resetRuleForm = () => {
        setShowRuleForm(false);
        setEditingRuleId(null);
        setRuleConditions([]);
        setTargetFieldId("");
        setActionType("SHOW");
        setSelectedLimitOptions([]);
    };

    const handleEditRuleClick = (rule: any) => {
        setEditingRuleId(rule.id);
        try {
            setRuleConditions(rule.conditionsJson || []);
        } catch (e) { setRuleConditions([]); }
        setTargetFieldId(rule.targetFieldId);
        setActionType(rule.actionType);
        try {
            setSelectedLimitOptions(rule.targetOptionsJson || []);
        } catch (e) { setSelectedLimitOptions([]); }

        setShowRuleForm(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleMoveRule = (ruleId: string, direction: "up" | "down") => {
        const index = rules.findIndex(r => r.id === ruleId);
        if (index === -1) return;
        const newRules = [...rules];
        if (direction === "up" && index > 0) {
            const temp = newRules[index];
            newRules[index] = newRules[index - 1];
            newRules[index - 1] = temp;
        } else if (direction === "down" && index < rules.length - 1) {
            const temp = newRules[index];
            newRules[index] = newRules[index + 1];
            newRules[index + 1] = temp;
        }
        setRules(newRules);
    };

    const handleDeleteRule = (id: string) => {
        setRules(rules.filter(r => r.id !== id));
    };


    const tabPanels = [
        // --- FIELDS TAB ---
        {
            id: "fields",
            content: "Custom Fields",
            panelID: "panel-fields",
            render: () => (
                <BlockStack gap="400">
                    <BlockStack gap="200">
                        <Text as="h3" variant="headingMd">
                            Custom Product Fields
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                            Adding fields here will completely disconnect this product from the global "{templateName}" template options. These act as unique building blocks just for this product.
                        </Text>
                        <Card background="bg-surface-secondary">
                            <BlockStack gap="200">
                                <Text as="h4" variant="headingSm">💡 How it works (Example Scenario):</Text>
                                <Text as="p" variant="bodyMd">
                                    Perhaps you sell T-Shirts globally, but <Text as="span" fontWeight="bold">this specific T-Shirt</Text> is limited edition and has a special "Signature" text input field that no other products have.<br /><br />
                                    You can add that "Signature" <Text as="span" fontWeight="bold">Text Input</Text> field here. It will only ever appear for this single product.
                                </Text>
                            </BlockStack>
                        </Card>
                    </BlockStack>

                    {fields.length > 0 ? (
                        <Card>
                            <ResourceList
                                resourceName={{ singular: "field", plural: "fields" }}
                                items={fields}
                                renderItem={(field) => (
                                    <ResourceItem id={field.id} onClick={() => { }}>
                                        <InlineGrid columns="1fr auto" alignItems="center">
                                            <BlockStack gap="100">
                                                <Text as="h3" variant="headingSm">
                                                    {field.label} {field.required && <Text as="span" tone="critical">*</Text>}
                                                </Text>
                                                <Text as="p" tone="subdued">
                                                    Name: {field.name} | Type: {field.type}
                                                </Text>
                                                {Array.isArray(field.optionsJson) && field.optionsJson.length > 0 && (
                                                    <Text as="p" tone="subdued">
                                                        Options: {field.optionsJson.map((opt: string) => {
                                                            const price = field.priceAdjustmentsJson?.[opt];
                                                            return price ? `${opt} (+$${price})` : opt;
                                                        }).join(", ")}
                                                    </Text>
                                                )}
                                            </BlockStack>
                                            <InlineStack gap="200">
                                                <Button onClick={() => handleMoveField(field.id, "up")}>
                                                    ↑
                                                </Button>
                                                <Button onClick={() => handleMoveField(field.id, "down")}>
                                                    ↓
                                                </Button>
                                                <Button onClick={() => handleEditFieldClick(field)}>
                                                    Edit
                                                </Button>
                                                <Button tone="critical" onClick={() => handleDeleteField(field.id)}>
                                                    Remove
                                                </Button>
                                            </InlineStack>
                                        </InlineGrid>
                                    </ResourceItem>
                                )}
                            />
                        </Card>
                    ) : (
                        <Card>
                            <BlockStack align="center" inlineAlign="center">
                                <Text as="p" tone="subdued">No custom fields defined. Click 'Add Field' to start creating your options.</Text>
                            </BlockStack>
                        </Card>
                    )}

                    {showFieldForm && (
                        <Card>
                            <BlockStack gap="400">
                                <Text as="h3" variant="headingMd">{editingFieldId ? "Edit Field" : "New Field"}</Text>

                                <Select
                                    label="Field Type"
                                    options={[
                                        { label: "Text Input", value: "text" },
                                        { label: "Drop-down Select", value: "select" },
                                        { label: "Radio Buttons", value: "radio" },
                                        { label: "Checkboxes", value: "checkbox" },
                                    ]}
                                    value={fieldType}
                                    onChange={setFieldType}
                                />

                                <TextField
                                    label="Internal Name (no spaces, e.g., 'shirt_size')"
                                    value={fieldName}
                                    onChange={setFieldName}
                                    autoComplete="off"
                                />

                                <TextField
                                    label="Display Label (e.g., 'Shirt Size')"
                                    value={fieldLabel}
                                    onChange={setFieldLabel}
                                    autoComplete="off"
                                />

                                <Checkbox
                                    label="Is this field required?"
                                    checked={fieldRequired}
                                    onChange={setFieldRequired}
                                />

                                {["select", "radio", "checkbox"].includes(fieldType) && (
                                    <BlockStack gap="300">
                                        <Text as="h5" variant="headingSm">Options, Pricing & Shopify Variant Sync</Text>
                                        {fieldOptionsList.map((opt, index) => (
                                            <InlineGrid columns="1fr 100px 170px auto" gap="200" key={index} alignItems="center">
                                                <TextField
                                                    labelHidden
                                                    label={`Option ${index + 1}`}
                                                    value={opt.label}
                                                    onChange={(val) => {
                                                        const newList = [...fieldOptionsList];
                                                        newList[index].label = val;
                                                        setFieldOptionsList(newList);
                                                    }}
                                                    placeholder="e.g., Small"
                                                    autoComplete="off"
                                                />
                                                <TextField
                                                    labelHidden
                                                    label={`Price Adjustment ${index + 1}`}
                                                    value={opt.price}
                                                    onChange={(val) => {
                                                        const newList = [...fieldOptionsList];
                                                        newList[index].price = val;
                                                        setFieldOptionsList(newList);
                                                    }}
                                                    prefix="$"
                                                    type="number"
                                                    placeholder="0.00"
                                                    autoComplete="off"
                                                />
                                                <TextField
                                                    labelHidden
                                                    label={`Variant Mapping (Shopify ID)`}
                                                    value={opt.variantMapping}
                                                    onChange={(val) => {
                                                        const newList = [...fieldOptionsList];
                                                        newList[index].variantMapping = val;
                                                        setFieldOptionsList(newList);
                                                    }}
                                                    placeholder="Variant ID (Optional)"
                                                    autoComplete="off"
                                                    connectedRight={
                                                        <Button
                                                            onClick={async () => {
                                                                const selected = await shopify.resourcePicker({
                                                                    type: "product",
                                                                    multiple: false,
                                                                    action: "select",
                                                                });
                                                                if (selected && selected.length > 0 && selected[0].variants && selected[0].variants.length > 0) {
                                                                    // Pick the first variant selected or the default variant
                                                                    let variantIdStr = selected[0].variants[0]?.id; // Output is like 'gid://shopify/ProductVariant/44716211765305'
                                                                    if (variantIdStr) {
                                                                        // Strip gid wrapper
                                                                        const matches = variantIdStr.match(/\d+$/);
                                                                        if (matches) {
                                                                            const newList = [...fieldOptionsList];
                                                                            newList[index].variantMapping = matches[0];
                                                                            setFieldOptionsList(newList);
                                                                        }
                                                                    }
                                                                }
                                                            }}
                                                        >
                                                            Browse
                                                        </Button>
                                                    }
                                                />
                                                <Button
                                                    tone="critical"
                                                    variant="plain"
                                                    accessibilityLabel="Remove option"
                                                    onClick={() => setFieldOptionsList(fieldOptionsList.filter((_, i) => i !== index))}
                                                >
                                                    Remove
                                                </Button>
                                            </InlineGrid>
                                        ))}
                                        <InlineStack>
                                            <Button onClick={() => setFieldOptionsList([...fieldOptionsList, { label: "", price: "", variantMapping: "" }])}>
                                                Add Option
                                            </Button>
                                        </InlineStack>
                                    </BlockStack>
                                )}

                                <InlineStack gap="300">
                                    <Button onClick={resetFieldForm}>Cancel</Button>
                                    <Button variant="primary" onClick={handleAddField}>
                                        {editingFieldId ? "Save Local Field" : "Add Local Field"}
                                    </Button>
                                </InlineStack>
                            </BlockStack>
                        </Card>
                    )}

                    {!showFieldForm && (
                        <Button variant="primary" onClick={() => { resetFieldForm(); setShowFieldForm(true); }}>Add Custom Field</Button>
                    )}
                </BlockStack>
            ),
        },
        // --- RULES TAB ---
        {
            id: "rules",
            content: "Custom Rules",
            panelID: "panel-rules",
            render: () => (
                <BlockStack gap="400">
                    <BlockStack gap="200">
                        <Text as="p" variant="bodyMd" tone="subdued">
                            Custom rules completely override the corresponding template behavior for this specific product. This is ideal if you want to dynamically show, hide, or limit field options for this item specifically based on what the customer selects.
                        </Text>
                        <Card background="bg-surface-secondary">
                            <BlockStack gap="200">
                                <Text as="h4" variant="headingSm">💡 How it works (Example Scenario):</Text>
                                <Text as="p" variant="bodyMd">
                                    Imagine this specific product is a unique "Customizable Watch" that has a special "Band Type" that the global template doesn't know about. You only want the "Band Color" dropdown to appear if they choose a "Leather" band type.<br /><br />
                                    <Text as="span" fontWeight="bold">IF</Text> [Band Type] is "Leather"<br />
                                    <Text as="span" fontWeight="bold">THEN SHOW</Text> [Band Color]
                                </Text>
                            </BlockStack>
                        </Card>
                    </BlockStack>

                    {isClient && (
                        <InlineStack gap="200" align="start">
                            <ButtonGroup>
                                <Button
                                    pressed={ruleBuilderMode === "VISUAL"}
                                    onClick={() => handleRuleBuilderModeChange("VISUAL")}
                                >
                                    Drag & Drop Visual Builder
                                </Button>
                                <Button
                                    pressed={ruleBuilderMode === "TRADITIONAL"}
                                    onClick={() => handleRuleBuilderModeChange("TRADITIONAL")}
                                >
                                    Traditional Logic Builder
                                </Button>
                            </ButtonGroup>
                        </InlineStack>
                    )}

                    {ruleBuilderMode === "TRADITIONAL" ? (
                        <BlockStack gap="400">
                            {rules.length > 0 ? (
                                <Card>
                                    <ResourceList
                                        resourceName={{ singular: "rule", plural: "rules" }}
                                        items={rules}
                                        renderItem={(rule) => {
                                            const targetLabel = fields.find(f => f.id === rule.targetFieldId)?.label || "Unknown Field";

                                            return (
                                                <ResourceItem id={rule.id} onClick={() => { }}>
                                                    <InlineGrid columns="1fr auto" alignItems="center">
                                                        <BlockStack gap="300">

                                                            <BlockStack gap="100">
                                                                {rule.conditionsJson && Array.isArray(rule.conditionsJson) && rule.conditionsJson.map((cond: any, i: number) => {
                                                                    const parentLabel = fields.find(f => f.id === cond.fieldId)?.label || "Unknown Field";
                                                                    return (
                                                                        <Text key={i} as="p" variant="bodyMd">
                                                                            {i === 0 ? <Text as="span" fontWeight="bold">IF </Text> : <Text as="span" fontWeight="bold">AND IF </Text>}
                                                                            <Text as="span" fontWeight="bold">[{parentLabel}] </Text>
                                                                            {cond.operator}
                                                                            <Text as="span" fontWeight="bold"> "{cond.value}"</Text>
                                                                        </Text>
                                                                    );
                                                                })}
                                                            </BlockStack>

                                                            <Divider />

                                                            <Text as="p" variant="bodyMd">
                                                                <Text as="span" fontWeight="bold">THEN </Text>
                                                                {rule.actionType}
                                                                <Text as="span" fontWeight="bold"> [{targetLabel}]</Text>
                                                                {rule.actionType === 'LIMIT_OPTIONS' && rule.targetOptionsJson && (
                                                                    <Text as="span"> allowing only: {rule.targetOptionsJson.join(', ')}</Text>
                                                                )}
                                                            </Text>
                                                        </BlockStack>

                                                        <InlineStack gap="200">
                                                            <Button onClick={() => handleMoveRule(rule.id, "up")}>
                                                                ↑
                                                            </Button>
                                                            <Button onClick={() => handleMoveRule(rule.id, "down")}>
                                                                ↓
                                                            </Button>
                                                            <Button onClick={() => handleEditRuleClick(rule)}>
                                                                Edit
                                                            </Button>
                                                            <Button tone="critical" onClick={() => handleDeleteRule(rule.id)}>Remove</Button>
                                                        </InlineStack>
                                                    </InlineGrid>
                                                </ResourceItem>
                                            );
                                        }}
                                    />
                                </Card>
                            ) : (
                                <Card>
                                    <BlockStack align="center" inlineAlign="center">
                                        <Text as="p" tone="subdued">No custom rules defined.</Text>
                                    </BlockStack>
                                </Card>
                            )}

                            {showRuleForm && (
                                <Card>
                                    <BlockStack gap="500">
                                        <Text as="h3" variant="headingMd">{editingRuleId ? "Edit Custom Logic Rule" : "Build Custom Logic Rule"}</Text>

                                        <BlockStack gap="300">
                                            <Text as="h4" variant="headingSm">If Conditions (AND)</Text>

                                            {ruleConditions.map((cond, index) => (
                                                <Card key={index} background="bg-surface-secondary">
                                                    <BlockStack gap="200">
                                                        <InlineGrid columns={{ xs: 1, md: 3 }} gap="300">
                                                            <Select
                                                                label="Target Field"
                                                                options={fields.map(f => ({ label: f.label, value: f.id }))}
                                                                value={cond.fieldId}
                                                                onChange={(val) => updateCondition(index, "fieldId", val)}
                                                                placeholder="Select field..."
                                                            />
                                                            <Select
                                                                label="Operator"
                                                                options={[
                                                                    { label: 'Equals', value: 'EQUALS' },
                                                                    { label: 'Does Not Equal', value: 'NOT_EQUALS' },
                                                                    { label: 'Contains', value: 'CONTAINS' }
                                                                ]}
                                                                value={cond.operator}
                                                                onChange={(val) => updateCondition(index, "operator", val)}
                                                            />
                                                            <TextField
                                                                label="Value"
                                                                value={cond.value}
                                                                onChange={(val) => updateCondition(index, "value", val)}
                                                                autoComplete="off"
                                                            />
                                                        </InlineGrid>
                                                        <InlineStack align="end">
                                                            <Button size="micro" tone="critical" variant="plain" onClick={() => removeCondition(index)}>Remove Condition</Button>
                                                        </InlineStack>
                                                    </BlockStack>
                                                </Card>
                                            ))}

                                            <InlineStack>
                                                <Button icon={undefined} onClick={addBlankCondition}>+ Add Condition</Button>
                                            </InlineStack>
                                        </BlockStack>

                                        <Divider />

                                        <BlockStack gap="300">
                                            <Text as="h4" variant="headingSm">Then Action</Text>

                                            <InlineGrid columns={{ xs: 1, md: 2 }} gap="300">
                                                <Select
                                                    label="Action Type"
                                                    options={[
                                                        { label: 'Show Field', value: 'SHOW' },
                                                        { label: 'Hide Field', value: 'HIDE' },
                                                        { label: 'Limit Options', value: 'LIMIT_OPTIONS' }
                                                    ]}
                                                    value={actionType}
                                                    onChange={setActionType}
                                                />
                                                <Select
                                                    label="Target Field"
                                                    options={fields.map(f => ({ label: f.label, value: f.id }))}
                                                    value={targetFieldId}
                                                    onChange={setTargetFieldId}
                                                    placeholder="Select field to modify..."
                                                />
                                            </InlineGrid>

                                            {actionType === "LIMIT_OPTIONS" && targetFieldObj && (
                                                <Card background="bg-surface-secondary">
                                                    <BlockStack gap="200">
                                                        <Text as="p" variant="headingSm">Select Allowed Options</Text>
                                                        {targetFieldObj.optionsJson && Array.isArray(targetFieldObj.optionsJson) ? (
                                                            <BlockStack gap="100">
                                                                {targetFieldObj.optionsJson.map((opt: string) => (
                                                                    <Checkbox
                                                                        key={opt}
                                                                        label={opt}
                                                                        checked={selectedLimitOptions.includes(opt)}
                                                                        onChange={(checked) => {
                                                                            if (checked) {
                                                                                setSelectedLimitOptions([...selectedLimitOptions, opt]);
                                                                            } else {
                                                                                setSelectedLimitOptions(selectedLimitOptions.filter(o => o !== opt));
                                                                            }
                                                                        }}
                                                                    />
                                                                ))}
                                                            </BlockStack>
                                                        ) : (
                                                            <Text as="p" tone="subdued">Target field must be a Select, Checkbox, or Radio with options defined to use Limit Options.</Text>
                                                        )}
                                                    </BlockStack>
                                                </Card>
                                            )}
                                        </BlockStack>

                                        <InlineStack gap="300">
                                            <Button onClick={resetRuleForm}>Cancel</Button>
                                            <Button variant="primary" onClick={handleAddRule} disabled={ruleConditions.length === 0 || !targetFieldId}>
                                                {editingRuleId ? "Save Local Rule" : "Add Local Rule"}
                                            </Button>
                                        </InlineStack>
                                    </BlockStack>
                                </Card>
                            )}

                            {!showRuleForm && (
                                <Button variant="primary" onClick={() => { resetRuleForm(); setShowRuleForm(true); }}>Add Custom Rule</Button>
                            )}
                        </BlockStack>
                    ) : (
                        <Card background="bg-surface-secondary">
                            <VisualRuleBuilder
                                fields={fields}
                                rules={rules}
                                onSaveRules={(newRules: any) => {
                                    const nonShowRules = rules.filter(r => r.actionType !== "SHOW");
                                    const newShowRules = newRules.map((r: any) => ({ ...r, id: Math.random().toString(36).substr(2, 9) }));
                                    setRules([...nonShowRules, ...newShowRules]);
                                }}
                            />
                        </Card>
                    )}
                </BlockStack>
            ),
        }
    ];

    return (
        <Page
            title={`Customize Overrides: ${productTitle}`}
            backAction={{ content: "Products", url: `/app/templates/${templateId}/products` }}
            primaryAction={{
                content: "Save Overrides",
                onAction: handleSaveOverrides
            }}
        >
            <Layout>
                <Layout.Section>

                    {hasOverrides ? (
                        <Banner tone="info" title="Product Overrides Active">
                            <p>This product relies on its own custom setup. Any changes made to the global "{templateName}" template will NOT affect this product.</p>
                            <br />
                            <Button onClick={handleClearOverrides} tone="critical">Revert to Global Template Options</Button>
                        </Banner>
                    ) : (
                        <Banner tone="warning" title="Global Template Active">
                            <p>This product is currently inheriting all global fields and rules from the "{templateName}" template. Saving any custom changes below will disconnect it from global updates.</p>
                        </Banner>
                    )}

                    <div style={{ marginTop: "1rem" }}>
                        <Card padding="0">
                            <Tabs
                                tabs={tabPanels}
                                selected={selectedTab}
                                onSelect={setSelectedTab}
                            >
                                <div style={{ padding: "16px" }}>
                                    {tabPanels[selectedTab].render()}
                                </div>
                            </Tabs>
                        </Card>
                    </div>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
