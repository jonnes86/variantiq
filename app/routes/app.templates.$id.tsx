import {
  json,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useSubmit, Form, Link, useSearchParams, useActionData, useRouteError } from "@remix-run/react";
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
  ButtonGroup,
  Modal,
  Box,
  Layout,
  List
} from "@shopify/polaris";
import { prisma } from "../db.server";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { CanvasRuleBuilder } from "../components/CanvasRuleBuilder";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DragHandleIcon } from "@shopify/polaris-icons";
import { Icon } from "@shopify/polaris";
import { Prisma } from "@prisma/client";
import { detectPlan, getLimits } from "../billing.server";

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
            <div onClick={() => handleEditFieldClick(field)} style={{ cursor: 'pointer' }}>
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
                  Options: {(Array.isArray(field.optionsJson) ? field.optionsJson : (typeof field.optionsJson === 'string' ? JSON.parse(field.optionsJson || "[]") : [])).map((opt: string) => {
                    const price = field.priceAdjustmentsJson?.[opt];
                    return price ? `${opt} (+$${price})` : opt;
                  }).join(", ")}
                </Text>
              )}
            </BlockStack>
            </div>
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

    const [template, datasets, planInfo] = await Promise.all([
      prisma.template.findFirst({
        where: { id: templateId, shop: session.shop },
        include: {
          fields: { orderBy: { sort: "asc" } },
          rules: { orderBy: { sort: "asc" } },
          links: { select: { productGid: true } },
        },
      }),
      prisma.dataset.findMany({
        where: { shop: session.shop },
        orderBy: { name: "asc" },
      }),
      detectPlan(session.shop, admin),
    ]);

    if (!template) throw new Response("Template not found", { status: 404 });

    // Fetch product details for linked products
    const linkedProductGids = template.links.map(link => link.productGid);
    let linkedProductsData: any[] = [];

    if (linkedProductGids.length > 0) {
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
        linkedProductsData = Object.values(responseJson.data).filter(Boolean);
      }
    }

    const limits = getLimits(planInfo.tier);

    return json({
      template,
      linkedProductsData,
      datasets,
      planInfo,
      limits,
      atFieldLimit: !limits.hasRules && template.fields.length >= limits.maxFieldsPerTemplate,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Loader Error:", error);
    throw new Response(`Server Error: ${msg}`, { status: 500 });
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

  // Duplicate template
  if (intent === "duplicateTemplate") {
    const original = await prisma.template.findUnique({
      where: { id: templateId },
      include: { fields: true, rules: true },
    });
    if (!original) return json({ error: "Not found" }, { status: 404 });

    // Create new template
    const newTemplate = await prisma.template.create({
      data: {
        shop: (original as any).shop ?? (original as any).shopId,
        name: `Copy of ${original.name}`,
        fontFamily: original.fontFamily,
        fontSize: original.fontSize,
        fontWeight: original.fontWeight,
        textColor: original.textColor,
        backgroundColor: original.backgroundColor,
        borderColor: original.borderColor,
        borderRadius: original.borderRadius,
        padding: original.padding,
        hoverBackgroundColor: original.hoverBackgroundColor,
        hoverTextColor: original.hoverTextColor,
      } as any,
    });

    // Copy fields and track old→new ID mapping
    const fieldIdMap: Record<string, string> = {};
    for (const f of original.fields) {
      const newField = await prisma.field.create({
        data: {
          templateId: newTemplate.id,
          type: f.type,
          name: f.name,
          label: f.label,
          sort: f.sort,
          required: f.required,
          optionsJson: f.optionsJson,
          priceAdjustmentsJson: f.priceAdjustmentsJson,
          variantMappingJson: f.variantMappingJson,
          swatchesJson: f.swatchesJson,
          displayStyle: f.displayStyle,
          ssStyleMappingJson: f.ssStyleMappingJson,
          ssColorAliasJson: f.ssColorAliasJson,
        } as any,
      });
      fieldIdMap[f.id] = newField.id;
    }

    // Copy rules, remapping field IDs
    for (const r of original.rules) {
      let conds: any[] = [];
      try { conds = typeof r.conditionsJson === "string" ? JSON.parse(r.conditionsJson as string) : (r.conditionsJson as any[]); } catch (_e) { }
      const remappedConds = Array.isArray(conds)
        ? conds.map((c: any) => ({ ...c, fieldId: fieldIdMap[c.fieldId] ?? c.fieldId }))
        : conds;
      await prisma.rule.create({
        data: {
          templateId: newTemplate.id,
          actionType: r.actionType,
          targetFieldId: fieldIdMap[r.targetFieldId] ?? r.targetFieldId,
          conditionsJson: remappedConds as any,
          targetOptionsJson: r.targetOptionsJson as any,
          targetPriceAdjustmentsJson: r.targetPriceAdjustmentsJson as any,
          sort: r.sort,
        },
      });
    }

    return redirect(`/app/templates/${newTemplate.id}`);
  }

  // Add or Edit field
  if (intent === "addField" || intent === "editField") {
    const type = String(form.get("fieldType") || "");
    const name = String(form.get("fieldName") || "").trim();
    const label = String(form.get("fieldLabel") || "").trim();
    const required = form.get("fieldRequired") === "true";
    const displayStyle = String(form.get("fieldDisplayStyle") || "default");
    const optionsDataStr = String(form.get("optionsData") || "");

    if (!type || !name || !label) {
      return json({ error: "All fields required" }, { status: 400 });
    }

    // Parse options and prices for select/radio/checkbox
    let optionsJson: any = null;
    let priceAdjustmentsJson: any = null;
    let variantMappingJson: any = null;
    let swatchesJson: any = null;
    let ssStyleMappingJson: any = null;
    let ssColorAliasJson: any = null;

    if (["select", "radio", "checkbox"].includes(type) && optionsDataStr) {
      try {
        const parsedOptions = JSON.parse(optionsDataStr);
        if (Array.isArray(parsedOptions) && parsedOptions.length > 0) {
          optionsJson = parsedOptions.map(o => o.label.trim()).filter(Boolean);

          const priceMap: Record<string, number> = {};
          const mappingMap: Record<string, string> = {};
          const swatchMap: Record<string, string> = {};
          const ssStyleMap: Record<string, string> = {};
          const ssColorAliasMap: Record<string, string> = {};
          let hasPrices = false;
          let hasMappings = false;
          let hasSwatches = false;
          let hasSsStyles = false;
          let hasSsColorAliases = false;

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
            if (o.swatchColor && o.swatchColor.trim() !== "") {
              swatchMap[o.label.trim()] = o.swatchColor.trim();
              hasSwatches = true;
            }
            if (o.ssStyleId && o.ssStyleId.trim() !== "") {
              ssStyleMap[o.label.trim()] = o.ssStyleId.trim();
              hasSsStyles = true;
            }
            if (o.ssColorAlias && o.ssColorAlias.trim() !== "") {
              ssColorAliasMap[o.label.trim()] = o.ssColorAlias.trim();
              hasSsColorAliases = true;
            }
          });

          if (hasPrices) priceAdjustmentsJson = priceMap;
          if (hasMappings) variantMappingJson = mappingMap;
          if (hasSwatches) swatchesJson = swatchMap;
          if (hasSsStyles) ssStyleMappingJson = ssStyleMap;
          if (hasSsColorAliases) ssColorAliasJson = ssColorAliasMap;
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
          variantMappingJson: variantMappingJson as any,
          swatchesJson: swatchesJson as any,
          ssStyleMappingJson: ssStyleMappingJson as any,
          ssColorAliasJson: ssColorAliasJson as any,
          displayStyle
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
          swatchesJson: swatchesJson as any,
          ssStyleMappingJson: ssStyleMappingJson as any,
          ssColorAliasJson: ssColorAliasJson as any,
          displayStyle,
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

      const updateData: any = {
        conditionsJson: conditionsJson as any,
        targetFieldId,
        actionType,
      };
      if (targetOptionsJson !== null && targetOptionsJson !== undefined) updateData.targetOptionsJson = targetOptionsJson;
      if (targetPriceAdjustmentsJson !== null && targetPriceAdjustmentsJson !== undefined) updateData.targetPriceAdjustmentsJson = targetPriceAdjustmentsJson;

      await prisma.rule.update({
        where: { id: ruleId },
        data: updateData
      });
    } else {
      const maxSort = await prisma.rule.findFirst({
        where: { templateId },
        orderBy: { sort: "desc" },
        select: { sort: true },
      });

      const createData: any = {
        templateId,
        conditionsJson: conditionsJson as any,
        targetFieldId,
        actionType,
        sort: (maxSort?.sort || 0) + 1,
      };
      if (targetOptionsJson !== null && targetOptionsJson !== undefined) createData.targetOptionsJson = targetOptionsJson;
      if (targetPriceAdjustmentsJson !== null && targetPriceAdjustmentsJson !== undefined) createData.targetPriceAdjustmentsJson = targetPriceAdjustmentsJson;

      await prisma.rule.create({
        data: createData,
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

      const mappedRule: any = {
        templateId,
        conditionsJson: conds && Array.isArray(conds) ? conds : [],
        targetFieldId: mapId(rule.targetFieldId || ""),
        actionType: rule.actionType || "SHOW",
        sort: index + 1,
        targetOptionsJson: targetOpts !== undefined && targetOpts !== null ? targetOpts : Prisma.DbNull,
        targetPriceAdjustmentsJson: Prisma.DbNull,
      };

      return mappedRule;
    });

    await prisma.rule.createMany({
      data: rulesToCreate,
    });

    // Apply tree-depth sort order to fields so the storefront renders them
    // in the correct DFS traversal order (parent before child).
    const fieldSortOrderStr = String(form.get("fieldSortOrderJson") || "[]");
    let fieldSortOrder: Array<{ fieldId: string; sort: number }> = [];
    try { fieldSortOrder = JSON.parse(fieldSortOrderStr); } catch (e) { }
    if (Array.isArray(fieldSortOrder) && fieldSortOrder.length > 0) {
      for (const item of fieldSortOrder) {
        const realId = mapId(item.fieldId);
        await prisma.field.updateMany({
          where: { id: realId, templateId },
          data: { sort: item.sort },
        });
      }
    }

    // Auto-snapshot for version history (keep last 20)
    try {
      const currentFields = await prisma.field.findMany({ where: { templateId }, orderBy: { sort: "asc" } });
      const currentRulesSnap = await prisma.rule.findMany({ where: { templateId }, orderBy: { sort: "asc" } });
      await prisma.templateVersion.create({
        data: {
          templateId,
          label: "Auto-save",
          rulesJson: currentRulesSnap as any,
          fieldsJson: currentFields as any,
        },
      });
      const allVersions = await prisma.templateVersion.findMany({
        where: { templateId }, orderBy: { createdAt: "desc" }, select: { id: true }
      });
      if (allVersions.length > 20) {
        const toDelete = allVersions.slice(20).map((v) => v.id);
        await prisma.templateVersion.deleteMany({ where: { id: { in: toDelete } } });
      }
    } catch (versionError) {
      console.error("[TemplateVersion snapshot failed]", versionError);
      // Don't fail the save — versioning is optional
    }
    return json({ success: true, _action: "bulkSaveRules" });
  }

  // Restore a version snapshot
  if (intent === "restoreVersion") {
    const versionId = String(form.get("versionId") || "");
    const version = await prisma.templateVersion.findUnique({ where: { id: versionId } });
    if (!version) return json({ error: "Version not found" }, { status: 404 });
    await prisma.rule.deleteMany({ where: { templateId } });
    const snapRules = version.rulesJson as any[];
    for (const r of snapRules) {
      await prisma.rule.create({
        data: {
          templateId, actionType: r.actionType, targetFieldId: r.targetFieldId,
          conditionsJson: r.conditionsJson,
          targetOptionsJson: r.targetOptionsJson ?? undefined,
          targetPriceAdjustmentsJson: r.targetPriceAdjustmentsJson ?? undefined,
          sort: r.sort || 0,
        },
      });
    }
    return json({ success: true, restored: true });
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

  // Link multiple products
  if (intent === "linkProducts") {
    const productIdsStr = String(form.get("productIds") || "[]");
    let productIds: string[] = [];
    try {
      productIds = JSON.parse(productIdsStr);
    } catch (e) {
      return json({ error: "Invalid product IDs format" }, { status: 400 });
    }

    if (productIds.length > 0) {
      for (const gid of productIds) {
        // Prevent duplicate links
        const existing = await prisma.productTemplateLink.findFirst({
          where: { shop: session.shop, templateId, productGid: gid }
        });
        if (!existing) {
          await prisma.productTemplateLink.create({
            data: { shop: session.shop, templateId, productGid: gid }
          });
        }
      }
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

  // Save dataset
  if (intent === "saveDataset") {
    const datasetId = String(form.get("datasetId") || "");
    const name = String(form.get("name") || "").trim();
    const label = String(form.get("label") || "").trim();
    const type = String(form.get("type") || "select").trim();
    const rawOptions = String(form.get("options") || "");

    const newOptions = rawOptions
      .split(/\r?\n/)
      .map(opt => opt.trim())
      .filter(opt => opt.length > 0);
    const uniqueOptions = Array.from(new Set(newOptions));

    if (!name) return json({ error: "Dataset name required" }, { status: 400 });

    if (datasetId && datasetId !== "new") {
      await prisma.dataset.update({
        where: { id: datasetId, shop: session.shop },
        data: { name, label, type, optionsJson: JSON.stringify(uniqueOptions) },
      });
    } else {
      await prisma.dataset.create({
        data: { shop: session.shop, name, label, type, optionsJson: JSON.stringify(uniqueOptions) },
      });
    }
    return json({ success: true });
  }

  // Delete dataset
  if (intent === "deleteDataset") {
    const datasetId = String(form.get("datasetId") || "");
    await prisma.dataset.delete({ where: { id: datasetId, shop: session.shop } });
    return json({ success: true });
  }

  return null;
}

function StatefulLivePreview({ template, datasets, appearance }: { template: any, datasets: any[], appearance: any }) {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isHover, setIsHover] = useState(false);

  const { fontFamily, fontSize, fontWeight, textColor } = appearance;

  const handleFieldChange = (fieldId: string, value: string) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }));
  };

  const visibleFields = new Set<string>();
  const limitOptions: Record<string, Set<string>> = {};

  const rulesByTarget: Record<string, any[]> = {};
  template.fields.forEach((f: any) => rulesByTarget[f.id] = []);
  template.rules.forEach((r: any) => {
    if (rulesByTarget[r.targetFieldId]) rulesByTarget[r.targetFieldId].push(r);
  });

  let missingRequiredEncountered = false;
  const sortedFields = [...template.fields].sort((a: any, b: any) => a.sort - b.sort);

  sortedFields.forEach(field => {
    const fieldRules = rulesByTarget[field.id];
    let shouldShow = true;

    const showRules = fieldRules.filter(r => r.actionType === 'SHOW');
    const hideRules = fieldRules.filter(r => r.actionType === 'HIDE');
    const limitRules = fieldRules.filter(r => r.actionType === 'LIMIT_OPTIONS' || r.actionType === 'LIMIT_OPTIONS_DATASET');

    const evaluateCondition = (rule: any) => {
      const conditions = rule.conditionsJson || [];
      if (conditions.length === 0) return false;
      return conditions.every((c: any) => {
        const val = fieldValues[c.fieldId] || "";
        if (c.operator === 'EQUALS') return val === c.value;
        if (c.operator === 'NOT_EQUALS') return val !== "" && val !== c.value;
        if (c.operator === 'CONTAINS') return val !== "" && val.includes(c.value);
        return false;
      });
    };

    if (showRules.length > 0) {
      shouldShow = showRules.some(evaluateCondition);
    } else if (hideRules.length > 0) {
      shouldShow = !hideRules.some(evaluateCondition);
    }

    if (missingRequiredEncountered && showRules.length === 0) {
      shouldShow = false;
    }

    const passingLimitRules = limitRules.filter(evaluateCondition);
    if (passingLimitRules.length > 0) {
       limitOptions[field.id] = new Set();
       passingLimitRules.forEach(r => {
          if (r.actionType === 'LIMIT_OPTIONS') {
            let opts = r.targetOptionsJson || [];
            if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch(e){ opts = []; } }
            if (Array.isArray(opts)) opts.forEach((o: string) => limitOptions[field.id].add(o));
          } else if (r.actionType === 'LIMIT_OPTIONS_DATASET') {
            const did = r.targetOptionsJson;
            const d = datasets.find(d => d.id === did);
            if (d) {
               let opts = d.optionsJson || [];
               if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch(e){ opts = []; } }
               if (Array.isArray(opts)) opts.forEach((o: any) => limitOptions[field.id].add(typeof o === 'string' ? o : o.label || ""));
            }
          }
       });
    }

    if (shouldShow) {
       visibleFields.add(field.id);
    }

    if (shouldShow && field.required) {
       const val = fieldValues[field.id];
       if (!val || val.trim() === '') {
         missingRequiredEncountered = true;
       }
    }
  });

  return (
    <div
      style={{
        fontFamily: fontFamily || undefined,
        fontSize: fontSize || undefined,
        fontWeight: fontWeight || undefined,
        color: textColor || undefined,
      }}
    >
      <BlockStack gap="400">
        {sortedFields.map(f => {
          if (!visibleFields.has(f.id)) return null;

          let parsedOpts: any[] = [];
          try { parsedOpts = Array.isArray(f.optionsJson) ? f.optionsJson : JSON.parse(f.optionsJson || "[]"); } catch(e) {}
          let mappedOpts = parsedOpts.map(o => typeof o === 'string' ? o : o.label || "");
          
          if (limitOptions[f.id]) {
             mappedOpts = mappedOpts.filter(opt => limitOptions[f.id].has(opt));
          }

          const value = fieldValues[f.id] || "";

          return (
            <BlockStack gap="200" key={f.id}>
              <Text variant="headingSm" as="h3">
                {f.label} {f.required && <span style={{ color: "red" }}>*</span>}
              </Text>
              {f.type === "select" ? (
                 <Select
                   labelHidden
                   label={f.label}
                   options={[{label: `Select ${f.label}...`, value: ""}, ...mappedOpts.map(opt => ({ label: opt, value: opt }))]}
                   value={value}
                   onChange={(val) => handleFieldChange(f.id, val)}
                 />
              ) : f.type === "text" ? (
                <TextField 
                  labelHidden 
                  label={f.label} 
                  value={value} 
                  onChange={(val) => handleFieldChange(f.id, val)} 
                  autoComplete="off" 
                />
              ) : f.type === "checkbox" ? (
                 <Checkbox 
                   label={mappedOpts.length > 0 ? mappedOpts[0] : f.label} 
                   checked={value === (mappedOpts.length > 0 ? mappedOpts[0] : f.label)} 
                   onChange={(checked) => handleFieldChange(f.id, checked ? (mappedOpts.length > 0 ? mappedOpts[0] : f.label) : "")} 
                 />
              ) : f.type === "radio" ? (
                 <BlockStack gap="200">
                   {mappedOpts.map(opt => (
                     <div key={opt}>
                       <input 
                         type="radio" 
                         id={`preview-${f.id}-${opt}`} 
                         name={`preview-${f.id}`} 
                         checked={value === opt} 
                         onChange={() => handleFieldChange(f.id, opt)} 
                         style={{ marginRight: '8px', cursor: 'pointer' }}
                       />
                       <label htmlFor={`preview-${f.id}-${opt}`} style={{ cursor: 'pointer' }}>{opt}</label>
                     </div>
                   ))}
                 </BlockStack>
              ) : null}
            </BlockStack>
          );
        })}
        {template.fields.length === 0 && (
          <Text tone="subdued" as="p">Add fields to see them previewed here.</Text>
        )}
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--p-color-border-subdued)' }}>
          <Text as="p" tone="subdued" variant="bodySm" fontWeight="bold">Storefront Button Preview</Text>
          <div
            onMouseEnter={() => setIsHover(true)}
            onMouseLeave={() => setIsHover(false)}
            style={{
              display: "inline-block",
              marginTop: "8px",
              fontFamily: appearance.fontFamily || undefined,
              fontSize: appearance.fontSize || undefined,
              fontWeight: appearance.fontWeight || undefined,
              color:
                isHover && appearance.hoverTextColor
                  ? appearance.hoverTextColor
                  : appearance.textColor || undefined,
              backgroundColor:
                isHover && appearance.hoverBackgroundColor
                  ? appearance.hoverBackgroundColor
                  : appearance.backgroundColor || undefined,
              border: appearance.borderColor ? `1px solid ${appearance.borderColor}` : undefined,
              borderRadius: appearance.borderRadius || undefined,
              padding: appearance.padding || undefined,
            }}
          >
            <Button>
              Sample Button
            </Button>
          </div>
        </div>
      </BlockStack>
    </div>
  );
}

