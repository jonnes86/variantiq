import {
  json,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useSubmit, Form, Link } from "@remix-run/react";
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
} from "@shopify/polaris";
import { prisma } from "../db.server";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
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

    return json({ template });
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

  // Add field
  if (intent === "addField") {
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

    // Get max sort order
    const maxSort = await prisma.field.findFirst({
      where: { templateId },
      orderBy: { sort: "desc" },
      select: { sort: true },
    });

    await prisma.field.create({
      data: {
        templateId,
        type,
        name,
        label,
        required,
        optionsJson: optionsJson as any,
        sort: (maxSort?.sort || 0) + 1,
      },
    });

    return json({ success: true });
  }

  // Delete field
  if (intent === "deleteField") {
    const fieldId = String(form.get("fieldId") || "");
    await prisma.field.delete({ where: { id: fieldId } });
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
  const { template } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [selectedTab, setSelectedTab] = useState(0);

  // Name state
  const [templateName, setTemplateName] = useState(template.name);

  // Field form state
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [fieldType, setFieldType] = useState("text");
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

  // Handlers
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

  const handleAddField = () => {
    submit(
      {
        _intent: "addField",
        fieldType,
        fieldName,
        fieldLabel,
        fieldRequired: String(fieldRequired),
        fieldOptions,
      },
      { method: "post" }
    );

    setFieldName("");
    setFieldLabel("");
    setFieldRequired(false);
    setFieldOptions("");
    setShowFieldForm(false);
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

  // Views
  const FieldsView = (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <InlineGrid columns="1fr auto">
            <Text as="h3" variant="headingMd">
              Template Fields
            </Text>
            {!showFieldForm && (
              <Button onClick={() => setShowFieldForm(true)}>Add Field</Button>
            )}
          </InlineGrid>

          {showFieldForm && (
            <Card background="bg-surface-secondary">
              <BlockStack gap="400">
                <Text as="h4" variant="headingSm">
                  New Field
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
                  <Button onClick={() => setShowFieldForm(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleAddField}
                    disabled={!fieldName || !fieldLabel}
                  >
                    Add Field
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
                  <Button
                    onClick={() => handleDeleteField(field.id)}
                    tone="critical"
                  >
                    Delete
                  </Button>
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

      {template.links.length > 0 && (
        <Card>
          <ResourceList
            resourceName={{ singular: "product", plural: "products" }}
            items={template.links}
            renderItem={(link: any) => (
              <ResourceItem id={link.id} onClick={() => { }}>
                <Text as="p">{link.productGid}</Text>
              </ResourceItem>
            )}
          />
        </Card>
      )}
    </BlockStack>
  );

  const RulesView = (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <Text as="h3" variant="headingMd">
            Cascading Rules
          </Text>
          <Text as="p">
            Rules determine which fields appear based on previous selections.
          </Text>
          {template.fields.length < 2 && (
            <Banner tone="info">
              You need at least 2 fields to create cascading rules.
            </Banner>
          )}
        </BlockStack>
      </Card>

      {template.rules.length === 0 ? (
        <Card>
          <Text as="p" tone="subdued">
            No rules yet. Coming soon: visual rule builder.
          </Text>
        </Card>
      ) : (
        <Card>
          <ResourceList
            resourceName={{ singular: "rule", plural: "rules" }}
            items={template.rules}
            renderItem={(rule: any) => (
              <ResourceItem id={rule.id} onClick={() => { }}>
                <Text as="p">
                  When {rule.parentFieldId} = {rule.parentValue}, show{" "}
                  {rule.childFieldId}
                </Text>
              </ResourceItem>
            )}
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
            <Text as="h3" variant="headingMd">
              Appearance
            </Text>
          </InlineGrid>
          <Text as="p">
            Customize the button’s appearance by setting each style below.
          </Text>
          <TextField
            label="Font Family"
            value={fontFamily}
            onChange={setFontFamily}
            placeholder="e.g. Arial"
            autoComplete="off"
          />
          <TextField
            label="Font Size"
            value={fontSize}
            onChange={setFontSize}
            placeholder="e.g. 16px"
            autoComplete="off"
          />
          <TextField
            label="Font Weight"
            value={fontWeight}
            onChange={setFontWeight}
            placeholder="e.g. bold"
            autoComplete="off"
          />
          <TextField
            label="Text Color"
            value={textColor}
            onChange={setTextColor}
            placeholder="#ffffff"
            autoComplete="off"
          />
          <TextField
            label="Background Color"
            value={backgroundColor}
            onChange={setBackgroundColor}
            placeholder="#0000ff"
            autoComplete="off"
          />
          <TextField
            label="Border Color"
            value={borderColor}
            onChange={setBorderColor}
            placeholder="#cccccc"
            autoComplete="off"
          />
          <TextField
            label="Border Radius"
            value={borderRadius}
            onChange={setBorderRadius}
            placeholder="e.g. 4px"
            autoComplete="off"
          />
          <TextField
            label="Padding"
            value={padding}
            onChange={setPadding}
            placeholder="e.g. 8px 16px"
            autoComplete="off"
          />
          <TextField
            label="Hover Background Color"
            value={hoverBackgroundColor}
            onChange={setHoverBackgroundColor}
            placeholder="#0055aa"
            autoComplete="off"
          />
          <TextField
            label="Hover Text Color"
            value={hoverTextColor}
            onChange={setHoverTextColor}
            placeholder="#ffffff"
            autoComplete="off"
          />
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
            style={{ display: "inline-block" }}
          >
            <Button
              style={{
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

export function ErrorBoundary({ error }: { error: Error }) {
  console.error(error);
  return (
    <Page title="App Error">
      <Text tone="critical" as="p">Something went wrong: {error.message}</Text>
    </Page>
  );
}
