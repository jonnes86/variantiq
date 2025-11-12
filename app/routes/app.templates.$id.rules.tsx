import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { Page, Card, Button, BlockStack, Select, TextField, ButtonGroup, InlineStack, Text, Badge, Divider, Icon } from "@shopify/polaris";
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
      rules: { orderBy: { sort: 'asc' } }
    },
  });
  
  if (!template) throw new Response("Not found", { status: 404 });
  return json({ template });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");

  if (intent === "addRule") {
    const expression = String(form.get("expression"));
    const action = String(form.get("action"));
    const targetFieldId = String(form.get("targetFieldId") || "");
    const payloadJson = form.get("payloadJson") ? JSON.parse(String(form.get("payloadJson"))) : null;

    const maxSort = await prisma.rule.findFirst({
      where: { templateId: params.id! },
      orderBy: { sort: 'desc' },
      select: { sort: true }
    });

    await prisma.rule.create({
      data: {
        templateId: params.id!,
        expression,
        action,
        payloadJson: payloadJson || { targetFieldId },
        sort: (maxSort?.sort || 0) + 1
      }
    });

    return redirect(`/app/templates/${params.id}/rules`);
  }

  if (intent === "deleteRule") {
    const ruleId = String(form.get("ruleId"));
    await prisma.rule.delete({ where: { id: ruleId } });
    return redirect(`/app/templates/${params.id}/rules`);
  }

  if (intent === "updateRule") {
    const ruleId = String(form.get("ruleId"));
    const expression = String(form.get("expression"));
    const action = String(form.get("action"));
    const targetFieldId = String(form.get("targetFieldId") || "");
    const payloadJson = form.get("payloadJson") ? JSON.parse(String(form.get("payloadJson"))) : null;

    await prisma.rule.update({
      where: { id: ruleId },
      data: {
        expression,
        action,
        payloadJson: payloadJson || { targetFieldId }
      }
    });

    return redirect(`/app/templates/${params.id}/rules`);
  }

  return redirect(`/app/templates/${params.id}/rules`);
}

