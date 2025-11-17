import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, useSubmit } from "@remix-run/react";
import { Page, Card, TextField, Button, BlockStack, ButtonGroup, Select, Checkbox, Badge, InlineStack, Text, Divider, Tabs, ResourceList, ResourceItem, Banner } from "@shopify/polaris";
import { DeleteIcon, EditIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { useState, useEffect, useCallback } from "react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  
  const template = await prisma.template.findFirst({
    where: { id: params.id!, shop: session.shop },
    include: {
      fields: { orderBy: { sort: 'asc' } },
      rules: { orderBy: { sort: 'asc' } },
      links: true
    },
  });
  
  if (!template) throw new Response("Not found", { status: 404 });

  // Fetch products for the Products tab
  const hasReadProducts = session.scope?.includes('read_products');
  let products = [];
  let productsError = null;

  if (hasReadProducts) {
    try {
      const response = await admin.graphql(`
        query {
          products(first: 50) {
            nodes {
              id
              title
              handle
              featuredImage {
                url
              }
            }
          }
        }
      `);
      const { data } = await response.json();
      products = data.products.nodes;
    } catch (error: any) {
      productsError = error.message;
    }
  }

  return json({ 
    template,
    products,
    productsError,
    hasReadProducts,
    currentScope: session.scope
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");

  if (intent === "rename") {
    const name = String(form.get("name") || "").trim();
    if (name) await prisma.template.update({ where: { id: params.id! }, data: { name } });
    return redirect(`/app/templates/${params.id}`);
  }

  if (intent === "delete") {
    await prisma.template.delete({ where: { id: params.id! } });
    return redirect("/app/templates");
  }

  if (intent === "addField") {
    const type = String(form.get("type"));
    const name = String(form.get("fieldName") || "").trim();
    const label = String(form.get("label") || "").trim();
    const required = form.get("required") === "true";
    const optionsRaw = form.get("options");
    
    let optionsJson = null;
    if (optionsRaw && String(optionsRaw).trim() && String(optionsRaw) !== "[]") {
      try {
        optionsJson = JSON.parse(String(optionsRaw));
      } catch (e) {
        console.error("Failed to parse options:", e);
      }
    }

    if (name && label) {
      const maxSort = await prisma.field.findFirst({
        where: { templateId: params.id! },
        orderBy: { sort: 'desc' },
        select: { sort: true }
      });

      await prisma.field.create({
        data: {
          templateId: params.id!,
          type,
          name,
          label,
          required,
          optionsJson,
          sort: (maxSort?.sort || 0) + 1
        }
      });
    }
    return redirect(`/app/templates/${params.id}`);
  }

  if (intent === "deleteField") {
    const fieldId = String(form.get("fieldId"));
    await prisma.field.delete({ where: { id: fieldId } });
    return redirect(`/app/templates/${params.id}`);
  }

  if (intent === "updateField") {
    const fieldId = String(form.get("fieldId"));
    const label = String(form.get("label") || "").trim();
    const required = form.get("required") === "true";
    const optionsRaw = form.get("options");
    
    let optionsJson = null;
    if (optionsRaw && String(optionsRaw).trim() && String(optionsRaw) !== "[]") {
      try {
        optionsJson = JSON.parse(String(optionsRaw));
      } catch (e) {
        console.error("Failed to parse options JSON:", e);
      }
    }

    await prisma.field.update({
      where: { id: fieldId },
      data: { label, required, optionsJson }
    });
    return redirect(`/app/templates/${params.id}`);
  }

  if (intent === "linkProduct") {
    const productGid = String(form.get("productGid"));
    const existing = await prisma.productTemplateLink.findFirst({
      where: { productGid, templateId: params.id! }
    });

    if (!existing) {
      await prisma.productTemplateLink.create({
        data: {
          shop: session.shop,
          productGid,
          templateId: params.id!,
        }
      });
    }
    return redirect(`/app/templates/${params.id}`);
  }

  if (intent === "unlinkProduct") {
    const productGid = String(form.get("productGid"));
    await prisma.productTemplateLink.deleteMany({
      where: { productGid, templateId: params.id! }
    });
    return redirect(`/app/templates/${params.id}`);
  }

  return redirect(`/app/templates/${params.id}`);
}

export default function TemplateDetail() {
  const { template, products, productsError, hasReadProducts, currentScope } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [selectedTab, setSelectedTab] = useState(0);
  const [showAddField, setShowAddField] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState(template.name);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    setTemplateName(template.name);
  }, [template.name]);

  const handleTabChange = useCallback((selectedTabIndex: number) => {
    setSelectedTab(selectedTabIndex);
  }, []);

  const tabs = [
    {
      id: 'fields',
      content: 'Fields',
      panelID: 'fields-panel',
    },
    {
      id: 'products',
      content: 'Products',
      panelID: 'products-panel',
    },
    {
      id: 'rules',
      content: 'Rules',
      panelID: 'rules-panel',
    },
  ];

  const linkedProductIds = template.links.map((link: any) => link.productGid);
  const filteredProducts = products.filter((p: any) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Page
      title={template.name}
      backAction={{ url: "/app/templates" }}
    >
      <BlockStack gap="400">
        {/* Template Settings */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Template Settings</Text>
            <Form method="post">
              <BlockStack gap="300">
                <TextField
                  label="Template name"
                  name="name"
                  value={templateName}
                  onChange={setTemplateName}
                  autoComplete="off"
                />
                <InlineStack gap="200">
                  <Button 
                    submit 
                    name="_intent" 
                    value="rename"
                    disabled={!templateName.trim() || templateName === template.name}
                  >
                    Save Changes
                  </Button>
                  <Button tone="critical" variant="secondary" submit name="_intent" value="delete">
                    Delete Template
                  </Button>
                </InlineStack>
              </BlockStack>
            </Form>
          </BlockStack>
        </Card>

        {/* Tabs */}
        <Card>
          <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
            {/* Fields Tab */}
            {selectedTab === 0 && (
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">Fields ({template.fields.length})</Text>
                  <Button onClick={() => setShowAddField(!showAddField)}>
                    {showAddField ? "Cancel" : "Add Field"}
                  </Button>
                </InlineStack>

                {showAddField && <AddFieldForm />}

                <Divider />

                {template.fields.length === 0 ? (
                  <Text as="p" tone="subdued">No fields yet. Add your first field to start collecting custom data.</Text>
                ) : (
                  <BlockStack gap="300">
                    {template.fields.map((field: any) => (
                      <Card key={field.id}>
                        {editingField === field.id ? (
                          <EditFieldForm field={field} onCancel={() => setEditingField(null)} />
                        ) : (
                          <InlineStack align="space-between">
                            <BlockStack gap="100">
                              <InlineStack gap="200" blockAlign="center">
                                <Text as="h3" variant="headingSm">{field.label}</Text>
                                <Badge tone={field.required ? "attention" : "info"}>
                                  {field.type}
                                </Badge>
                                {field.required && <Badge tone="critical">Required</Badge>}
                              </InlineStack>
                              <Text as="p" tone="subdued">Field name: {field.name}</Text>
                              {field.optionsJson && (
                                <Text as="p" tone="subdued">
                                  Options: {(field.optionsJson as string[]).join(", ")}
                                </Text>
                              )}
                            </BlockStack>
                            <ButtonGroup>
                              <Button icon={EditIcon} onClick={() => setEditingField(field.id)} />
                              <Form method="post">
                                <input type="hidden" name="fieldId" value={field.id} />
                                <Button
                                  icon={DeleteIcon}
                                  tone="critical"
                                  submit
                                  name="_intent"
                                  value="deleteField"
                                />
                              </Form>
                            </ButtonGroup>
                          </InlineStack>
                        )}
                      </Card>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            )}

            {/* Products Tab */}
            {selectedTab === 1 && (
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Linked Products</Text>

                {!hasReadProducts && (
                  <Banner tone="critical">
                    <p><strong>Missing Permission:</strong> This app needs the "read_products" permission.</p>
                    <p style={{ marginTop: '8px' }}>Current scopes: {currentScope || 'none'}</p>
                  </Banner>
                )}

                {productsError && (
                  <Banner tone="critical">
                    <p><strong>Error loading products:</strong> {productsError}</p>
                  </Banner>
                )}

                {hasReadProducts && !productsError && (
                  <>
                    <Text as="p" tone="subdued">
                      This template is linked to {linkedProductIds.length} product{linkedProductIds.length !== 1 ? 's' : ''}.
                      Select which products should use this template.
                    </Text>

                    <TextField
                      label="Search products"
                      value={searchQuery}
                      onChange={setSearchQuery}
                      placeholder="Search by product name..."
                      autoComplete="off"
                      clearButton
                      onClearButtonClick={() => setSearchQuery("")}
                    />

                    {filteredProducts.length > 0 ? (
                      <ResourceList
                        resourceName={{ singular: 'product', plural: 'products' }}
                        items={filteredProducts}
                        renderItem={(product: any) => {
                          const isLinked = linkedProductIds.includes(product.id);
                          
                          return (
                            <ResourceItem
                              id={product.id}
                              media={
                                product.featuredImage ? (
                                  <img 
                                    src={product.featuredImage.url} 
                                    alt={product.title}
                                    style={{ width: 50, height: 50, objectFit: 'cover' }}
                                  />
                                ) : undefined
                              }
                            >
                              <InlineStack align="space-between">
                                <BlockStack gap="100">
                                  <Text as="h3" variant="bodyMd" fontWeight="semibold">
                                    {product.title}
                                  </Text>
                                  <Text as="p" tone="subdued">
                                    {product.handle}
                                  </Text>
                                </BlockStack>
                                <Form method="post">
                                  <input type="hidden" name="productGid" value={product.id} />
                                  {isLinked ? (
                                    <InlineStack gap="200">
                                      <Badge tone="success">Linked</Badge>
                                      <Button 
                                        submit 
                                        name="_intent" 
                                        value="unlinkProduct"
                                        tone="critical"
                                      >
                                        Unlink
                                      </Button>
                                    </InlineStack>
                                  ) : (
                                    <Button submit name="_intent" value="linkProduct">
                                      Link Template
                                    </Button>
                                  )}
                                </Form>
                              </InlineStack>
                            </ResourceItem>
                          );
                        }}
                      />
                    ) : (
                      <Text as="p" tone="subdued">No products found.</Text>
                    )}
                  </>
                )}
              </BlockStack>
            )}

            {/* Rules Tab */}
            {selectedTab === 2 && (
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Rules</Text>
                <Text as="p" tone="subdued">
                  Rules feature coming soon. This will allow you to set conditional logic for when fields appear.
                </Text>
              </BlockStack>
            )}
          </Tabs>
        </Card>
      </BlockStack>
    </Page>
  );
}

function AddFieldForm() {
  const [fieldType, setFieldType] = useState("text");
  const [fieldName, setFieldName] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [options, setOptions] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const submit = useSubmit();

  const needsOptions = ["select", "radio", "checkbox"].includes(fieldType);
  const canSubmit = fieldName.trim() && fieldLabel.trim() && (!needsOptions || options.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append("_intent", "addField");
    formData.append("type", fieldType);
    formData.append("fieldName", fieldName);
    formData.append("label", fieldLabel);
    formData.append("required", isRequired ? "true" : "false");
    formData.append("options", needsOptions ? JSON.stringify(options.split('\n').filter(o => o.trim())) : "");
    
    submit(formData, { method: "post" });
  };

  return (
    <Card background="bg-surface-secondary">
      <form onSubmit={handleSubmit}>
        <BlockStack gap="400">
          <Text as="h3" variant="headingMd">Add New Field</Text>

          <Select
            label="Field Type"
            value={fieldType}
            onChange={setFieldType}
            options={[
              { label: "Text Input", value: "text" },
              { label: "Dropdown (Select)", value: "select" },
              { label: "Radio Buttons", value: "radio" },
              { label: "Checkboxes", value: "checkbox" },
            ]}
          />

          <TextField
            label="Field Name (internal)"
            value={fieldName}
            onChange={setFieldName}
            placeholder="e.g., custom_text, color_choice"
            helpText="Used for data storage - no spaces, lowercase recommended"
            autoComplete="off"
          />

          <TextField
            label="Label (shown to customer)"
            value={fieldLabel}
            onChange={setFieldLabel}
            placeholder="e.g., Custom Engraving, Choose Color"
            autoComplete="off"
          />

          {needsOptions && (
            <TextField
              label="Options (one per line)"
              multiline={4}
              value={options}
              onChange={setOptions}
              placeholder="Red&#10;Blue&#10;Green"
              helpText="Enter each option on a new line"
            />
          )}

          <Checkbox 
            label="Required field" 
            checked={isRequired}
            onChange={setIsRequired}
          />

          <Button 
            submit
            disabled={!canSubmit}
          >
            Add Field
          </Button>
        </BlockStack>
      </form>
    </Card>
  );
}

function EditFieldForm({ field, onCancel }: { field: any; onCancel: () => void }) {
  const [fieldLabel, setFieldLabel] = useState(field.label);
  const [options, setOptions] = useState(
    field.optionsJson ? (field.optionsJson as string[]).join('\n') : ''
  );
  const [isRequired, setIsRequired] = useState(field.required);

  const needsOptions = ["select", "radio", "checkbox"].includes(field.type);
  const canSubmit = fieldLabel.trim() && (!needsOptions || options.trim());

  return (
    <Form method="post">
      <BlockStack gap="400">
        <input type="hidden" name="fieldId" value={field.id} />

        <TextField
          label="Label"
          name="label"
          value={fieldLabel}
          onChange={setFieldLabel}
          autoComplete="off"
        />

        {needsOptions && (
          <TextField
            label="Options (one per line)"
            name="optionsRaw"
            multiline={4}
            value={options}
            onChange={setOptions}
          />
        )}

        <Checkbox 
          label="Required field" 
          checked={isRequired}
          onChange={setIsRequired}
        />
        
        <input type="hidden" name="required" value={isRequired ? "true" : "false"} />

        <input
          type="hidden"
          name="options"
          value={needsOptions ? JSON.stringify(options.split('\n').filter(o => o.trim())) : ""}
        />

        <ButtonGroup>
          <Button 
            submit 
            name="_intent" 
            value="updateField"
            disabled={!canSubmit}
          >
            Save Changes
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </ButtonGroup>
      </BlockStack>
    </Form>
  );
}
