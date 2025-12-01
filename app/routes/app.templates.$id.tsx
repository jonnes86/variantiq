import {
  json,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
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
} from "@shopify/polaris";
import { prisma } from "../db.server";
import { useState } from "react";
import { authenticate } from "../shopify.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    if (!session) return redirect("/auth/login");

    const templateId = params.id!;
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
    console.error("Template Detail Loader Error:", error);
    if (error instanceof Response) throw error;
    throw new Response("Internal server error", { status: 500 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    if (!session) return redirect("/auth/login");

    const templateId = params.id!;
    const form = await request.formData();
    const intent = form.get("_intent") as string;

    if (intent === "addRule") {
      const parentFieldId = String(form.get("parentFieldId") || "");
      const parentValue = String(form.get("parentValue") || "").trim();
      const childFieldId = String(form.get("childFieldId") || "");

      if (!parentFieldId || !parentValue || !childFieldId) {
        return json({ error: "All fields required" }, { status: 400 });
      }

      if (parentFieldId === childFieldId) {
        return json(
          { error: "Trigger and shown fields must be different" },
          { status: 400 }
        );
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

    return null;
  } catch (error) {
    console.error("Template Detail Action Error:", error);
    if (error instanceof Response) throw error;
    return json({ error: "Action failed" }, { status: 500 });
  }
}

export default function TemplateDetail() {
  const { template } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  const [selectedTab, setSelectedTab] = useState(0);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [parentFieldId, setParentFieldId] = useState("");
  const [parentValue, setParentValue] = useState("");
  const [childFieldId, setChildFieldId] = useState("");

  const handleParentFieldChange = (value: string) => {
    setParentFieldId(value);
    setChildFieldId("");
  };

  const handleAddRule = () => {
    submit(
      { _intent: "addRule", parentFieldId, parentValue, childFieldId },
      { method: "post" }
    );
    setParentFieldId("");
    setParentValue("");
    setChildFieldId("");
    setShowRuleForm(false);
  };

  const RulesView = (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <InlineGrid columns={["1fr", "auto"]}>
            <Text as="h3" variant="headingMd">
              Cascading Rules
            </Text>
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
                <Text as="h4" variant="headingSm">
                  New Rule
                </Text>
                <Select
                  label="Trigger Field"
                  helpText="Choose the field that controls this rule. When this field’s value matches the trigger value, it will activate the rule."
                  options={[
                    { label: "Select field", value: "" },
                    ...template.fields.map((f) => ({
                      label: f.label,
                      value: f.id,
                    })),
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
                    ...template.fields
                      .filter((f) => f.id !== parentFieldId)
                      .map((f) => ({ label: f.label, value: f.id })),
                  ]}
                  value={childFieldId}
                  onChange={setChildFieldId}
                  disabled={!parentFieldId}
                />
                <Text as="p" variant="bodyMd">
                  Show {template.fields.find(f => f.id === childFieldId)?.label || "[Field to Show]"}
                  {" "}when {template.fields.find(f => f.id === parentFieldId)?.label || "[Trigger Field]"}
                  {" "}equals {parentValue || "[Trigger Value]"}.
                </Text>
                <InlineGrid columns={2} gap="200">
                  <Button onClick={() => setShowRuleForm(false)}>
                    Cancel
                  </Button>
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
              const parentField = template.fields.find(
                (f) => f.id === rule.parentFieldId
              );
              const childField = template.fields.find(
                (f) => f.id === rule.childFieldId
              );
              return (
                <ResourceItem id={rule.id}>
                  <InlineStack align="space-between">
                    <Text as="p" variant="bodyMd">
                      Show {childField?.label || rule.childFieldId} when {parentField?.label || rule.parentFieldId} equals {rule.parentValue}.
                    </Text>
                    <Button
                      onClick={() =>
                        submit({ _intent: "deleteRule", ruleId: rule.id }, { method: "post" })
                      }
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
          {selectedTab === 0 && (
            <Text as="p" tone="subdued">
              Fields tab content placeholder
            </Text>
          )}
          {selectedTab === 1 && (
            <Text as="p" tone="subdued">
              Products tab content placeholder
            </Text>
          )}
          {selectedTab === 2 && RulesView}
        </div>
      </BlockStack>
    </Page>
  );
}