export default function TemplateRules() {
  const { template } = useLoaderData<typeof loader>();
  const [showAddRule, setShowAddRule] = useState(false);
  const [editingRule, setEditingRule] = useState<string | null>(null);

  return (
    <Page
      title={`Rules for "${template.name}"`}
      backAction={{ url: `/app/templates/${template.id}` }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Conditional Logic</Text>
            <Text as="p">
              Create rules to show, hide, require, or disable fields based on other field values.
              For example: "If Color = Red, then show Custom Text field"
            </Text>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">Rules ({template.rules.length})</Text>
              <Button onClick={() => setShowAddRule(!showAddRule)}>
                {showAddRule ? "Cancel" : "Add Rule"}
              </Button>
            </InlineStack>

            {showAddRule && <AddRuleForm fields={template.fields} />}

            <Divider />

            {template.rules.length === 0 ? (
              <Text as="p" tone="subdued">
                No rules yet. Add rules to create dynamic field behavior based on customer selections.
              </Text>
            ) : (
              <BlockStack gap="300">
                {template.rules.map((rule: any) => (
                  <Card key={rule.id}>
                    {editingRule === rule.id ? (
                      <EditRuleForm 
                        rule={rule} 
                        fields={template.fields}
                        onCancel={() => setEditingRule(null)} 
                      />
                    ) : (
                      <InlineStack align="space-between">
                        <BlockStack gap="200">
                          <InlineStack gap="200" blockAlign="center">
                            <Badge tone="info">{rule.action.toUpperCase()}</Badge>
                            <Text as="p" variant="bodyMd" fontWeight="semibold">
                              {parseRuleDescription(rule, template.fields)}
                            </Text>
                          </InlineStack>
                          <Text as="p" tone="subdued" variant="bodySm">
                            Expression: {rule.expression}
                          </Text>
                        </BlockStack>
                        <ButtonGroup>
                          <Button icon={EditIcon} onClick={() => setEditingRule(rule.id)} />
                          <Form method="post">
                            <input type="hidden" name="ruleId" value={rule.id} />
                            <Button 
                              icon={DeleteIcon} 
                              tone="critical" 
                              submit 
                              name="_intent" 
                              value="deleteRule"
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

        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingMd">Rule Expression Syntax</Text>
            <Text as="p" tone="subdued">
              Use simple expressions to define conditions:
            </Text>
            <ul style={{ paddingLeft: '1.5rem', margin: '0.5rem 0' }}>
              <li><code>fieldName == "value"</code> - equals</li>
              <li><code>fieldName != "value"</code> - not equals</li>
              <li><code>fieldName includes "value"</code> - contains (for checkbox)</li>
              <li><code>fieldName && otherField == "value"</code> - AND logic</li>
              <li><code>fieldName || otherField == "value"</code> - OR logic</li>
            </ul>
            <Text as="p" tone="subdued" variant="bodySm">
              Example: <code>color == "Red" && size == "Large"</code>
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

function AddRuleForm({ fields }: { fields: any[] }) {
  const [conditionField, setConditionField] = useState("");
  const [conditionOperator, setConditionOperator] = useState("==");
  const [conditionValue, setConditionValue] = useState("");
  const [action, setAction] = useState("show");
  const [targetField, setTargetField] = useState("");

  const fieldOptions = fields.map(f => ({ label: `${f.label} (${f.name})`, value: f.name }));
  const targetFieldOptions = fields.map(f => ({ label: `${f.label} (${f.name})`, value: f.id }));

  const buildExpression = () => {
    if (!conditionField || !conditionValue) return "";
    return `${conditionField} ${conditionOperator} "${conditionValue}"`;
  };

  return (
    <Card background="bg-surface-secondary">
      <Form method="post">
        <BlockStack gap="400">
          <Text as="h3" variant="headingMd">Add New Rule</Text>

          <BlockStack gap="300">
            <Text as="h4" variant="headingSm">IF (Condition)</Text>
            
            <Select
              label="Field"
              options={[{ label: "Select field...", value: "" }, ...fieldOptions]}
              value={conditionField}
              onChange={setConditionField}
            />

            <Select
              label="Operator"
              options={[
                { label: "equals (==)", value: "==" },
                { label: "not equals (!=)", value: "!=" },
                { label: "includes", value: "includes" },
              ]}
              value={conditionOperator}
              onChange={setConditionOperator}
            />

            <TextField
              label="Value"
              value={conditionValue}
              onChange={setConditionValue}
              placeholder="e.g., Red, Large, Yes"
              autoComplete="off"
            />
          </BlockStack>

          <Divider />

          <BlockStack gap="300">
            <Text as="h4" variant="headingSm">THEN (Action)</Text>

            <Select
              label="Action"
              name="action"
              options={[
                { label: "Show field", value: "show" },
                { label: "Hide field", value: "hide" },
                { label: "Require field", value: "require" },
                { label: "Disable field", value: "disable" },
              ]}
              value={action}
              onChange={setAction}
            />

            <Select
              label="Target Field"
              name="targetFieldId"
              options={[{ label: "Select field...", value: "" }, ...targetFieldOptions]}
              value={targetField}
              onChange={setTargetField}
            />
          </BlockStack>

          <input type="hidden" name="expression" value={buildExpression()} />
          
          <Text as="p" tone="subdued" variant="bodySm">
            Preview: IF {buildExpression() || "(incomplete)"} THEN {action} {targetField ? fields.find(f => f.id === targetField)?.label : "(no field selected)"}
          </Text>

          <Button 
            submit 
            name="_intent" 
            value="addRule"
            disabled={!conditionField || !conditionValue || !targetField}
          >
            Add Rule
          </Button>
        </BlockStack>
      </Form>
    </Card>
  );
}

function EditRuleForm({ rule, fields, onCancel }: { rule: any; fields: any[]; onCancel: () => void }) {
  // Parse existing rule
  const parsed = parseExpressionForEdit(rule.expression);
  
  const [conditionField, setConditionField] = useState(parsed.field);
  const [conditionOperator, setConditionOperator] = useState(parsed.operator);
  const [conditionValue, setConditionValue] = useState(parsed.value);
  const [action, setAction] = useState(rule.action);
  const [targetField, setTargetField] = useState(rule.payloadJson?.targetFieldId || "");

  const fieldOptions = fields.map(f => ({ label: `${f.label} (${f.name})`, value: f.name }));
  const targetFieldOptions = fields.map(f => ({ label: `${f.label} (${f.name})`, value: f.id }));

  const buildExpression = () => {
    if (!conditionField || !conditionValue) return rule.expression;
    return `${conditionField} ${conditionOperator} "${conditionValue}"`;
  };

  return (
    <Form method="post">
      <BlockStack gap="400">
        <input type="hidden" name="ruleId" value={rule.id} />

        <BlockStack gap="300">
          <Text as="h4" variant="headingSm">IF (Condition)</Text>
          
          <Select
            label="Field"
            options={[{ label: "Select field...", value: "" }, ...fieldOptions]}
            value={conditionField}
            onChange={setConditionField}
          />

          <Select
            label="Operator"
            options={[
              { label: "equals (==)", value: "==" },
              { label: "not equals (!=)", value: "!=" },
              { label: "includes", value: "includes" },
            ]}
            value={conditionOperator}
            onChange={setConditionOperator}
          />

          <TextField
            label="Value"
            value={conditionValue}
            onChange={setConditionValue}
            autoComplete="off"
          />
        </BlockStack>

        <BlockStack gap="300">
          <Text as="h4" variant="headingSm">THEN (Action)</Text>

          <Select
            label="Action"
            name="action"
            options={[
              { label: "Show field", value: "show" },
              { label: "Hide field", value: "hide" },
              { label: "Require field", value: "require" },
              { label: "Disable field", value: "disable" },
            ]}
            value={action}
            onChange={setAction}
          />

          <Select
            label="Target Field"
            name="targetFieldId"
            options={[{ label: "Select field...", value: "" }, ...targetFieldOptions]}
            value={targetField}
            onChange={setTargetField}
          />
        </BlockStack>

        <input type="hidden" name="expression" value={buildExpression()} />

        <ButtonGroup>
          <Button submit name="_intent" value="updateRule">Save Changes</Button>
          <Button onClick={onCancel}>Cancel</Button>
        </ButtonGroup>
      </BlockStack>
    </Form>
  );
}

function parseRuleDescription(rule: any, fields: any[]): string {
  const targetField = fields.find(f => f.id === rule.payloadJson?.targetFieldId);
  const targetLabel = targetField ? targetField.label : "unknown field";
  
  return `IF ${rule.expression} THEN ${rule.action} "${targetLabel}"`;
}

function parseExpressionForEdit(expression: string): { field: string; operator: string; value: string } {
  // Simple parser for expressions like: fieldName == "value"
  const match = expression.match(/^(\w+)\s*(==|!=|includes)\s*"([^"]+)"$/);
  
  if (match) {
    return {
      field: match[1],
      operator: match[2],
      value: match[3]
    };
  }

  return { field: "", operator: "==", value: "" };
}