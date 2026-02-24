import {
  json,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useSubmit, Form, Link, useSearchParams } from "@remix-run/react";
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
  Thumbnail,
  ButtonGroup
} from "@shopify/polaris";
import { prisma } from "../db.server";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";
import { VisualRuleBuilder } from "../components/VisualRuleBuilder";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DragHandleIcon } from "@shopify/polaris-icons";
import { Icon } from "@shopify/polaris";

// Sub-component for Draggable Field Items
function SortableFieldListItem({ field, handleEditFieldClick, handleDeleteField }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    marginBottom: "12px",
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card>
        <InlineStack align="space-between" blockAlign="center">
          <InlineStack gap="300" blockAlign="center">
            <div {...attributes} {...listeners} style={{ cursor: 'grab', touchAction: 'none' }}>
              <Icon source={DragHandleIcon} tone="subdued" />
            </div>
            <BlockStack gap="100">
              <Text as="h4" variant="bodyMd" fontWeight="semibold">
                {field.name}
                {field.required && (
                  <Text as="span" tone="critical"> *</Text>
                )}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Type: {field.type} | Label: {field.label}
              </Text>
              {field.optionsJson && (
                <Text as="p" variant="bodySm">
                  Options: {field.optionsJson.map((opt: string) => {
                    const price = field.priceAdjustmentsJson?.[opt];
                    return price ? `${opt} (+$${price})` : opt;
                  }).join(", ")}
                </Text>
              )}
            </BlockStack>
          </InlineStack>
          <InlineStack gap="200">
            <Button onClick={() => handleEditFieldClick(field)}>Edit</Button>
            <Button onClick={() => handleDeleteField(field.id)} tone="critical">Delete</Button>
          </InlineStack>
        </InlineStack>
      </Card>
    </div>
  );
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  try {
    const { session, admin } = await authenticate.admin(request);
    if (!session) return redirect("/auth/login");

    const templateId = params.id as string;
    if (!templateId) return redirect("/app");

    const template = await prisma.template.findFirst({
      where: { id: templateId, shop: session.shop },
      include: {
        fields: { orderBy: { sort: "asc" } },
        rules: { orderBy: { sort: "asc" } },
        links: { select: { productGid: true } }, // Changed to select productGid only
      },
    });

    if (!template) throw new Response("Template not found", { status: 404 });

    // Fetch product details for linked products
    const linkedProductGids = template.links.map(link => link.productGid);
    let linkedProductsData: any[] = [];

    if (linkedProductGids.length > 0) {
      // Create a query aliases string for each product to fetch them in a single batch
      const queryAliases = linkedProductGids.map((gid, index) => `
        product${index}: product(id: "${gid}") {
          id
          title
          featuredImage { url altText }
        }
      `).join('\n');

      const PRODUCTS_QUERY = `query { ${queryAliases} }`;

      const response = await admin.graphql(PRODUCTS_QUERY);
      const responseJson = await response.json();

      if (!(responseJson as any).errors && responseJson.data) {
        // Extract the products from the aliased query response
        linkedProductsData = Object.values(responseJson.data).filter(Boolean);
      }
    }

    const datasets = await prisma.dataset.findMany({
      where: { shop: session.shop },
      orderBy: { name: "asc" },
    });

    return json({
      template,
      linkedProductsData, // Keep this from original loader
      datasets,
    });
  } catch (error) {
    console.error("Loader Error:", error);
    throw new Response("Unexpected Server Error", { status: 500 });
  }
};

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  if (!session) return redirect("/auth/login");

  const templateId = params.id!;
  if (!templateId) return redirect("/app");

  const form = await request.formData();
  const intent = String(form.get("_intent"));

  if (intent === "updateAppearance") {
    const fontFamily = String(form.get("fontFamily") || "");
    const fontSize = String(form.get("fontSize") || "");
    const fontWeight = String(form.get("fontWeight") || "");
    const textColor = String(form.get("textColor") || "");
    const backgroundColor = String(form.get("backgroundColor") || "");
    const borderColor = String(form.get("borderColor") || "");
    const borderRadius = String(form.get("borderRadius") || "");
    const padding = String(form.get("padding") || "");
    const hoverBackgroundColor = String(form.get("hoverBackgroundColor") || "");
    const hoverTextColor = String(form.get("hoverTextColor") || "");

    await prisma.template.update({
      where: { id: templateId },
      data: {
        fontFamily,
        fontSize,
        fontWeight,
        textColor,
        backgroundColor,
        borderColor,
        borderRadius,
        padding,
        hoverBackgroundColor,
        hoverTextColor,
      },
    });
    return json({ success: true });
  }

  // Update template name
  if (intent === "updateName") {
    const name = String(form.get("templateName") || "").trim();
    if (!name) return json({ error: "Name required" }, { status: 400 });

    await prisma.template.update({
      where: { id: templateId },
      data: { name },
    });

    return json({ success: true });
  }

  // Add or Edit field
  if (intent === "addField" || intent === "editField") {
    const type = String(form.get("fieldType") || "");
    const name = String(form.get("fieldName") || "").trim();
    const label = String(form.get("fieldLabel") || "").trim();
    const required = form.get("fieldRequired") === "true";
    const optionsDataStr = String(form.get("optionsData") || "");

    if (!type || !name || !label) {
      return json({ error: "All fields required" }, { status: 400 });
    }

    // Parse options and prices for select/radio/checkbox
    let optionsJson: any = null;
    let priceAdjustmentsJson: any = null;
    let variantMappingJson: any = null;

    if (["select", "radio", "checkbox"].includes(type) && optionsDataStr) {
      try {
        const parsedOptions = JSON.parse(optionsDataStr);
        if (Array.isArray(parsedOptions) && parsedOptions.length > 0) {
          optionsJson = parsedOptions.map(o => o.label.trim()).filter(Boolean);

          const priceMap: Record<string, number> = {};
          const mappingMap: Record<string, string> = {};
          let hasPrices = false;
          let hasMappings = false;

          parsedOptions.forEach(o => {
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
      } catch (e) {
        console.error("Failed to parse optionsData", e);
      }
    }

    // Get max sort order if new
    let sortOrder = 0;
    if (intent === "addField") {
      const maxSort = await prisma.field.findFirst({
        where: { templateId },
        orderBy: { sort: "desc" },
        select: { sort: true },
      });
      sortOrder = (maxSort?.sort || 0) + 1;
    }

    if (intent === "editField") {
      const fieldId = String(form.get("fieldId") || "");
      if (!fieldId) return json({ error: "Field ID required for edit" }, { status: 400 });

      await prisma.field.update({
        where: { id: fieldId },
        data: {
          type,
          name,
          label,
          required,
          optionsJson: optionsJson as any,
          priceAdjustmentsJson: priceAdjustmentsJson as any,
          variantMappingJson: variantMappingJson as any
        }
      });
    } else {
      await prisma.field.create({
        data: {
          templateId,
          type,
          name,
          label,
          required,
          optionsJson: optionsJson as any,
          priceAdjustmentsJson: priceAdjustmentsJson as any,
          variantMappingJson: variantMappingJson as any,
          sort: sortOrder,
        },
      });
    }

    return json({ success: true });
  }

  // Delete field
  if (intent === "deleteField") {
    const fieldId = String(form.get("fieldId") || "");
    await prisma.field.delete({ where: { id: fieldId } });
    return json({ success: true });
  }

  // Add or Edit rule
  if (intent === "addRule" || intent === "editRule") {
    const conditionsStr = String(form.get("conditionsJson") || "[]");
    let targetFieldId = String(form.get("targetFieldId") || "");
    const actionType = String(form.get("actionType") || "SHOW");
    const targetOptionsStr = String(form.get("targetOptionsJson") || "null");
    const targetPriceAdjustmentsStr = String(form.get("targetPriceAdjustmentsJson") || "null");

    let conditionsJson: any[] = [];
    try {
      conditionsJson = JSON.parse(conditionsStr);
    } catch (e) { }

    let targetOptionsJson = null;
    try {
      if (targetOptionsStr !== "null" && targetOptionsStr !== "") {
        targetOptionsJson = JSON.parse(targetOptionsStr);
      }
    } catch (e) { }

    let targetPriceAdjustmentsJson = null;
    try {
      if (targetPriceAdjustmentsStr !== "null" && targetPriceAdjustmentsStr !== "") {
        targetPriceAdjustmentsJson = JSON.parse(targetPriceAdjustmentsStr);
      }
    } catch (e) { }

    // Intercept local fields sent alongside traditional rule save
    const newFieldsStr = String(form.get("newFieldsJson") || "[]");
    let newFieldsData: any[] = [];
    try { newFieldsData = JSON.parse(newFieldsStr); } catch (e) { }

    if (newFieldsData.length > 0) {
      const idMap: Record<string, string> = {};
      for (const nf of newFieldsData) {
        const created = await prisma.field.create({
          data: {
            templateId,
            type: nf.type,
            name: nf.name,
            label: nf.label,
            optionsJson: nf.optionsJson,
            required: nf.required || false,
            sort: 999
          }
        });
        idMap[nf.id] = created.id;
      }

      if (idMap[targetFieldId]) {
        targetFieldId = idMap[targetFieldId];
      }
      conditionsJson = conditionsJson.map((c: any) => ({
        ...c,
        fieldId: idMap[c.fieldId] || c.fieldId
      }));
    }

    if (!conditionsJson.length || !targetFieldId) {
      return json({ error: "Conditions and Target Field required" }, { status: 400 });
    }

    if (intent === "editRule") {
      const ruleId = String(form.get("ruleId") || "");
      if (!ruleId) return json({ error: "Rule ID required for edit" }, { status: 400 });

      await prisma.rule.update({
        where: { id: ruleId },
        data: {
          conditionsJson: conditionsJson as any,
          targetFieldId,
          actionType,
          targetOptionsJson: targetOptionsJson as any,
          targetPriceAdjustmentsJson: targetPriceAdjustmentsJson as any,
        }
      });
    } else {
      const maxSort = await prisma.rule.findFirst({
        where: { templateId },
        orderBy: { sort: "desc" },
        select: { sort: true },
      });

      await prisma.rule.create({
        data: {
          templateId,
          conditionsJson: conditionsJson as any,
          targetFieldId,
          actionType,
          targetOptionsJson: targetOptionsJson as any,
          targetPriceAdjustmentsJson: targetPriceAdjustmentsJson as any,
          sort: (maxSort?.sort || 0) + 1,
        },
      });
    }

    return json({ success: true });
  }

  // Bulk save rules (for VisualRuleBuilder)
  if (intent === "bulkSaveRules") {
    const rulesJsonStr = String(form.get("rulesJson") || "[]");
    const newFieldsStr = String(form.get("newFieldsJson") || "[]");
    let newRulesData: any[] = [];
    let newFieldsData: any[] = [];
    try {
      newRulesData = JSON.parse(rulesJsonStr);
      newFieldsData = JSON.parse(newFieldsStr);
    } catch (e) {
      console.error("Failed to parse data for bulkSaveRules", e);
      return json({ error: "Invalid syntax payload" }, { status: 400 });
    }

    // Create any new fields submitted and record their true ID mappings
    const idMap: Record<string, string> = {};
    for (const nf of newFieldsData) {
      if (!nf.name) continue; // Safety check
      let safeOptionsJson = nf.optionsJson;
      if (!safeOptionsJson) safeOptionsJson = [];
      else if (typeof safeOptionsJson === 'string') {
        try { safeOptionsJson = JSON.parse(safeOptionsJson); } catch (e) { safeOptionsJson = []; }
      }

      const created = await prisma.field.create({
        data: {
          templateId,
          type: nf.type || "select",
          name: nf.name,
          label: nf.label || nf.name,
          optionsJson: safeOptionsJson,
          required: nf.required || false,
          sort: 999
        }
      });
      idMap[nf.id] = created.id;
    }

    const mapId = (id: string) => idMap[id] || id;

    // Delete existing rules for this template
    await prisma.rule.deleteMany({
      where: { templateId },
    });

    // Create new rules, mapping any custom fields injected during the session
    const rulesToCreate = newRulesData.map((rule, index) => {
      let conds = rule.conditionsJson;
      try {
        if (typeof conds === 'string') conds = JSON.parse(conds);
        if (Array.isArray(conds)) {
          conds = conds.map((c: any) => ({ ...c, fieldId: mapId(c.fieldId) }));
        }
      } catch (e) { }

      let targetOpts = rule.targetOptionsJson;
      try {
        if (typeof targetOpts === 'string') targetOpts = JSON.parse(targetOpts);
      } catch (e) { }

      return {
        templateId,
        conditionsJson: conds && Array.isArray(conds) ? conds : [],
        targetFieldId: mapId(rule.targetFieldId || ""),
        actionType: rule.actionType || "SHOW",
        targetOptionsJson: targetOpts || null, // Optional Json? fields translate properly when null from client? No, safer to omit or use string "null" if we can't use Prisma.DbNull, but passing JSON string or object handles it.
        sort: index + 1, // Maintain order
      };
    });

    await prisma.rule.createMany({
      data: rulesToCreate,
    });

    return json({ success: true });
  }

  // Delete rule
  if (intent === "deleteRule") {
    const ruleId = String(form.get("ruleId") || "");
    await prisma.rule.delete({ where: { id: ruleId } });
    return json({ success: true });
  }

  // Reorder field
  if (intent === "reorderField") {
    const fieldId = String(form.get("fieldId") || "");
    const direction = form.get("direction") === "up" ? -1 : 1;

    // Get all fields for this template ordered by sort
    const fields = await prisma.field.findMany({
      where: { templateId },
      orderBy: { sort: 'asc' }
    });

    const currentIndex = fields.findIndex(f => f.id === fieldId);
    if (currentIndex === -1) return json({ error: "Field not found" }, { status: 404 });
    const targetIndex = currentIndex + direction;

    if (targetIndex >= 0 && targetIndex < fields.length) {
      const targetField = fields[targetIndex];
      const currentField = fields[currentIndex];

      // Swap their sorts
      await prisma.$transaction([
        prisma.field.update({ where: { id: currentField.id }, data: { sort: targetField.sort } }),
        prisma.field.update({ where: { id: targetField.id }, data: { sort: currentField.sort } })
      ]);
    }
    return json({ success: true });
  }

  // Bulk reorder fields via drag and drop
  if (intent === "bulkReorderFields") {
    const sortedIdsStr = String(form.get("sortedIds") || "[]");
    let sortedIds: string[] = [];
    try { sortedIds = JSON.parse(sortedIdsStr); } catch (e) { }

    if (sortedIds.length > 0) {
      await prisma.$transaction(
        sortedIds.map((id, index) =>
          prisma.field.update({ where: { id }, data: { sort: index } })
        )
      );
    }
    return json({ success: true });
  }

  // Reorder rule
  if (intent === "reorderRule") {
    const ruleId = String(form.get("ruleId") || "");
    const direction = form.get("direction") === "up" ? -1 : 1;

    const rules = await prisma.rule.findMany({
      where: { templateId },
      orderBy: { sort: 'asc' }
    });

    const currentIndex = rules.findIndex(r => r.id === ruleId);
    if (currentIndex === -1) return json({ error: "Rule not found" }, { status: 404 });
    const targetIndex = currentIndex + direction;

    if (targetIndex >= 0 && targetIndex < rules.length) {
      const targetRule = rules[targetIndex];
      const currentRule = rules[currentIndex];

      // Swap their sorts
      await prisma.$transaction([
        prisma.rule.update({ where: { id: currentRule.id }, data: { sort: targetRule.sort } }),
        prisma.rule.update({ where: { id: targetRule.id }, data: { sort: currentRule.sort } })
      ]);
    }
    return json({ success: true });
  }

  // Unlink product
  if (intent === "unlinkProduct") {
    const productGid = String(form.get("productGid") || "");
    await prisma.productTemplateLink.deleteMany({
      where: { templateId, productGid }
    });
    return json({ success: true });
  }

  // Delete template
  if (intent === "deleteTemplate") {
    await prisma.template.delete({ where: { id: templateId } });
    return redirect("/app");
  }

  return null;
}

export default function TemplateDetail() {
  const { template, linkedProductsData, datasets } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "products" ? 1 : 0;
  const [selectedTab, setSelectedTab] = useState(initialTab);

  // Name state
  const [templateName, setTemplateName] = useState(template.name);

  // Field form state
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldType, setFieldType] = useState("select");
  const [fieldName, setFieldName] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOptionsList, setFieldOptionsList] = useState<Array<{ label: string, price: string, variantMapping: string }>>([]);

  useEffect(() => {
    setTemplateName(template.name);
  }, [template.name]);

  // Appearance state
  const [fontFamily, setFontFamily] = useState((template as any).fontFamily || "");
  const [fontSize, setFontSize] = useState((template as any).fontSize || "");
  const [fontWeight, setFontWeight] = useState((template as any).fontWeight || "");
  const [textColor, setTextColor] = useState((template as any).textColor || "");
  const [backgroundColor, setBackgroundColor] = useState(
    (template as any).backgroundColor || "",
  );
  const [borderColor, setBorderColor] = useState((template as any).borderColor || "");
  const [borderRadius, setBorderRadius] = useState((template as any).borderRadius || "");
  const [padding, setPadding] = useState((template as any).padding || "");
  const [hoverBackgroundColor, setHoverBackgroundColor] = useState(
    (template as any).hoverBackgroundColor || "",
  );
  const [hoverTextColor, setHoverTextColor] = useState(
    (template as any).hoverTextColor || "",
  );
  const [isHover, setIsHover] = useState(false);

  // Rules form state
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleConditions, setRuleConditions] = useState<Array<{ fieldId: string, operator: string, value: string }>>([]);
  const [tempCondFieldId, setTempCondFieldId] = useState("");
  const [tempCondOperator, setTempCondOperator] = useState("EQUALS");
  const [tempCondValue, setTempCondValue] = useState("");
  const [ruleTargetFieldId, setRuleTargetFieldId] = useState("");
  const [ruleActionType, setRuleActionType] = useState("SHOW");
  const [ruleTargetOptions, setRuleTargetOptions] = useState<string[]>([]);
  const [tempTargetOption, setTempTargetOption] = useState("");
  const [ruleTargetPriceAdjustments, setRuleTargetPriceAdjustments] = useState<Record<string, string>>({});

  // Handlers
  const [ruleBuilderMode, setRuleBuilderMode] = useState<"TRADITIONAL" | "VISUAL">("VISUAL");
  const [isClient, setIsClient] = useState(false);
  const [localFields, setLocalFields] = useState<any[]>([]);

  useEffect(() => {
    setIsClient(true);
    const storedMode = localStorage.getItem("variantIqRuleBuilderMode");
    if (storedMode === "VISUAL" || storedMode === "TRADITIONAL") {
      setRuleBuilderMode(storedMode);
    } else {
      localStorage.setItem("variantIqRuleBuilderMode", "VISUAL");
    }
  }, []);

  const handleRuleBuilderModeChange = (mode: "TRADITIONAL" | "VISUAL") => {
    setRuleBuilderMode(mode);
    localStorage.setItem("variantIqRuleBuilderMode", mode);
  };

  const handleAddCondition = () => {
    if (tempCondFieldId && tempCondValue) {
      setRuleConditions([...ruleConditions, { fieldId: tempCondFieldId, operator: tempCondOperator, value: tempCondValue }]);
      setTempCondFieldId("");
      setTempCondValue("");
    }
  };

  const handleRemoveCondition = (index: number) => {
    setRuleConditions(ruleConditions.filter((_, i) => i !== index));
  };

  const handleAddTargetOption = () => {
    if (tempTargetOption && !ruleTargetOptions.includes(tempTargetOption)) {
      setRuleTargetOptions([...ruleTargetOptions, tempTargetOption]);
      setTempTargetOption("");
    }
  };

  const handleRemoveTargetOption = (option: string) => {
    setRuleTargetOptions(ruleTargetOptions.filter((o) => o !== option));
  };

  const handleSaveRule = () => {
    submit({
      _intent: editingRuleId ? "editRule" : "addRule",
      ...(editingRuleId ? { ruleId: editingRuleId } : {}),
      conditionsJson: JSON.stringify(ruleConditions),
      targetFieldId: ruleTargetFieldId,
      actionType: ruleActionType,
      targetOptionsJson: ruleActionType === "LIMIT_OPTIONS"
        ? JSON.stringify(ruleTargetOptions)
        : ruleActionType === "LIMIT_OPTIONS_DATASET"
          ? JSON.stringify({ datasetId: tempTargetOption })
          : "null",
      targetPriceAdjustmentsJson: ruleActionType === "SET_PRICE" ? JSON.stringify(ruleTargetPriceAdjustments) : "null",
      newFieldsJson: JSON.stringify(localFields)
    }, { method: "post" });

    setLocalFields([]); // flush custom fields after pushing
    resetRuleForm();
  };

  const resetRuleForm = () => {
    setShowRuleForm(false);
    setEditingRuleId(null);
    setRuleConditions([]);
    setRuleTargetFieldId("");
    setRuleActionType("SHOW");
    setRuleTargetOptions([]);
    setRuleTargetPriceAdjustments({});
  };

  const handleEditRuleClick = (rule: any) => {
    setEditingRuleId(rule.id);
    try {
      setRuleConditions(rule.conditionsJson as any || []);
    } catch (e) { setRuleConditions([]); }
    setRuleTargetFieldId(rule.targetFieldId);
    setRuleActionType(rule.actionType);
    try {
      if (rule.actionType === "LIMIT_OPTIONS_DATASET") {
        const parsed = typeof rule.targetOptionsJson === 'string' ? JSON.parse(rule.targetOptionsJson) : rule.targetOptionsJson;
        setTempTargetOption(parsed?.datasetId || "");
        setRuleTargetOptions([]);
      } else {
        setRuleTargetOptions(rule.targetOptionsJson as string[] || []);
      }
    } catch (e) { setRuleTargetOptions([]); }
    try {
      setRuleTargetPriceAdjustments(rule.targetPriceAdjustmentsJson as Record<string, string> || {});
    } catch (e) { setRuleTargetPriceAdjustments({}); }

    setShowRuleForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteRule = (ruleId: string) => {
    if (confirm("Delete this rule?")) {
      submit({ _intent: "deleteRule", ruleId }, { method: "post" });
    }
  };

  const handleDragEndFields = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = template.fields.findIndex((f: any) => f.id === active.id);
      const newIndex = template.fields.findIndex((f: any) => f.id === over.id);

      const newFields = [...template.fields];
      const [movedItem] = newFields.splice(oldIndex, 1);
      newFields.splice(newIndex, 0, movedItem);

      const sortedIds = newFields.map((f: any) => f.id);
      submit({ _intent: "bulkReorderFields", sortedIds: JSON.stringify(sortedIds) }, { method: "post" });
    }
  };

  const handleMoveRule = (ruleId: string, direction: "up" | "down") => {
    submit({ _intent: "reorderRule", ruleId, direction }, { method: "post" });
  };

  const handleSaveAppearance = () => {
    submit(
      {
        _intent: "updateAppearance",
        fontFamily,
        fontSize,
        fontWeight,
        textColor,
        backgroundColor,
        borderColor,
        borderRadius,
        padding,
        hoverBackgroundColor,
        hoverTextColor,
      },
      { method: "post" },
    );
  };

  const resetFieldForm = () => {
    setShowFieldForm(false);
    setEditingFieldId(null);
    setFieldType("select");
    setFieldName("");
    setFieldLabel("");
    setFieldRequired(false);
    setFieldOptionsList([]);
  };

  const handleAddFieldClick = () => {
    resetFieldForm();
    setShowFieldForm(true);
  };

  const handleEditFieldClick = (field: any) => {
    setEditingFieldId(field.id);
    setFieldType(field.type);
    setFieldName(field.name);
    setFieldLabel(field.label);
    setFieldRequired(field.required);

    // Map existing JSON options and pricing back to UI state
    const initialOptions = field.optionsJson
      ? field.optionsJson.map((opt: string) => ({
        label: opt,
        price: field.priceAdjustmentsJson?.[opt] ? String(field.priceAdjustmentsJson[opt]) : "",
        variantMapping: field.variantMappingJson?.[opt] ? String(field.variantMappingJson[opt]) : ""
      }))
      : [];
    setFieldOptionsList(initialOptions);

    setShowFieldForm(true);
    // Scroll to top where form is
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSaveField = () => {
    submit(
      {
        _intent: editingFieldId ? "editField" : "addField",
        ...(editingFieldId ? { fieldId: editingFieldId } : {}),
        fieldType,
        fieldName,
        fieldLabel,
        fieldRequired: String(fieldRequired),
        optionsData: JSON.stringify(fieldOptionsList.filter(o => o.label.trim() !== "")),
      },
      { method: "post" },
    );

    resetFieldForm();
  };

  const handleDeleteField = (fieldId: string) => {
    if (confirm("Delete this field? This cannot be undone.")) {
      submit({ _intent: "deleteField", fieldId }, { method: "post" });
    }
  };

  const handleDeleteTemplate = () => {
    if (
      confirm(
        `Delete "${template.name}"? This will remove all fields, rules, and product links.`
      )
    ) {
      submit({ _intent: "deleteTemplate" }, { method: "post" });
    }
  };

  const fieldTypeOptions = [
    { label: "Text Input", value: "text" },
    { label: "Dropdown", value: "select" },
    { label: "Radio Buttons", value: "radio" },
    { label: "Checkboxes", value: "checkbox" },
  ];

  const getFieldName = (id: string) => template.fields.find(f => f.id === id)?.name || id;

  // Views
  const FieldsView = (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <InlineGrid columns="1fr auto">
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Template Fields (Product Options)
              </Text>
              <Text as="p">
                Define the customizable options customers will see on the product page. These fields act as the building blocks for your product variations.
              </Text>
              <Card background="bg-surface-secondary">
                <BlockStack gap="200">
                  <Text as="h4" variant="headingSm">💡 How it works (Example):</Text>
                  <Text as="p" variant="bodyMd">
                    If you are selling a configurable PC, you might add the following fields:<br />
                    • A <Text as="span" fontWeight="bold">Drop-down Select</Text> labeled "Processor" with options: i5, i7, i9<br />
                    • A <Text as="span" fontWeight="bold">Radio Button</Text> labeled "RAM" with options: 16GB, 32GB<br />
                    • A <Text as="span" fontWeight="bold">Text Input</Text> labeled "Custom Engraving"<br />
                    <br />
                    Once created, you can use the <Text as="span" fontWeight="bold">Rules</Text> tab to link these fields together (e.g., hide the Engraving text input unless they check a "Gift" checkbox).
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
            {!showFieldForm && (
              <Button onClick={handleAddFieldClick}>Add Field</Button>
            )}
          </InlineGrid>

          {showFieldForm && (
            <Card background="bg-surface-secondary">
              <BlockStack gap="400">
                <Text as="h4" variant="headingSm">
                  {editingFieldId ? "Edit Field" : "New Field"}
                </Text>

                <Select
                  label="Field Type"
                  options={fieldTypeOptions}
                  value={fieldType}
                  onChange={setFieldType}
                />

                <TextField
                  label="Field Name (internal)"
                  value={fieldName}
                  onChange={setFieldName}
                  placeholder="e.g., shirt_size"
                  helpText="Used for API/data, no spaces"
                  autoComplete="off"
                />

                <TextField
                  label="Field Label (customer-facing)"
                  value={fieldLabel}
                  onChange={setFieldLabel}
                  placeholder="e.g., Shirt Size"
                  autoComplete="off"
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

                <Checkbox
                  label="Required field"
                  checked={fieldRequired}
                  onChange={setFieldRequired}
                />

                <InlineGrid columns={2} gap="200">
                  <Button onClick={resetFieldForm}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSaveField}
                    disabled={!fieldName || !fieldLabel}
                  >
                    {editingFieldId ? "Save Field" : "Add Field"}
                  </Button>
                </InlineGrid>
              </BlockStack>
            </Card>
          )}
        </BlockStack>
      </Card>

      {template.fields.length === 0 ? (
        <Card>
          <Text as="p" tone="subdued">
            No fields yet. Add your first field to get started.
          </Text>
        </Card>
      ) : (
        <Card>
          <DndContext
            sensors={useSensors(
              useSensor(PointerSensor),
              useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
            )}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEndFields}
          >
            <SortableContext items={template.fields.map((f: any) => f.id)} strategy={verticalListSortingStrategy}>
              <BlockStack gap="200">
                {template.fields.map((field: any) => (
                  <SortableFieldListItem
                    key={field.id}
                    field={field}
                    handleEditFieldClick={handleEditFieldClick}
                    handleDeleteField={handleDeleteField}
                  />
                ))}
              </BlockStack>
            </SortableContext>
          </DndContext>
        </Card>
      )}
    </BlockStack>
  );

  const ProductsView = (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <InlineGrid columns="1fr auto" gap="400" alignItems="start">
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Linked Products
              </Text>
              <Text as="p">
                Select which Shopify products should display this template's custom options.
                Any updates you make to this template will instantly reflect on all linked products.
              </Text>
              <Card background="bg-surface-secondary">
                <BlockStack gap="200">
                  <Text as="h4" variant="headingSm">💡 Managing Links:</Text>
                  <Text as="p" variant="bodyMd">
                    Click <strong>Manage Product Links</strong> to open a product picker. You can select multiple items at once.
                    If a product has special requirements (e.g., this specific shirt needs an extra '$5 XXL' upcharge not present in the master template), you can assign product-specific overrides directly from the linked products list!
                  </Text>
                </BlockStack>
              </Card>
              <Text as="p" fontWeight="bold">
                {template.links.length} product(s) using this template
              </Text>
            </BlockStack>
            <Link to={`/app/templates/${template.id}/products`} style={{ textDecoration: 'none' }}>
              <Button variant="primary">Manage Product Links</Button>
            </Link>
          </InlineGrid>
        </BlockStack>
      </Card>

      {linkedProductsData && linkedProductsData.length > 0 && (
        <Card>
          <ResourceList
            resourceName={{ singular: "product", plural: "products" }}
            items={linkedProductsData}
            renderItem={(product: any) => {
              const numericProductId = product.id.split('/').pop();
              const media = (
                <Thumbnail
                  source={
                    product.featuredImage?.url ||
                    "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png?format=webp&v=1530129081"
                  }
                  alt={product.featuredImage?.altText || product.title}
                />
              );

              return (
                <ResourceItem id={product.id} media={media} onClick={() => { }}>
                  <InlineStack align="space-between" blockAlign="center">
                    <Text variant="bodyMd" fontWeight="bold" as="h3">
                      {product.title}
                    </Text>
                    <Form method="post">
                      <input type="hidden" name="_intent" value="unlinkProduct" />
                      <input type="hidden" name="productGid" value={product.id} />
                      <Button submit tone="critical">
                        Unlink
                      </Button>
                    </Form>
                  </InlineStack>
                </ResourceItem>
              );
            }}
          />
        </Card>
      )}
    </BlockStack>
  );

  const RulesView = (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <InlineGrid columns="1fr auto">
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Cascading Rules Architecture
              </Text>
              <Text as="p">
                Easily dictate exactly when specific product fields should be shown based on what the customer has already selected using the Visual Rule Tree.
              </Text>
              <Card background="bg-surface-secondary">
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    <Text as="strong">Step 1 (The Root Canvas):</Text><br />
                    Fields that exist directly on the <Text as="strong">Root Canvas</Text> will be unconditionally visible to every customer on this product. By default, newly created fields start here until you assign them elsewhere.
                  </Text>

                  <Divider />

                  <Text as="p" variant="bodyMd">
                    <Text as="strong">Step 2 (Nesting Dependencies):</Text><br />
                    If you have an "Apparel Type" field with the options "Shirt" and "Pants", two sub-branches will appear beneath the Apparel Type field.<br />
                    By using the dropdown to assign a "Shirt Size" field directly into the "↳ If chosen: Shirt" nested zone, the system automatically builds the cascade so that the Shirt Size dropdown ONLY appears when "Shirt" is chosen!
                  </Text>

                  <Divider />

                  <Text as="p" variant="bodyMd">
                    <Text as="strong">Step 3 (Limiting Options to Datasets):</Text><br />
                    When nesting drop-down fields in the visual builder, you can attach a <Text as="strong">Global Dataset</Text> constraint using the select box next to the field name. This lets you say "If Shirt is selected, show the Colors field, but LIMIT the choices to the 'Shirt Colors' dataset." You can automatically generate dataset fields directly from the Visual Tree dropdowns!
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
            {!showRuleForm && ruleBuilderMode === "TRADITIONAL" && (
              <Button onClick={() => { resetRuleForm(); setShowRuleForm(true); }} disabled={template.fields.length < 2}>
                Add Rule
              </Button>
            )}
          </InlineGrid>

          {isClient && (
            <InlineStack gap="200" align="start">
              <ButtonGroup>
                <Button
                  pressed={ruleBuilderMode === "VISUAL"}
                  onClick={() => handleRuleBuilderModeChange("VISUAL")}
                >
                  Visual Rule Tree
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

          {template.fields.length < 2 && (
            <Banner tone="info">
              You need at least 2 fields to create cascading rules.
            </Banner>
          )}
        </BlockStack>
      </Card>

      {ruleBuilderMode === "TRADITIONAL" ? (
        <BlockStack gap="400">
          {showRuleForm && (
            <Card background="bg-surface-secondary">
              <BlockStack gap="500">
                <Text as="h4" variant="headingSm">{editingRuleId ? "Edit Logic Rule" : "New Logic Rule"}</Text>

                {/* Conditions Builder */}
                <BlockStack gap="300">
                  <Text as="strong" variant="bodyMd">IF (Conditions)</Text>

                  {ruleConditions.length > 0 && (
                    <InlineStack gap="200" wrap>
                      {ruleConditions.map((cond, index) => (
                        <Tag key={index} onRemove={() => handleRemoveCondition(index)}>
                          {getFieldName(cond.fieldId)} {cond.operator === "EQUALS" ? "=" : cond.operator} {cond.value}
                        </Tag>
                      ))}
                    </InlineStack>
                  )}

                  <InlineGrid columns="1fr 1fr 1fr auto" gap="200">
                    <Select
                      label="Field"
                      options={[{ label: "Select field...", value: "" }, ...template.fields.map(f => ({ label: f.name, value: f.id }))]}
                      value={tempCondFieldId}
                      onChange={setTempCondFieldId}
                    />
                    <Select
                      label="Operator"
                      options={[
                        { label: "is", value: "EQUALS" },
                        { label: "is not", value: "NOT_EQUALS" }
                      ]}
                      value={tempCondOperator}
                      onChange={setTempCondOperator}
                    />
                    {(() => {
                      const selectedField = template.fields.find(f => f.id === tempCondFieldId);
                      const hasOptions = selectedField?.optionsJson && Array.isArray(selectedField.optionsJson) && selectedField.optionsJson.length > 0;

                      return hasOptions ? (
                        <Select
                          label="Value"
                          options={[
                            { label: "Select option...", value: "" },
                            ...(selectedField.optionsJson as string[]).map(opt => ({ label: opt, value: opt }))
                          ]}
                          value={tempCondValue}
                          onChange={setTempCondValue}
                        />
                      ) : (
                        <TextField
                          label="Value"
                          value={tempCondValue}
                          onChange={setTempCondValue}
                          autoComplete="off"
                        />
                      );
                    })()}
                    <div style={{ marginTop: "24px" }}>
                      <Button onClick={handleAddCondition} disabled={!tempCondFieldId || !tempCondValue}>
                        Add Condition
                      </Button>
                    </div>
                  </InlineGrid>
                </BlockStack>

                <Divider />

                {/* Actions Builder */}
                <BlockStack gap="300">
                  <Text as="strong" variant="bodyMd">THEN (Action)</Text>

                  <InlineGrid columns="auto 1fr" gap="200">
                    <Select
                      label="Action"
                      options={[
                        { label: "Show", value: "SHOW" },
                        { label: "Hide", value: "HIDE" },
                        { label: "Limit Options To", value: "LIMIT_OPTIONS" },
                        { label: "Limit To Dataset", value: "LIMIT_OPTIONS_DATASET" },
                        { label: "Override Option Prices", value: "SET_PRICE" }
                      ]}
                      value={ruleActionType}
                      onChange={setRuleActionType}
                    />
                    <Select
                      label="Target Field"
                      options={[
                        { label: "Select field...", value: "" },
                        ...[...template.fields, ...localFields].map(f => ({ label: `[Field] ${f.name}`, value: f.id })),
                        ...datasets.map((d: any) => ({ label: `[Dataset] ${d.name}`, value: `dataset_${d.id}` }))
                      ]}
                      value={ruleTargetFieldId}
                      onChange={(val) => {
                        if (val.startsWith("dataset_")) {
                          const datasetId = val.replace("dataset_", "");
                          const dataset = datasets.find((d: any) => d.id === datasetId);
                          if (dataset) {
                            let baseName = dataset.name.replace(/\s+/g, '_').toLowerCase();
                            let finalName = baseName;
                            let counter = 1;
                            const combined = [...template.fields, ...localFields];
                            while (combined.some(f => f.name === finalName)) {
                              finalName = `${baseName}_${counter}`;
                              counter++;
                            }

                            const newId = "local_" + Math.random().toString(36).substring(2, 9);
                            const newField = {
                              id: newId,
                              type: "select",
                              name: finalName,
                              label: dataset.name,
                              optionsJson: dataset.optionsJson,
                              required: false
                            };
                            setLocalFields(prev => [...prev, newField]);

                            setRuleTargetFieldId(newId);
                            setRuleActionType("LIMIT_OPTIONS_DATASET");
                            setTempTargetOption(dataset.id);
                          }
                        } else {
                          setRuleTargetFieldId(val);
                        }
                      }}
                    />
                  </InlineGrid>

                  {ruleActionType === "LIMIT_OPTIONS" && (
                    <BlockStack gap="300">
                      <Text as="p" tone="subdued">Add allowed options for the target field:</Text>

                      {ruleTargetOptions.length > 0 && (
                        <InlineStack gap="200" wrap>
                          {ruleTargetOptions.map((opt, index) => (
                            <Tag key={index} onRemove={() => handleRemoveTargetOption(opt)}>
                              {opt}
                            </Tag>
                          ))}
                        </InlineStack>
                      )}

                      <InlineGrid columns="1fr auto" gap="200">
                        {(() => {
                          const limitTargetField = template.fields.find(f => f.id === ruleTargetFieldId);
                          const targetHasOptions = limitTargetField?.optionsJson && Array.isArray(limitTargetField.optionsJson) && limitTargetField.optionsJson.length > 0;

                          return targetHasOptions ? (
                            <Select
                              label="Allowed Option"
                              options={[
                                { label: "Select option...", value: "" },
                                ...(limitTargetField.optionsJson as string[])
                                  .filter(opt => !ruleTargetOptions.includes(opt)) // Don't show already selected ones
                                  .map(opt => ({ label: opt, value: opt }))
                              ]}
                              value={tempTargetOption}
                              onChange={setTempTargetOption}
                            />
                          ) : (
                            <TextField
                              label="Allowed Option"
                              value={tempTargetOption}
                              onChange={setTempTargetOption}
                              autoComplete="off"
                            />
                          );
                        })()}
                        <div style={{ marginTop: "24px" }}>
                          <Button onClick={handleAddTargetOption} disabled={!tempTargetOption}>
                            Add Option
                          </Button>
                        </div>
                      </InlineGrid>
                    </BlockStack>
                  )}

                  {ruleActionType === "LIMIT_OPTIONS_DATASET" && (
                    <BlockStack gap="300">
                      <Text as="p" tone="subdued">Select the Global Dataset to populate the target field options:</Text>
                      <InlineGrid columns="1fr" gap="200">
                        <Select
                          label="Global Dataset"
                          options={[
                            { label: "Select Dataset...", value: "" },
                            ...datasets.map((d: any) => ({ label: d.name, value: d.id }))
                          ]}
                          value={tempTargetOption}
                          onChange={setTempTargetOption}
                        />
                      </InlineGrid>
                    </BlockStack>
                  )}

                  {ruleActionType === "SET_PRICE" && (
                    <BlockStack gap="300">
                      <Text as="p" tone="subdued">Set condition-based price adjustments for specific options ($):</Text>
                      <InlineGrid columns="1fr 1fr" gap="400">
                        {(() => {
                          const targetField = template.fields.find(f => f.id === ruleTargetFieldId);
                          if (!targetField || !targetField.optionsJson) return <Text as="p" tone="subdued">Select a valid text/number field with predefined choices.</Text>;
                          return (targetField.optionsJson as string[]).map(opt => (
                            <TextField
                              key={opt}
                              label={`Price Adjustment for "${opt}"`}
                              type="number"
                              prefix="$"
                              value={ruleTargetPriceAdjustments[opt] || ""}
                              onChange={(val) => setRuleTargetPriceAdjustments(p => ({ ...p, [opt]: val }))}
                              autoComplete="off"
                            />
                          ))
                        })()}
                      </InlineGrid>
                    </BlockStack>
                  )}
                </BlockStack>

                <InlineGrid columns={2} gap="200">
                  <Button onClick={resetRuleForm}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleSaveRule}
                    disabled={ruleConditions.length === 0 || !ruleTargetFieldId}
                  >
                    Save Rule
                  </Button>
                </InlineGrid>
              </BlockStack>
            </Card>
          )}

          {template.rules.length === 0 ? (
            <Card>
              <Text as="p" tone="subdued">
                No rules yet. Click "Add Rule" to get started.
              </Text>
            </Card>
          ) : (
            <Card>
              <ResourceList
                resourceName={{ singular: "rule", plural: "rules" }}
                items={template.rules}
                renderItem={(rule: any) => {
                  const condText = (rule.conditionsJson as Array<any>)?.map(c => `${getFieldName(c.fieldId)} ${c.operator === 'EQUALS' ? '=' : '!='} ${c.value}`).join(" AND ") || "No condition";
                  const targetLabel = getFieldName(rule.targetFieldId);

                  let actionText = "";
                  if (rule.actionType === "SHOW") actionText = `Show ${targetLabel}`;
                  else if (rule.actionType === "HIDE") actionText = `Hide ${targetLabel}`;
                  else if (rule.actionType === "LIMIT_OPTIONS") {
                    let opts: string[] = [];
                    try { opts = rule.targetOptionsJson as string[]; } catch (e) { }
                    actionText = `Limit ${targetLabel} to [${opts?.join(", ")}]`;
                  }
                  else if (rule.actionType === "LIMIT_OPTIONS_DATASET") {
                    let datasetId = "";
                    try {
                      const parsed = typeof rule.targetOptionsJson === 'string' ? JSON.parse(rule.targetOptionsJson) : rule.targetOptionsJson;
                      datasetId = parsed?.datasetId || "";
                    } catch (e) { }
                    const dName = datasets.find((d: any) => d.id === datasetId)?.name || "Unknown Dataset";
                    actionText = `Limit ${targetLabel} to Dataset: ${dName}`;
                  }

                  return (
                    <ResourceItem id={rule.id} onClick={() => { }}>
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            IF {condText}
                          </Text>
                          <Text as="p" tone="subdued">
                            THEN {actionText}
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
                          <Button
                            onClick={() => handleDeleteRule(rule.id)}
                            tone="critical"
                          >
                            Delete
                          </Button>
                        </InlineStack>
                      </InlineStack>
                    </ResourceItem>
                  );
                }}
              />
            </Card>
          )}
        </BlockStack>
      ) : (
        <Card background="bg-surface-secondary">
          <VisualRuleBuilder
            fields={[...template.fields, ...localFields]}
            rules={template.rules}
            datasets={datasets}
            onAddNewField={(newField) => {
              const newId = "local_" + Math.random().toString(36).substring(2, 9);
              setLocalFields(prev => [...prev, { ...newField, id: newId }]);
              return newId;
            }}
            onSaveRules={(newRules) => {
              submit(
                {
                  _intent: "bulkSaveRules",
                  rulesJson: JSON.stringify(newRules),
                  newFieldsJson: JSON.stringify(localFields)
                },
                { method: "post" }
              );
              setLocalFields([]); // Reset on save
            }}
          />
        </Card>
      )}
    </BlockStack>
  );

  const AppearanceView = (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <InlineGrid columns="1fr auto">
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Appearance Settings
              </Text>
              <Text as="p">
                Customize the visual style of your storefront option buttons. These settings apply globally to all products using this template.
              </Text>
              <Card background="bg-surface-secondary">
                <BlockStack gap="200">
                  <Text as="h4" variant="headingSm">💡 How it works (Example):</Text>
                  <Text as="p" variant="bodyMd">
                    By default, option buttons look like standard text on your theme.<br />
                    • Change <Text as="span" fontWeight="bold">Background Color</Text> to `#000000` to make them solid black.<br />
                    • Change <Text as="span" fontWeight="bold">Text Color</Text> to `#ffffff` for white text.<br />
                    • Adjust <Text as="span" fontWeight="bold">Border Radius</Text> to `8px` to give them softly rounded corners.<br />
                    <br />
                    Test your changes interactively using the Preview box below!
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
          </InlineGrid>
          <Select
            label="Font Family"
            options={[
              { label: "Theme Default", value: "" },
              { label: "Arial", value: "Arial, sans-serif" },
              { label: "Courier New", value: "'Courier New', Courier, monospace" },
              { label: "Georgia", value: "Georgia, serif" },
              { label: "Helvetica", value: "Helvetica, sans-serif" },
              { label: "Tahoma", value: "Tahoma, sans-serif" },
              { label: "Times New Roman", value: "'Times New Roman', Times, serif" },
              { label: "Trebuchet MS", value: "'Trebuchet MS', sans-serif" },
              { label: "Verdana", value: "Verdana, sans-serif" },
              { label: "System Default", value: "system-ui, sans-serif" },
              { label: "Custom...", value: "custom" }
            ]}
            value={fontFamily === "custom" ? "custom" : (fontFamily || "")}
            onChange={(val) => setFontFamily(val)}
          />
          {fontFamily === "custom" && (
            <TextField
              label="Custom Font Family"
              value={fontFamily === "custom" ? "" : fontFamily}
              onChange={setFontFamily}
              placeholder="e.g. 'Roboto', sans-serif"
              autoComplete="off"
              helpText="Enter the exact font name loaded by your theme."
            />
          )}

          <InlineGrid columns={2} gap="400">
            <TextField
              label="Font Size (px)"
              type="number"
              value={fontSize ? fontSize.replace(/[^0-9.]/g, '') : ""}
              onChange={(val) => setFontSize(val ? `${val}px` : "")}
              autoComplete="off"
            />
            <Select
              label="Font Weight"
              options={[
                { label: "Default", value: "" },
                { label: "Normal (400)", value: "normal" },
                { label: "Medium (500)", value: "500" },
                { label: "Semi Bold (600)", value: "600" },
                { label: "Bold (700)", value: "bold" },
              ]}
              value={fontWeight || ""}
              onChange={setFontWeight}
            />
          </InlineGrid>

          <InlineGrid columns={2} gap="400">
            <TextField
              label="Padding (em)"
              type="number"
              step={0.1}
              value={padding ? padding.replace(/[^0-9.]/g, '') : ""}
              onChange={(val) => setPadding(val ? `${val}em` : "")}
              autoComplete="off"
              helpText="Space inside the button."
            />
            <TextField
              label="Border Radius (px)"
              type="number"
              value={borderRadius ? borderRadius.replace(/[^0-9.]/g, '') : ""}
              onChange={(val) => setBorderRadius(val ? `${val}px` : "")}
              autoComplete="off"
              helpText="Higher numbers mean rounder corners."
            />
          </InlineGrid>

          <InlineGrid columns={3} gap="400">
            <BlockStack gap="100">
              <Text as="span" variant="bodyMd">Text Color</Text>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="color" value={textColor || "#000000"} onChange={(e) => setTextColor(e.target.value)} style={{ width: '40px', height: '40px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }} />
                <Text as="span">{textColor || "#000000"}</Text>
              </div>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" variant="bodyMd">Background Color</Text>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="color" value={backgroundColor || "#ffffff"} onChange={(e) => setBackgroundColor(e.target.value)} style={{ width: '40px', height: '40px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }} />
                <Text as="span">{backgroundColor || "#ffffff"}</Text>
              </div>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" variant="bodyMd">Border Color</Text>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="color" value={borderColor || "#000000"} onChange={(e) => setBorderColor(e.target.value)} style={{ width: '40px', height: '40px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }} />
                <Text as="span">{borderColor || "#000000"}</Text>
              </div>
            </BlockStack>
          </InlineGrid>

          <InlineGrid columns={2} gap="400">
            <BlockStack gap="100">
              <Text as="span" variant="bodyMd">Hover Text Color</Text>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="color" value={hoverTextColor || "#000000"} onChange={(e) => setHoverTextColor(e.target.value)} style={{ width: '40px', height: '40px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }} />
                <Text as="span">{hoverTextColor || "#000000"}</Text>
              </div>
            </BlockStack>
            <BlockStack gap="100">
              <Text as="span" variant="bodyMd">Hover Background Color</Text>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input type="color" value={hoverBackgroundColor || "#ffffff"} onChange={(e) => setHoverBackgroundColor(e.target.value)} style={{ width: '40px', height: '40px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }} />
                <Text as="span">{hoverBackgroundColor || "#ffffff"}</Text>
              </div>
            </BlockStack>
          </InlineGrid>
        </BlockStack>
      </Card>
      <Card>
        <BlockStack gap="200">
          <Text as="h4" variant="headingSm">
            Preview
          </Text>
          <div
            onMouseEnter={() => setIsHover(true)}
            onMouseLeave={() => setIsHover(false)}
            style={{
              display: "inline-block",
              fontFamily: fontFamily || undefined,
              fontSize: fontSize || undefined,
              fontWeight: fontWeight || undefined,
              color:
                isHover && hoverTextColor
                  ? hoverTextColor
                  : textColor || undefined,
              backgroundColor:
                isHover && hoverBackgroundColor
                  ? hoverBackgroundColor
                  : backgroundColor || undefined,
              border: borderColor ? `1px solid ${borderColor}` : undefined,
              borderRadius: borderRadius || undefined,
              padding: padding || undefined,
            }}
          >
            <Button>
              Sample Button
            </Button>
          </div>
        </BlockStack>
      </Card>
      <InlineGrid columns={2} gap="200">
        <Button onClick={handleSaveAppearance} variant="primary">
          Save Appearance
        </Button>
      </InlineGrid>
    </BlockStack>
  );

  return (
    <Page
      backAction={{ content: "Templates", url: "/app?tab=templates" }}
      title={template.name}
      secondaryActions={[
        {
          content: "Delete Template",
          destructive: true,
          onAction: handleDeleteTemplate,
        },
      ]}
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <TextField
              label="Template Name"
              value={templateName}
              onChange={setTemplateName}
              autoComplete="off"
            />
            <InlineGrid columns="1fr auto">
              <div />
              <Button
                onClick={() =>
                  submit(
                    { templateName, _intent: "updateName" },
                    { method: "post" }
                  )
                }
                disabled={templateName === template.name}
                variant="primary"
              >
                Save Name
              </Button>
            </InlineGrid>
          </BlockStack>
        </Card>

        <Tabs
          tabs={[
            { id: "fields", content: "Fields", badge: String(template.fields.length) },
            { id: "products", content: "Products", badge: String(template.links.length) },
            { id: "rules", content: "Rules", badge: String(template.rules.length) },
            { id: "appearance", content: "Appearance" },
          ]}
          selected={selectedTab}
          onSelect={setSelectedTab}
        >
          <div style={{ marginTop: "1rem" }}>
            {selectedTab === 0 && FieldsView}
            {selectedTab === 1 && ProductsView}
            {selectedTab === 2 && RulesView}
            {selectedTab === 3 && AppearanceView}
          </div>
        </Tabs>
      </BlockStack>
    </Page>
  );
}
