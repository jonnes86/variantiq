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
  Banner,
  ResourceList,
  ResourceItem,
  InlineStack,
  Checkbox,
} from "@shopify/polaris";
import { prisma } from "../db.server";
import { useState } from "react";
import { authenticate } from "../shopify.server";

// --- GraphQL Query to fetch products with pagination and optional search ---
const PRODUCTS_QUERY = `
  query GetProducts($first: Int, $after: String, $query: String, $last: Int, $before: String) {
    products(first: $first, after: $after, query: $query, last: $last, before: $before) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        endCursor
        startCursor
      }
      edges {
        node {
          id
          title
          vendor
        }
      }
    }
  }
`;

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { session, admin } = await authenticate.admin(request);
    if (!session) return redirect("/auth/login");

    const templateId = params.id!;
    if (!templateId) return redirect("/app");
    if (!prisma) throw new Error("Database connection failed");

    // Load the template including its fields, rules, and links
    const template = await prisma.template.findFirst({
      where: { id: templateId, shop: session.shop },
      include: {
        fields: { orderBy: { sort: "asc" } },
        rules: { orderBy: { sort: "asc" } },
        links: true,
      },
    });
    if (!template) {
      throw new Response("Template not found.", { status: 404 });
    }

    // Collect currently linked product GIDs
    const linkedProductIds = template.links.map((link: any) => link.productGid);

    // Parse pagination and search parameters from the URL
    const url = new URL(request.url);
    const afterCursor = url.searchParams.get("cursor");
    const beforeCursor = url.searchParams.get("before");
    const queryParam = url.searchParams.get("query") || "";

    // Determine GraphQL variables for pagination and search
    let variables: { first?: number; after?: string; last?: number; before?: string; query?: string } = {};
    if (beforeCursor) {
      // Requesting previous page
      variables.before = beforeCursor;
      variables.last = 25;
    } else {
      // First or next page
      variables.first = 25;
      if (afterCursor) {
        variables.after = afterCursor;
      }
    }
    if (queryParam) {
      variables.query = `title:*${queryParam}*`;
    }

    // Fetch products from Shopify Admin GraphQL
    const response = await admin.graphql(PRODUCTS_QUERY, { variables });
    const responseJson = await response.json();
    if (responseJson.errors) {
      console.error("GraphQL Errors:", responseJson.errors);
      throw new Error("Failed to fetch products from Shopify");
    }
    const productConnection = responseJson.data.products;
    const products = productConnection.edges.map((edge: any) => edge.node);
    const pageInfo = productConnection.pageInfo;

    return json({
      template: {
        id: template.id,
        name: template.name,
        shop: template.shop,
        fields: template.fields,
        rules: template.rules,
        links: template.links,
      },
      products,
      linkedProductIds,
      nextPageCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
      previousPageCursor: pageInfo.hasPreviousPage ? pageInfo.startCursor : null,
      query: queryParam,
      error: null,
    });
  } catch (error) {
    console.error("Products Loader Error:", error);
    if (error instanceof Response) throw error;
    return json({
      template: { id: "", name: "Error", shop: "" },
      products: [],
      linkedProductIds: [],
      nextPageCursor: null,
      previousPageCursor: null,
      query: "",
      error: "Failed to load products. Please check server logs.",
    });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    if (!session) return redirect("/auth/login");

    const templateId = params.id!;
    if (!templateId) return redirect("/app");
    if (!prisma) throw new Error("Database connection failed");

    const form = await request.formData();
    const intent = form.get("_intent") as string;

    // --- Handle Fields and Rules as before ---
    if (intent === "addRule") {
      const parentFieldId = String(form.get("parentFieldId") || "");
      const parentValue = String(form.get("parentValue") || "").trim();
      const childFieldId = String(form.get("childFieldId") || "");
      if (!parentFieldId || !parentValue || !childFieldId) {
        return json({ error: "All fields required" }, { status: 400 });
      }
      if (parentFieldId === childFieldId) {
        return json({ error: "Trigger and shown fields must be different" }, { status: 400 });
      }
      const maxRuleSort = await prisma.rule.findFirst({
        where: { templateId },
        orderBy: { sort: "desc" },
        select: { sort: true },
      });
      await prisma.rule.create({
        data: {
          templateId,
          parentFieldId,
          parentValue,
          childFieldId,
          sort: (maxRuleSort?.sort || 0) + 1,
        },
      });
      return json({ success: true });
    }

    if (intent === "deleteRule") {
      const ruleId = String(form.get("ruleId"));
      await prisma.rule.delete({ where: { id: ruleId } });
      return json({ success: true });
    }

    if (intent === "addField") {
      const type = String(form.get("type") || "");
      const name = String(form.get("name") || "").trim();
      const label = String(form.get("label") || "").trim();
      const options = String(form.get("options") || "");
      const required = form.get("required") === "true";
      if (!type || !name || !label) {
        return json({ error: "Type, name, and label are required" }, { status: 400 });
      }
      let optionsArray: string[] | null = null;
      if (["select", "radio", "checkbox"].includes(type)) {
        if (!options) {
          return json({ error: "Options are required for this field type" }, { status: 400 });
        }
        optionsArray = options.split(",").map((s) => s.trim()).filter((s) => s);
      }
      const maxFieldSort = await prisma.field.findFirst({
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
          optionsJson: optionsArray ? { set: optionsArray } : undefined,
          required,
          sort: (maxFieldSort?.sort || 0) + 1,
        },
      });
      return json({ success: true });
    }

    if (intent === "deleteField") {
      const fieldId = String(form.get("fieldId"));
      await prisma.rule.deleteMany({
        where: { OR: [{ parentFieldId: fieldId }, { childFieldId: fieldId }] },
      });
      await prisma.field.delete({ where: { id: fieldId } });
      return json({ success: true });
    }

    // --- Handle Link / Unlink via productGid ---
    if (intent === "link") {
      const productGid = String(form.get("productGid") || "");
      if (!productGid) {
        return json({ error: "Product GID is required" }, { status: 400 });
      }
      await prisma.productTemplateLink.create({
        data: { shop: session.shop, templateId, productGid },
      });
      return null;
    }

    if (intent === "unlink") {
      const productGid = String(form.get("productGid") || "");
      await prisma.productTemplateLink.deleteMany({
        where: { shop: session.shop, templateId, productGid },
      });
      return null;
    }

    return null;
  } catch (error) {
    console.error("Template Detail Action Error:", error);
    if (error instanceof Response) throw error;
    return json({ error: "Action failed" }, { status: 500 });
  }
}

