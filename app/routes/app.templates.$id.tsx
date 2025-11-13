import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, useSubmit } from "@remix-run/react";
import { Page, Card, TextField, Button, BlockStack, InlineGrid, ButtonGroup, Select, Checkbox, Badge, Icon, InlineStack, Text, Divider } from "@shopify/polaris";
import { DeleteIcon, EditIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { useState } from "react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const template = await prisma.template.findFirst({
    where: { id: params.id!, shop: session.shop },
    include: { 
      fields: { orderBy: { sort: 'asc' } },
      rules: { orderBy: { sort: 'asc' } },
      links: true 
    },
  });
  if (!template) throw new Response("Not found", { status: 404 });
  return json({ template });
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
    const required = form.get("required") === "on";
    const optionsJson = form.get("options") ? JSON.parse(String(form.get("options"))) : null;

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
    const required = form.get("required") === "on";
    const optionsJson = form.get("options") ? JSON.parse(String(form.get("options"))) : null;

    await prisma.field.update({
      where: { id: fieldId },
      data: { label, required, optionsJson }
    });
    return redirect(`/app/templates/${params.id}`);
  }

  return redirect(`/app/templates/${params.id}`);
}

export default function TemplateDetail() {
  const { template } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [showAddField, setShowAddField] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState(template.name);

  return (
    <Page 
      title={template.name}
      backAction={{ url: "/app/templates" }}
      secondaryActions={[
        { content: "Rules", url: `/app/templates/${template.id}/rules` },
        { content: "Link to Products", url: `/app/templates/${template.id}/products` }
      ]}
    >
      <BlockStack gap="400">
        {/* Template Name */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Template Settings</Text>
            <Form method="post">
              <InlineGrid columns={["1fr", "auto"]} gap="200">
                <TextField 
                  label="Template name" 
                  name="name" 
                  value={templateName}
                  onChange={setTemplateName}
                  autoComplete="off" 
                />
                <ButtonGroup>
                  <Button submit name="_intent" value="rename">Save</Button>
                  <Button tone="critical" variant="secondary" submit name="_intent" value="delete">Delete</Button>
                </ButtonGroup>
              </InlineGrid>
            </Form>
          </BlockStack>
        </Card>

        {/* Fields List */}
        <Card>
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
        </Card>

        {/* Linked Products Summary */}
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Linked Products</Text>
            <Text as="p" tone="subdued">
              This template is linked to {template.links.length} product{template.links.length !== 1 ? 's' : ''}.
            </Text>
            <Button url={`/app/templates/${template.id}/products`}>
              Manage Product Links
            </Button>
          </BlockStack>
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

  const needsOptions = ["select", "radio", "checkbox"].includes(fieldType);

  return (
    <Card background="bg-surface-secondary">
      <Form method="post">
        <BlockStack gap="400">
          <Text as="h3" variant="headingMd">Add New Field</Text>
          
          <Select
            label="Field Type"
            name="type"
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
            name="fieldName"
            value={fieldName}
            onChange={setFieldName}
            placeholder="e.g., custom_text, color_choice"
            helpText="Used for data storage - no spaces, lowercase recommended"
            autoComplete="off"
            required
          />

          <TextField
            label="Label (shown to customer)"
            name="label"
            value={fieldLabel}
            onChange={setFieldLabel}
            placeholder="e.g., Custom Engraving, Choose Color"
            autoComplete="off"
            required
          />

          {needsOptions && (
            <TextField
              label="Options (one per line)"
              name="optionsRaw"
              multiline={4}
              value={options}
              onChange={setOptions}
              placeholder="Red&#10;Blue&#10;Green"
              helpText="Enter each option on a new line"
              required
            />
          )}

          <Checkbox label="Required field" name="required" />

          <input 
            type="hidden" 
            name="options" 
            value={needsOptions ? JSON.stringify(options.split('\n').filter(o => o.trim())) : ""} 
          />

          <Button submit name="_intent" value="addField">Add Field</Button>
        </BlockStack>
      </Form>
    </Card>
  );
}

function EditFieldForm({ field, onCancel }: { field: any; onCancel: () => void }) {
  const [fieldLabel, setFieldLabel] = useState(field.label);
  const [options, setOptions] = useState(
    field.optionsJson ? (field.optionsJson as string[]).join('\n') : ''
  );

  const needsOptions = ["select", "radio", "checkbox"].includes(field.type);

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
          required
        />

        {needsOptions && (
          <TextField
            label="Options (one per line)"
            name="optionsRaw"
            multiline={4}
            value={options}
            onChange={setOptions}
            required
          />
        )}

        <Checkbox label="Required field" name="required" defaultChecked={field.required} />

        <input 
          type="hidden" 
          name="options" 
          value={needsOptions ? JSON.stringify(options.split('\n').filter(o => o.trim())) : ""} 
        />

        <ButtonGroup>
          <Button submit name="_intent" value="updateField">Save Changes</Button>
          <Button onClick={onCancel}>Cancel</Button>
        </ButtonGroup>
      </BlockStack>
    </Form>
  );
}