export default function TemplateDetail() {
  const { template, linkedProductsData, datasets, planInfo, limits, atFieldLimit } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "products" ? 1 : 0;
  const [selectedTab, setSelectedTab] = useState(initialTab);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (actionData && 'success' in actionData && actionData.success) {
      if (typeof shopify !== 'undefined' && shopify.toast) {
        shopify.toast.show('Settings saved successfully');
      }
    }
  }, [actionData]);

  // Name state
  const [templateName, setTemplateName] = useState(template.name);

  // Field form state
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldType, setFieldType] = useState("select");
  const [fieldName, setFieldName] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldDisplayStyle, setFieldDisplayStyle] = useState("default");
  const [fieldOptionsList, setFieldOptionsList] = useState<Array<{ label: string, price: string, variantMapping: string, swatchColor: string, ssStyleId: string, ssColorAlias: string }>>([]);
  const [fieldModalTab, setFieldModalTab] = useState(0);
  const [ssImportStyleId, setSsImportStyleId] = useState("");
  const [ssImportLoading, setSsImportLoading] = useState(false);

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

  // View state
  const [isClient, setIsClient] = useState(false);
  const [localFields, setLocalFields] = useState<any[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const saveRulesRef = React.useRef<(() => void) | null>(null);

  // Dataset modal state
  const [showDatasetForm, setShowDatasetForm] = useState(false);
  const [editingDatasetId, setEditingDatasetId] = useState<string | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [datasetLabel, setDatasetLabel] = useState("");
  const [datasetType, setDatasetType] = useState("select");
  const [datasetOptionsStr, setDatasetOptionsStr] = useState("");

  const resetDatasetForm = () => {
    setShowDatasetForm(false);
    setEditingDatasetId(null);
    setDatasetName("");
    setDatasetLabel("");
    setDatasetType("select");
    setDatasetOptionsStr("");
  };

  const handleSaveDataset = async () => {
    // Save dataset via form submission
    const formData = new FormData();
    formData.append("_intent", "saveDataset");
    formData.append("datasetName", datasetName);
    formData.append("datasetLabel", datasetLabel);
    formData.append("datasetType", datasetType);
    formData.append("datasetOptions", datasetOptionsStr);
    if (editingDatasetId) formData.append("datasetId", editingDatasetId);
    
    await fetch(window.location.href, {
      method: "POST",
      body: formData,
    });
    resetDatasetForm();
    window.location.reload();
  };

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Cmd/Ctrl+S shortcut — triggers Save Rules Tree when on Rules tab
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's' && selectedTab === 2) {
        e.preventDefault();
        saveRulesRef.current?.();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedTab]);

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
    setFieldDisplayStyle("default");
    setFieldOptionsList([]);
    setFieldModalTab(0);
    setSsImportStyleId("");
  };

  const handleAddFieldClick = (type = "select") => {
    resetFieldForm();
    setFieldType(type);
    setShowFieldForm(true);
  };

  const handleEditFieldClick = (field: any) => {
    setEditingFieldId(field.id);
    setFieldType(field.type);
    setFieldName(field.name);
    setFieldLabel(field.label);
    setFieldRequired(field.required);
    setFieldDisplayStyle(field.displayStyle || "default");

    // Map existing JSON options and pricing back to UI state
    const initialOptions = field.optionsJson
      ? field.optionsJson.map((opt: string) => ({
        label: opt,
        price: field.priceAdjustmentsJson?.[opt] ? String(field.priceAdjustmentsJson[opt]) : "",
        variantMapping: field.variantMappingJson?.[opt] ? String(field.variantMappingJson[opt]) : "",
        swatchColor: field.swatchesJson?.[opt] ? String(field.swatchesJson[opt]) : "#000000",
        ssStyleId: field.ssStyleMappingJson?.[opt] ? String(field.ssStyleMappingJson[opt]) : "",
        ssColorAlias: field.ssColorAliasJson?.[opt] ? String(field.ssColorAliasJson[opt]) : ""
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
        fieldDisplayStyle,
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

  // Datasets are managed globally on the dashboard now.
  // We only load datasets to use them in the Rule builder dropdowns.

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
              atFieldLimit ? (
                <Banner
                  tone="warning"
                  title={`Free plan limit: ${limits.maxFieldsPerTemplate} fields per template`}
                  action={{ content: "Upgrade to Pro", url: "/app/billing" }}
                >
                  <Text as="p">Upgrade to Pro for unlimited fields, conditional rules, datasets, and more.</Text>
                </Banner>
              ) : (
                <Button onClick={handleAddFieldClick}>Add Option Set</Button>
              )
            )}
          </InlineGrid>

        </BlockStack>
      </Card>

      {/* Compute the set of field IDs that are auto-managed by datasets (hidden from this tab) */}
      {(() => {
        const datasetManagedFieldIds = new Set(
          (template.rules || []).filter((r: any) => r.actionType === 'LIMIT_OPTIONS_DATASET').map((r: any) => r.targetFieldId)
        );
        const editableFields = template.fields.filter((f: any) => !datasetManagedFieldIds.has(f.id));

        return editableFields.length === 0 ? (
          <Card>
            <BlockStack gap="400">
              <Text as="h3" variant="headingMd">No Option Sets Yet</Text>
              <Text as="p" tone="subdued">Add your first custom option to this template. Choose a common type below to get started quickly.</Text>
              <InlineGrid columns={2} gap="400">
                <Button onClick={() => handleAddFieldClick('text')} variant="secondary" textAlign="left">
                  <BlockStack gap="100">
                    <Text as="p" fontWeight="bold">✏️ Text Input</Text>
                    <Text as="p" tone="subdued" variant="bodySm">For names, monograms, or short messages.</Text>
                  </BlockStack>
                </Button>
                <Button onClick={() => handleAddFieldClick('select')} variant="secondary" textAlign="left">
                  <BlockStack gap="100">
                    <Text as="p" fontWeight="bold">▼ Dropdown</Text>
                    <Text as="p" tone="subdued" variant="bodySm">For selecting one option from a list.</Text>
                  </BlockStack>
                </Button>
                <Button onClick={() => handleAddFieldClick('radio')} variant="secondary" textAlign="left">
                  <BlockStack gap="100">
                    <Text as="p" fontWeight="bold">🔘 Radio Buttons</Text>
                    <Text as="p" tone="subdued" variant="bodySm">For selecting one option where all choices are visible.</Text>
                  </BlockStack>
                </Button>
                <Button onClick={() => handleAddFieldClick('checkbox')} variant="secondary" textAlign="left">
                  <BlockStack gap="100">
                    <Text as="p" fontWeight="bold">☑️ Checkboxes</Text>
                    <Text as="p" tone="subdued" variant="bodySm">For selecting multiple add-ons or options.</Text>
                  </BlockStack>
                </Button>
              </InlineGrid>
            </BlockStack>
          </Card>
        ) : (
          <Card>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEndFields}
            >
              <SortableContext items={editableFields.map((f: any) => f.id)} strategy={verticalListSortingStrategy}>
                <BlockStack gap="200">
                  {editableFields.map((field: any) => (
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
        );
      })()}
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
            <Button variant="primary" onClick={async () => {
              if (typeof shopify !== 'undefined' && shopify.resourcePicker) {
                 const selected = await shopify.resourcePicker({
                    type: 'product',
                    action: 'select',
                    multiple: true
                 });
                 if (selected && selected.length > 0) {
                    const ids = selected.map((p: any) => p.id);
                    submit({ _intent: "linkProducts", productIds: JSON.stringify(ids) }, { method: "post" });
                 }
              }
            }}>
              Manage Product Links
            </Button>
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
                    <InlineStack gap="200">
                      <Link to={`/app/templates/${template.id}/products/${numericProductId}`} style={{ textDecoration: 'none' }}>
                        <Button>Edit Overrides</Button>
                      </Link>
                      <Form method="post">
                        <input type="hidden" name="_intent" value="unlinkProduct" />
                        <input type="hidden" name="productGid" value={product.id} />
                        <Button submit tone="critical">
                          Unlink
                        </Button>
                      </Form>
                    </InlineStack>
                  </InlineStack>
                </ResourceItem>
              );
            }}
          />
        </Card>
      )}
    </BlockStack>
  );

  const RulesView = !limits.hasRules ? (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">🔒 Pro Feature: Conditional Rules</Text>
        <Text as="p" tone="subdued">
          Conditional rules let you show, hide, or limit options based on what customers select —
          for example, "Show Gift Message field only if Gift Wrap is checked".
          Available on the Pro plan.
        </Text>
        <InlineStack align="start">
          <Link to="/app/billing" style={{ textDecoration: "none" }}>
            <Button variant="primary">Upgrade to Pro — $9.99/mo</Button>
          </Link>
        </InlineStack>
      </BlockStack>
    </Card>
  ) : (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <InlineGrid columns="1fr auto">
            <BlockStack gap="200">
              <Text as="h3" variant="headingMd">
                Rules Editor
              </Text>
              
              <Card background="bg-surface-secondary">
                <BlockStack gap="200">
                  <Text as="h4" variant="headingSm">💡 How Rules Work:</Text>
                  <Text as="p" variant="bodyMd">
                    Rules allow you to conditionally show, hide, or limit options based on what the customer selects.<br />
                    For example: <em>"IF [Shirt Size] is [4XL], THEN [Hide] the [Gift Wrap] option."</em>
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>Step 1:</strong> Option Sets with no incoming connections are unconditionally visible.<br />
                    <strong>Step 2:</strong> Click and drag from an orange port to a blue target port to create a dependency.<br />
                    <strong>Step 3:</strong> You can attach a Global Dataset constraint using the select box next to the Option Set name.
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
          </InlineGrid>

          {template.fields.length < 2 && (
            <Banner tone="info">
              You need at least 2 fields to create cascading rules.
            </Banner>
          )}
        </BlockStack>
      </Card>

    </BlockStack>
  ); // end Pro RulesView branch

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

      <InlineGrid columns={2} gap="200">
        <Button onClick={handleSaveAppearance} variant="primary">
          Save Appearance
        </Button>
      </InlineGrid>
    </BlockStack>
  );

  return (
    <Page
      fullWidth
      backAction={{ content: "Templates", url: "/app?tab=templates" }}
      title={template.name}
      secondaryActions={[
        {
          content: "Duplicate Template",
          onAction: () => {
            if (confirm(`Duplicate "${template.name}"? A copy will be created with all fields and rules.`)) {
              submit({ _intent: "duplicateTemplate" }, { method: "post" });
            }
          },
        },
        {
          content: "Delete Template",
          destructive: true,
          onAction: handleDeleteTemplate,
        },
      ]}
    >
      <Layout>
        <Layout.Section>
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
                { id: "fields", content: "Option Sets", badge: String(template.fields.filter((f: any) => !template.rules.some((r: any) => r.actionType === 'LIMIT_OPTIONS_DATASET' && r.targetFieldId === f.id)).length) },
                { id: "products", content: "Linked Products", badge: String(template.links.length) },
                { id: "rules", content: "Rules Editor", badge: String(template.rules.length) },
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
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <div style={{ position: 'sticky', top: '1rem' }}>
            <Card>
              <BlockStack gap="400">
                <Text variant="headingMd" as="h2">Live Preview</Text>
                <Divider />
                <StatefulLivePreview template={template} datasets={datasets} appearance={{ fontFamily, fontSize, fontWeight, textColor, backgroundColor, borderColor, borderRadius, padding, hoverBackgroundColor, hoverTextColor }} />
              </BlockStack>
            </Card>
          </div>
        </Layout.Section>
      </Layout>

      {selectedTab === 2 && template.fields.length >= 2 && (
        <div style={{ marginTop: '2rem' }}>
          <CanvasRuleBuilder
            fields={[...template.fields, ...localFields]}
            rules={template.rules}
            datasets={datasets}
            lastSavedAt={lastSavedAt}
            onRegisterSaveRef={(fn) => { saveRulesRef.current = fn; }}
            onAddNewField={handleAddFieldClick}
            onEditField={(fieldId) => {
              const field = template.fields.find(f => f.id === fieldId);
              if (field) handleEditFieldClick(field);
            }}
            onSaveRules={(newRules, fieldSortOrder) => {
              submit(
                {
                  _intent: "bulkSaveRules",
                  rulesJson: JSON.stringify(newRules),
                  newFieldsJson: JSON.stringify(localFields),
                  fieldSortOrderJson: JSON.stringify(fieldSortOrder || [])
                },
                { method: "post" }
              );
              setLocalFields([]); // Reset on save
              setLastSavedAt(new Date());
            }}
          />
        </div>
      )}

      <Modal
        open={showFieldForm}
        onClose={resetFieldForm}
        title={editingFieldId ? "Edit Option Set" : "New Option Set"}
        primaryAction={{
          content: editingFieldId ? "Save Option Set" : "Add Option Set",
          onAction: handleSaveField,
          disabled: !fieldName || !fieldLabel,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: resetFieldForm,
          },
        ]}
        large
      >
        <Tabs
          tabs={[
            { id: "basic-info", content: "Basic Info", accessibilityLabel: "Basic Info", panelID: "basic-info-panel" },
            { id: "options", content: "Options & Values", accessibilityLabel: "Options and Values", panelID: "options-panel" },
            { id: "display", content: "Display Settings", accessibilityLabel: "Display Settings", panelID: "display-panel" },
          ]}
          selected={fieldModalTab}
          onSelect={setFieldModalTab}
        >
          <Box padding="400">
            {fieldModalTab === 0 && (
              <BlockStack gap="400">
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
                <Checkbox
                  label="Required field"
                  checked={fieldRequired}
                  onChange={setFieldRequired}
                />
              </BlockStack>
            )}
            {fieldModalTab === 1 && (
              <BlockStack gap="400">
                {["select", "radio", "checkbox"].includes(fieldType) ? (
                  <BlockStack gap="300">
                    <Text as="h5" variant="headingSm">Options, Pricing & Shopify Variant Sync</Text>
                    <Text as="p" tone="subdued" variant="bodySm">Specify your options. If an option costs extra, enter the additional amount in the Price Adjustment field (this is added on top of the item's base price).</Text>
                    <Banner tone="warning">
                      <Text as="p">
                        ⚠️ <strong>Note:</strong> To ensure additional costs are automatically added to the cart, make sure you have enabled the <strong>"VariantIQ Cart Sync" App Embed</strong> in your theme settings.
                      </Text>
                    </Banner>
                    {fieldOptionsList.map((opt, index) => (
                      <div key={index} style={{ border: '1px solid var(--p-color-border-subdued)', borderRadius: '8px', padding: '8px', marginBottom: '4px' }}>
                        <InlineGrid columns="1fr 100px 170px auto" gap="200" alignItems="center">
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
                            placeholder="Variant ID"
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
                                    let variantIdStr = selected[0].variants[0]?.id;
                                    if (variantIdStr) {
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
                        <div style={{ marginTop: '4px', paddingLeft: '4px' }}>
                          <InlineGrid columns="1fr 1fr" gap="200">
                            <TextField
                              labelHidden
                              label={`S&S Style # for ${opt.label || 'option'}`}
                              value={opt.ssStyleId}
                              onChange={(val) => {
                                const newList = [...fieldOptionsList];
                                newList[index].ssStyleId = val;
                                setFieldOptionsList(newList);
                              }}
                              placeholder="S&S Style # (e.g., 00606)"
                              autoComplete="off"
                              prefix="🏷️"
                            />
                            <TextField
                              labelHidden
                              label={`S&S Color Alias for ${opt.label || 'option'}`}
                              value={opt.ssColorAlias}
                              onChange={(val) => {
                                const newList = [...fieldOptionsList];
                                newList[index].ssColorAlias = val;
                                setFieldOptionsList(newList);
                              }}
                              placeholder="S&S Color Name (override)"
                              autoComplete="off"
                              prefix="🎨"
                            />
                          </InlineGrid>
                        </div>
                      </div>

                    ))}
                    <InlineStack gap="200">
                      <Button onClick={() => setFieldOptionsList([...fieldOptionsList, { label: "", price: "", variantMapping: "", swatchColor: "#000000", ssStyleId: "", ssColorAlias: "" }])}>
                        Add Option
                      </Button>
                    </InlineStack>

                    {/* Import from S&S */}
                    <div style={{ border: '1px solid var(--p-color-border-info)', borderRadius: '8px', padding: '12px', background: 'var(--p-color-bg-surface-info-hover, #f0f6ff)' }}>
                      <BlockStack gap="200">
                        <Text as="h6" variant="headingSm">🔗 Import from S&S Activewear</Text>
                        <Text as="p" variant="bodySm" tone="subdued">Enter an S&S Style # to auto-import colors or sizes as options. You can import from multiple styles — duplicates are skipped.</Text>
                        <InlineStack gap="200" blockAlign="center">
                          <div style={{ width: '140px' }}>
                            <TextField
                              label="S&S Style #"
                              labelHidden
                              value={ssImportStyleId}
                              onChange={setSsImportStyleId}
                              placeholder="e.g., 00606"
                              autoComplete="off"
                            />
                          </div>
                          <Button
                            size="slim"
                            disabled={!ssImportStyleId.trim() || ssImportLoading}
                            loading={ssImportLoading}
                            onClick={async () => {
                              setSsImportLoading(true);
                              try {
                                const resp = await fetch(`/api/ss-inventory?shop=__internal__&styleId=${encodeURIComponent(ssImportStyleId.trim())}`);
                                const data = await resp.json();
                                if (data.error) {
                                  alert(`S&S Error: ${data.error}`);
                                  setSsImportLoading(false);
                                  return;
                                }
                                const items = data.items || [];
                                const existingLabels = new Set(fieldOptionsList.map(o => o.label.trim().toLowerCase()));
                                const colorSet = new Set<string>();
                                items.forEach((item: any) => {
                                  if (item.color && !colorSet.has(item.color)) {
                                    colorSet.add(item.color);
                                  }
                                });
                                const newOptions = Array.from(colorSet)
                                  .filter(c => !existingLabels.has(c.toLowerCase()))
                                  .sort()
                                  .map(c => ({ label: c, price: "", variantMapping: "", swatchColor: "#000000", ssStyleId: "", ssColorAlias: "" }));
                                if (newOptions.length > 0) {
                                  setFieldOptionsList(prev => [...prev.filter(o => o.label.trim() !== ''), ...newOptions]);
                                  if (typeof shopify !== 'undefined' && shopify.toast) {
                                    shopify.toast.show(`Imported ${newOptions.length} colors`);
                                  }
                                } else {
                                  if (typeof shopify !== 'undefined' && shopify.toast) {
                                    shopify.toast.show('No new colors to import');
                                  }
                                }
                              } catch (e) {
                                alert(`Import failed: ${e}`);
                              }
                              setSsImportLoading(false);
                            }}
                          >
                            🎨 Import Colors
                          </Button>
                          <Button
                            size="slim"
                            disabled={!ssImportStyleId.trim() || ssImportLoading}
                            loading={ssImportLoading}
                            onClick={async () => {
                              setSsImportLoading(true);
                              try {
                                const resp = await fetch(`/api/ss-inventory?shop=__internal__&styleId=${encodeURIComponent(ssImportStyleId.trim())}`);
                                const data = await resp.json();
                                if (data.error) {
                                  alert(`S&S Error: ${data.error}`);
                                  setSsImportLoading(false);
                                  return;
                                }
                                const items = data.items || [];
                                const existingLabels = new Set(fieldOptionsList.map(o => o.label.trim().toLowerCase()));
                                const sizeOrder = ['YXS','YS','YM','YL','YXL','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'];
                                const sizeSet = new Set<string>();
                                items.forEach((item: any) => {
                                  if (item.size && !sizeSet.has(item.size)) {
                                    sizeSet.add(item.size);
                                  }
                                });
                                const newOptions = Array.from(sizeSet)
                                  .filter(s => !existingLabels.has(s.toLowerCase()))
                                  .sort((a, b) => {
                                    const ai = sizeOrder.indexOf(a);
                                    const bi = sizeOrder.indexOf(b);
                                    if (ai !== -1 && bi !== -1) return ai - bi;
                                    if (ai !== -1) return -1;
                                    if (bi !== -1) return 1;
                                    return a.localeCompare(b);
                                  })
                                  .map(s => ({ label: s, price: "", variantMapping: "", swatchColor: "#000000", ssStyleId: "", ssColorAlias: "" }));
                                if (newOptions.length > 0) {
                                  setFieldOptionsList(prev => [...prev.filter(o => o.label.trim() !== ''), ...newOptions]);
                                  if (typeof shopify !== 'undefined' && shopify.toast) {
                                    shopify.toast.show(`Imported ${newOptions.length} sizes`);
                                  }
                                } else {
                                  if (typeof shopify !== 'undefined' && shopify.toast) {
                                    shopify.toast.show('No new sizes to import');
                                  }
                                }
                              } catch (e) {
                                alert(`Import failed: ${e}`);
                              }
                              setSsImportLoading(false);
                            }}
                          >
                            📏 Import Sizes
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </div>
                  </BlockStack>
                ) : (
                  <Banner tone="info">
                    <Text as="p">The selected field type ({fieldType}) does not support predefined options. It relies on customer input.</Text>
                  </Banner>
                )}
              </BlockStack>
            )}
            {fieldModalTab === 2 && (
              <BlockStack gap="400">
                <Select
                  label="Display Style"
                  options={[
                    { label: "Default (Browser Input)", value: "default" },
                    { label: "Button Pills", value: "button_pills" },
                    { label: "Color Swatches", value: "swatches" },
                  ]}
                  value={fieldDisplayStyle}
                  onChange={(val) => setFieldDisplayStyle(val)}
                  helpText="Choose how these options appear on your storefront."
                />

                {fieldDisplayStyle === "swatches" && (
                  <BlockStack gap="400">
                    <Text as="h3" variant="headingSm">Swatch Colors</Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Pick a color for each of your options. These colors will render as clickable circle swatches.
                    </Text>
                    {fieldOptionsList.length === 0 ? (
                      <Banner tone="info">Add options in the "Options & Values" tab first.</Banner>
                    ) : (
                      <BlockStack gap="300">
                        {fieldOptionsList.map((opt, index) => (
                          <InlineGrid columns="1fr auto" gap="400" alignItems="center" key={index}>
                            <Text as="span">{opt.label || `Option ${index + 1}`}</Text>
                            <input
                              type="color"
                              value={opt.swatchColor}
                              onChange={(e) => {
                                const newList = [...fieldOptionsList];
                                newList[index].swatchColor = e.target.value;
                                setFieldOptionsList(newList);
                              }}
                              style={{ width: "40px", height: "40px", padding: 0, cursor: "pointer", border: "1px solid #c9cccf", borderRadius: "4px" }}
                            />
                          </InlineGrid>
                        ))}
                      </BlockStack>
                    )}
                  </BlockStack>
                )}
              </BlockStack>
            )}
          </Box>
        </Tabs>
      </Modal>

      <Modal
        open={showDatasetForm}
        onClose={resetDatasetForm}
        title={editingDatasetId ? "Edit Dataset" : "New Dataset"}
        primaryAction={{
          content: editingDatasetId ? "Save Dataset" : "Add Dataset",
          onAction: handleSaveDataset,
          disabled: !datasetName || !datasetOptionsStr,
        }}
        secondaryActions={[{ content: "Cancel", onAction: resetDatasetForm }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
                label="Dataset Name (Internal)"
                value={datasetName}
                onChange={setDatasetName}
                autoComplete="off"
                helpText="Identify this dataset in the rule builder (e.g., 'Nike Fall Colors')"
            />
            <TextField
                label="Public Display Name"
                value={datasetLabel}
                onChange={setDatasetLabel}
                autoComplete="off"
                helpText="The label shown to customers on the storefront"
            />
            <Select
                label="Display Type"
                options={[
                    { label: "Dropdown Select", value: "select" },
                    { label: "Radio Buttons", value: "radio" },
                    { label: "Checkboxes", value: "checkbox" }
                ]}
                value={datasetType}
                onChange={setDatasetType}
                helpText="How these options should be presented to customers"
            />
            <TextField
                label="Options (one per line)"
                value={datasetOptionsStr}
                onChange={setDatasetOptionsStr}
                multiline={12}
                autoComplete="off"
                placeholder="Red&#10;Blue&#10;Green"
                helpText="Enter each option on a new line. Empty lines and exact duplicates will be automatically ignored upon saving."
            />
          </BlockStack>
        </Modal.Section>
      </Modal>

    </Page>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let message = "Unknown error";
  if (error instanceof Response) {
    message = `${error.status}: ${error.statusText}`;
    // Try to get body text
    try { message = (error as any).data || message; } catch (_e) { }
  } else if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }
  return (
    <Page title="Template — Error" backAction={{ content: "Home", url: "/app" }}>
      <Banner tone="critical" title="Something went wrong loading the template">
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message}</pre>
      </Banner>
    </Page>
  );
}