export default function TemplateDetail() {
  const { template, products, linkedProductIds, nextPageCursor, previousPageCursor, query } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  const [selectedTab, setSelectedTab] = useState(0);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [parentFieldId, setParentFieldId] = useState("");
  const [parentValue, setParentValue] = useState("");
  const [childFieldId, setChildFieldId] = useState("");
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [fieldType, setFieldType] = useState("text");
  const [fieldName, setFieldName] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldOptions, setFieldOptions] = useState("");
  const [fieldRequired, setFieldRequired] = useState(false);
  // State for search query in Products tab
  const [searchQuery, setSearchQuery] = useState(query || "");

  const handleParentFieldChange = (value: string) => {
    setParentFieldId(value);
    setChildFieldId("");
  };
  const handleAddRule = () => {
    submit({ _intent: "addRule", parentFieldId, parentValue, childFieldId }, { method: "post" });
    setParentFieldId("");
    setParentValue("");
    setChildFieldId("");
    setShowRuleForm(false);
  };
  const handleAddField = () => {
    submit({
      _intent: "addField",
      type: fieldType,
      name: fieldName,
      label: fieldLabel,
      options: fieldOptions,
      required: fieldRequired.toString(),
    }, { method: "post" });
    setFieldType("text");
    setFieldName("");
    setFieldLabel("");
    setFieldOptions("");
    setFieldRequired(false);
    setShowFieldForm(false);
  };

  const RulesView = (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <InlineGrid columns={["1fr", "auto"]}>
            <Text as="h3" variant="headingMd">Cascading Rules</Text>
            {template.fields.length >= 2 && !showRuleForm && (
              <Button onClick={() => setShowRuleForm(true)}>Add Rule</Button>
            )}
          </InlineGrid>
          <Text as="p">
            Rules determine which fields appear based on previous selections.
          </Text>
          {template.fields.length < 2 && (
            <Banner tone="info">
              You need at least 2 fields to create cascading rules.
            </Banner>
          )}
          {showRuleForm && (
            <Card background="bg-surface-secondary">
              <BlockStack gap="400">
                <Text as="h4" variant="headingSm">New Rule</Text>
                <Select
                  label="Trigger Field"
                  helpText="Choose the field that controls this rule. When this field’s value matches the trigger value, it will activate the rule."
                  options={[
                    { label: "Select field", value: "" },
                    ...template.fields.map((f) => ({ label: f.label, value: f.id })),
                  ]}
                  value={parentFieldId}
                  onChange={handleParentFieldChange}
                />
                <TextField
                  label="Trigger Value"
                  helpText="Specify the value of the trigger field that will cause the other field to appear."
                  value={parentValue}
                  onChange={setParentValue}
                  autoComplete="off"
                />
                <Select
                  label="Field to Show"
                  helpText="Select the field that should be revealed when the trigger condition is met."
                  options={[
                    { label: "Select field", value: "" },
                    ...template.fields.filter((f) => f.id !== parentFieldId).map((f) => ({ label: f.label, value: f.id })),
                  ]}
                  value={childFieldId}
                  onChange={setChildFieldId}
                  disabled={!parentFieldId}
                />
                <Text as="p" variant="bodyMd">
                  Show {template.fields.find(f => f.id === childFieldId)?.label || "[Field to Show]"}{" "}
                  when {template.fields.find(f => f.id === parentFieldId)?.label || "[Trigger Field]"}{" "}
                  equals {parentValue || "[Trigger Value]"}.
                </Text>
                <InlineGrid columns={2} gap="200">
                  <Button onClick={() => setShowRuleForm(false)}>Cancel</Button>
                  <Button
                    primary
                    onClick={handleAddRule}
                    disabled={!parentFieldId || !parentValue || !childFieldId}
                  >
                    Add Rule
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
            No rules yet. Add your first rule to get started.
          </Text>
        </Card>
      ) : (
        <Card>
          <ResourceList
            resourceName={{ singular: "rule", plural: "rules" }}
            items={template.rules}
            renderItem={(rule: any) => {
              const parentField = template.fields.find((f) => f.id === rule.parentFieldId);
              const childField = template.fields.find((f) => f.id === rule.childFieldId);
              return (
                <ResourceItem id={rule.id}>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodyMd">
                      Show {childField?.label || rule.childFieldId} when {parentField?.label || rule.parentFieldId} equals {rule.parentValue}.
                    </Text>
                    <Button
                      onClick={() => submit({ _intent: "deleteRule", ruleId: rule.id }, { method: "post" })}
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

  const FieldsView = (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <InlineGrid columns={["1fr", "auto"]}>
            <Text as="h3" variant="headingMd">Fields</Text>
            {!showFieldForm && (
              <Button onClick={() => setShowFieldForm(true)}>Add Field</Button>
            )}
          </InlineGrid>
          <Text as="p">
            Add fields for this template. Fields determine the inputs shown to merchants.
          </Text>
          {showFieldForm && (
            <Card background="bg-surface-secondary">
              <BlockStack gap="400">
                <Text as="h4" variant="headingSm">New Field</Text>
                <Select
                  label="Field Type"
                  options={[
                    { label: "Text", value: "text" },
                    { label: "Select", value: "select" },
                    { label: "Radio Buttons", value: "radio" },
                    { label: "Checkboxes", value: "checkbox" },
                  ]}
                  value={fieldType}
                  onChange={setFieldType}
                />
                <TextField
                  label="Field Name (identifier)"
                  helpText="Unique identifier for this field (used in code)."
                  value={fieldName}
                  onChange={setFieldName}
                  autoComplete="off"
                />
                <TextField
                  label="Field Label"
                  helpText="Displayed label for this field."
                  value={fieldLabel}
                  onChange={setFieldLabel}
                  autoComplete="off"
                />
                {(["select", "radio", "checkbox"].includes(fieldType)) && (
                  <TextField
                    label="Options (comma separated)"
                    helpText="Specify options for select, radio, or checkbox fields."
                    value={fieldOptions}
                    onChange={setFieldOptions}
                    autoComplete="off"
                  />
                )}
                <Checkbox
                  label="Required"
                  checked={fieldRequired}
                  onChange={setFieldRequired}
                />
                <InlineGrid columns={2} gap="200">
                  <Button onClick={() => setShowFieldForm(false)}>Cancel</Button>
                  <Button
                    primary
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
            No fields yet. Add a field to get started.
          </Text>
        </Card>
      ) : (
        <Card>
          <ResourceList
            resourceName={{ singular: "field", plural: "fields" }}
            items={template.fields}
            renderItem={(field: any) => (
              <ResourceItem id={field.id}>
                <InlineStack align="space-between">
                  <BlockStack>
                    <Text as="p" variant="bodyMd">
                      {field.label} ({field.type}){field.required ? " (required)" : ""}
                    </Text>
                    {field.optionsJson && (
                      <Text as="p" tone="subdued" variant="bodySm">
                        Options: {JSON.parse(JSON.stringify(field.optionsJson)).join(", ")}
                      </Text>
                    )}
                  </BlockStack>
                  <InlineGrid columns={["auto"]} gap="100">
                    <Button
                      tone="critical"
                      onClick={() => submit({ _intent: "deleteField", fieldId: field.id }, { method: "post" })}
                    >
                      Delete
                    </Button>
                  </InlineGrid>
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
          <InlineGrid columns={["1fr", "auto"]}>
            <Text as="h3" variant="headingMd">Products</Text>
          </InlineGrid>
          <Form method="get">
            <InlineGrid columns={["3fr", "1fr"]} gap="200">
              <TextField
                name="query"
                label="Search by Title"
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Enter product title"
                autoComplete="off"
              />
              <Button primary submit>Search</Button>
            </InlineGrid>
          </Form>
        </BlockStack>
      </Card>
      <Card>
        <Text as="h2" variant="headingMd" style={{ margin: "1rem 0" }}>
          Available Products ({products.length})
        </Text>
        <ResourceList
          resourceName={{ singular: "product", plural: "products" }}
          items={products}
          renderItem={(product: any) => {
            const isLinked = linkedProductIds.includes(product.id);
            const actionVerb = isLinked ? "Unlink" : "Link";
            return (
              <ResourceItem id={product.id}>
                <InlineStack align="space-between">
                  <BlockStack>
                    <Text variant="headingMd">{product.title}</Text>
                    {product.vendor && (
                      <Text variant="bodySm" tone="subdued">{product.vendor}</Text>
                    )}
                  </BlockStack>
                  <InlineGrid columns={["auto"]} gap="100">
                    <Form method="post">
                      <input type="hidden" name="productGid" value={product.id} />
                      <Button
                        submit
                        name="_intent"
                        value={actionVerb.toLowerCase()}
                        primary={!isLinked}
                        destructive={isLinked}
                      >
                        {actionVerb}
                      </Button>
                    </Form>
                  </InlineGrid>
                </InlineStack>
              </ResourceItem>
            );
          }}
        />
        {/* Pagination Controls */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
          {previousPageCursor ? (
            <Link 
              to={`/app/templates/${template.id}?before=${previousPageCursor}${query ? `&query=${query}` : ""}`}
              style={{ textDecoration: "none" }}
            >
              <Button>Previous Page</Button>
            </Link>
          ) : (
            <Button disabled>Previous Page</Button>
          )}
          {nextPageCursor ? (
            <Link 
              to={`/app/templates/${template.id}?cursor=${nextPageCursor}${query ? `&query=${query}` : ""}`}
              style={{ textDecoration: "none" }}
            >
              <Button primary>Next Page</Button>
            </Link>
          ) : (
            <Button disabled primary>Next Page</Button>
          )}
        </div>
      </Card>
    </BlockStack>
  );

  return (
    <Page title={template.name}>
      <BlockStack gap="500">
        <Tabs
          tabs={[
            { id: "fields", content: "Fields", badge: String(template.fields.length) },
            { id: "products", content: "Products", badge: String(template.links.length) },
            { id: "rules", content: "Rules", badge: String(template.rules.length) },
          ]}
          selected={selectedTab}
          onSelect={setSelectedTab}
        />
        <div style={{ marginTop: "1rem" }}>
          {selectedTab === 0 && FieldsView}
          {selectedTab === 1 && ProductsView}
          {selectedTab === 2 && RulesView}
        </div>
      </BlockStack>
    </Page>
  );
}
