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
  Thumbnail
} from "@shopify/polaris";
import { prisma } from "../db.server";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { session, admin } = await authenticate.admin(request);
    if (!session) return redirect("/auth/login");

    const templateId = params.id;
    if (!templateId) return redirect("/app");

    const template = await prisma.template.findFirst({
      where: { id: templateId, shop: session.shop },
      include: {
        fields: { orderBy: { sort: "asc" } },
        rules: { orderBy: { sort: "asc" } },
        links: { include: { template: true } },
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

    return json({ template, linkedProductsData });
  } catch (error) {
    console.error("Loader Error:", error);
    throw new Response("Unexpected Server Error", { status: 500 });
  }
}

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
    const optionsString = String(form.get("fieldOptions") || "").trim();

    if (!type || !name || !label) {
      return json({ error: "All fields required" }, { status: 400 });
    }

    // Parse options for select/radio/checkbox
    let optionsJson = null;
    if (["select", "radio", "checkbox"].includes(type) && optionsString) {
      optionsJson = optionsString
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);
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
        data: { type, name, label, required, optionsJson: optionsJson as any }
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

  // Add rule
  if (intent === "addRule") {
    const conditionsStr = String(form.get("conditionsJson") || "[]");
    const targetFieldId = String(form.get("targetFieldId") || "");
    const actionType = String(form.get("actionType") || "SHOW");
    const targetOptionsStr = String(form.get("targetOptionsJson") || "null");

    let conditionsJson = [];
    try {
      conditionsJson = JSON.parse(conditionsStr);
    } catch (e) { }

    let targetOptionsJson = null;
    try {
      if (targetOptionsStr !== "null" && targetOptionsStr !== "") {
        targetOptionsJson = JSON.parse(targetOptionsStr);
      }
    } catch (e) { }

    if (!conditionsJson.length || !targetFieldId) {
      return json({ error: "Conditions and Target Field required" }, { status: 400 });
    }

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
        sort: (maxSort?.sort || 0) + 1,
      },
    });

    return json({ success: true });
  }

  // Delete rule
  if (intent === "deleteRule") {
    const ruleId = String(form.get("ruleId") || "");
    await prisma.rule.delete({ where: { id: ruleId } });
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
  const { template, linkedProductsData } = useLoaderData<typeof loader>();
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
  const [fieldOptions, setFieldOptions] = useState("");

  useEffect(() => {
    setTemplateName(template.name);
  }, [template.name]);

  // Appearance state
  const [fontFamily, setFontFamily] = useState(template.fontFamily || "");
  const [fontSize, setFontSize] = useState(template.fontSize || "");
  const [fontWeight, setFontWeight] = useState(template.fontWeight || "");
  const [textColor, setTextColor] = useState(template.textColor || "");
  const [backgroundColor, setBackgroundColor] = useState(
    template.backgroundColor || "",
  );
  const [borderColor, setBorderColor] = useState(template.borderColor || "");
  const [borderRadius, setBorderRadius] = useState(template.borderRadius || "");
  const [padding, setPadding] = useState(template.padding || "");
  const [hoverBackgroundColor, setHoverBackgroundColor] = useState(
    template.hoverBackgroundColor || "",
  );
  const [hoverTextColor, setHoverTextColor] = useState(
    template.hoverTextColor || "",
  );
  const [isHover, setIsHover] = useState(false);

  // Rules form state
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleConditions, setRuleConditions] = useState<Array<{ fieldId: string, operator: string, value: string }>>([]);
  const [tempCondFieldId, setTempCondFieldId] = useState("");
  const [tempCondOperator, setTempCondOperator] = useState("EQUALS");
  const [tempCondValue, setTempCondValue] = useState("");
  const [ruleTargetFieldId, setRuleTargetFieldId] = useState("");
  const [ruleActionType, setRuleActionType] = useState("SHOW");
  const [ruleTargetOptions, setRuleTargetOptions] = useState<string[]>([]);
  const [tempTargetOption, setTempTargetOption] = useState("");

  // Handlers
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
      _intent: "addRule",
      conditionsJson: JSON.stringify(ruleConditions),
      targetFieldId: ruleTargetFieldId,
      actionType: ruleActionType,
      targetOptionsJson: ruleActionType === "LIMIT_OPTIONS" ? JSON.stringify(ruleTargetOptions) : "null",
    }, { method: "post" });

    setShowRuleForm(false);
    setRuleConditions([]);
    setRuleTargetFieldId("");
    setRuleActionType("SHOW");
    setRuleTargetOptions([]);
  };

  const handleDeleteRule = (ruleId: string) => {
    if (confirm("Delete this rule?")) {
      submit({ _intent: "deleteRule", ruleId }, { method: "post" });
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
    setFieldOptions("");
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
    setFieldOptions(field.optionsJson ? field.optionsJson.join(", ") : "");
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
        fieldOptions,
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

  const getFieldLabel = (id: string) => template.fields.find(f => f.id === id)?.label || id;

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
                  <TextField
                    label="Options (comma-separated)"
                    value={fieldOptions}
                    onChange={setFieldOptions}
                    placeholder="e.g., Small, Medium, Large, XL"
                    multiline={2}
                    autoComplete="off"
                  />
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
          <ResourceList
            resourceName={{ singular: "field", plural: "fields" }}
            items={template.fields}
            renderItem={(field: any) => (
              <ResourceItem id={field.id} onClick={() => { }}>
                <InlineStack align="space-between">
                  <BlockStack gap="100">
                    <Text as="h4" variant="bodyMd" fontWeight="semibold">
                      {field.label}
                      {field.required && (
                        <Text as="span" tone="critical">
                          {" "}
                          *
                        </Text>
                      )}
                    </Text>
                    <Text as="p" tone="subdued" variant="bodySm">
                      Type: {field.type} | Name: {field.name}
                    </Text>
                    {field.optionsJson && (
                      <Text as="p" variant="bodySm">
                        Options: {field.optionsJson.join(", ")}
                      </Text>
                    )}
                  </BlockStack>
                  <InlineStack gap="200">
                    <Button onClick={() => handleEditFieldClick(field)}>
                      Edit
                    </Button>
                    <Button
                      onClick={() => handleDeleteField(field.id)}
                      tone="critical"
                    >
                      Delete
                    </Button>
                  </InlineStack>
                </InlineStack>
              </ResourceItem>
            )}
          />
        </Card>
      )}
    </BlockStack>
  );

  const ProductsView = (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <Text as="h3" variant="headingMd">
            Linked Products
          </Text>
          <Text as="p">
            {template.links.length} product(s) using this template
          </Text>
          <Link to={`/app/templates/${template.id}/products`} style={{ textDecoration: 'none' }}>
            <Button>Manage Product Links</Button>
          </Link>
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
                Cascading Rules
              </Text>
              <Text as="p">
                Build advanced logic paths to dynamically show, hide, or limit field options based on what the customer has already selected. This makes your product pages cleaner by only showing relevant options.
              </Text>
              <Card background="bg-surface-secondary">
                <BlockStack gap="200">
                  <Text as="h4" variant="headingSm">💡 How it works (Examples):</Text>

                  <Text as="p" variant="bodyMd">
                    <Text as="strong">Scenario 1 (Limiting Options):</Text><br />
                    Imagine you sell Clothing. You only want the "Size" dropdown to appear if they choose "Clothing", and if it's a "T-Shirt", you want to restrict the sizes.<br />
                    <Text as="span" fontWeight="bold">IF</Text> [Category] is "Clothing"<br />
                    <Text as="span" fontWeight="bold">AND IF</Text> [Type] is "T-Shirt"<br />
                    <Text as="span" fontWeight="bold">THEN LIMIT</Text> [Size] to only allow "S, M, L, XL"
                  </Text>

                  <Divider />

                  <Text as="p" variant="bodyMd">
                    <Text as="strong">Scenario 2 (Hiding Options):</Text><br />
                    Imagine you have a "Gift Wrap ($5)" checkbox, but it's not available for oversized items like "Furniture".<br />
                    <Text as="span" fontWeight="bold">IF</Text> [Category] is "Furniture"<br />
                    <Text as="span" fontWeight="bold">THEN HIDE</Text> [Gift Wrap]
                  </Text>
                </BlockStack>
              </Card>
            </BlockStack>
            {!showRuleForm && (
              <Button onClick={() => setShowRuleForm(true)} disabled={template.fields.length < 2}>
                Add Rule
              </Button>
            )}
          </InlineGrid>

          {template.fields.length < 2 && (
            <Banner tone="info">
              You need at least 2 fields to create cascading rules.
            </Banner>
          )}

          {showRuleForm && (
            <Card background="bg-surface-secondary">
              <BlockStack gap="500">
                <Text as="h4" variant="headingSm">New Logic Rule</Text>

                {/* Conditions Builder */}
                <BlockStack gap="300">
                  <Text as="strong" variant="bodyMd">IF (Conditions)</Text>

                  {ruleConditions.length > 0 && (
                    <InlineStack gap="200" wrap>
                      {ruleConditions.map((cond, index) => (
                        <Tag key={index} onRemove={() => handleRemoveCondition(index)}>
                          {getFieldLabel(cond.fieldId)} {cond.operator === "EQUALS" ? "=" : cond.operator} {cond.value}
                        </Tag>
                      ))}
                    </InlineStack>
                  )}

                  <InlineGrid columns="1fr 1fr 1fr auto" gap="200">
                    <Select
                      label="Field"
                      options={[{ label: "Select field...", value: "" }, ...template.fields.map(f => ({ label: f.label, value: f.id }))]}
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
                        { label: "Limit Options To", value: "LIMIT_OPTIONS" }
                      ]}
                      value={ruleActionType}
                      onChange={setRuleActionType}
                    />
                    <Select
                      label="Target Field"
                      options={[{ label: "Select field...", value: "" }, ...template.fields.map(f => ({ label: f.label, value: f.id }))]}
                      value={ruleTargetFieldId}
                      onChange={setRuleTargetFieldId}
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
                </BlockStack>

                <InlineGrid columns={2} gap="200">
                  <Button onClick={() => setShowRuleForm(false)}>
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

        </BlockStack>
      </Card>

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
              const condText = (rule.conditionsJson as Array<any>)?.map(c => `${getFieldLabel(c.fieldId)} ${c.operator === 'EQUALS' ? '=' : '!='} ${c.value}`).join(" AND ") || "No condition";
              const targetLabel = getFieldLabel(rule.targetFieldId);

              let actionText = "";
              if (rule.actionType === "SHOW") actionText = `Show ${targetLabel}`;
              else if (rule.actionType === "HIDE") actionText = `Hide ${targetLabel}`;
              else if (rule.actionType === "LIMIT_OPTIONS") {
                let opts: string[] = [];
                try { opts = rule.targetOptionsJson as string[]; } catch (e) { }
                actionText = `Limit ${targetLabel} to [${opts?.join(", ")}]`;
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
                    <Button
                      onClick={() => handleDeleteRule(rule.id)}
                      tone="critical"
                    >
                      Delete
                    </Button>
                  </InlineStack>
                </ResourceItem>
              );
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
      backAction={{ content: "Templates", url: "/app" }}
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
