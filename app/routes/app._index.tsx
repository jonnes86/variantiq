import { useState, useEffect } from "react";
import { json, redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, Link, useSearchParams } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Banner,
  Badge,
  Button,
  BlockStack,
  Box,
  InlineGrid,
  Divider,
  Tabs,
  FormLayout,
  InlineStack,
  ResourceList,
  ResourceItem,
  TextField
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { detectPlan, getLimits } from "../billing.server";

// --- LOADER ---
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  // Auto-generate the Dummy Product required for Cart-syncing Dynamic Prices
  await ensureDummyProductExists(admin);

  const [templates, datasets, planInfo] = await Promise.all([
    prisma.template.findMany({
      where: { shop: session.shop },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.dataset.findMany({
      where: { shop: session.shop },
      orderBy: { updatedAt: "desc" },
    }),
    detectPlan(session.shop, admin),
  ]);

  const limits = getLimits(planInfo.tier);
  const url = new URL(request.url);
  const upgraded = url.searchParams.get("upgraded") === "1";
  const atTemplateLimit = !limits.maxTemplates || templates.length >= limits.maxTemplates;

  return json({ templates, datasets, planInfo, limits, upgraded, atTemplateLimit });
}

async function ensureDummyProductExists(admin: any) {
  try {
    const response = await admin.graphql(
      `#graphql
      query {
  products(first: 1, query: "title:'VariantIQ Options Fee'") {
          edges {
            node {
        id
      }
    }
  }
} `
    );
    const data = await response.json();

    if (data.data.products.edges.length === 0) {
      console.log("[VariantIQ] Dummy price product not found. Auto-generating...");
      await admin.graphql(
        `#graphql
        mutation createDummyProduct($input: ProductInput!) {
  productCreate(input: $input) {
            product { id }
            userErrors { field message }
  }
} `,
        {
          variables: {
            input: {
              title: "VariantIQ Options Fee",
              handle: "variantiq-options-fee-hidden",
              status: "ACTIVE",
              published: true,
              seo: {
                title: "VariantIQ Options Fee",
                description: "Hidden system product used for dynamic pricing.",
              },
              variants: [{
                price: "0.01",
                requiresShipping: false,
                inventoryPolicy: "CONTINUE"
              }],
              metafields: [
                {
                  namespace: "seo",
                  key: "hidden",
                  type: "number_integer",
                  value: "1"
                }
              ]
            }
          }
        }
      );
    }
  } catch (error) {
    console.error("[VariantIQ] Failed to create dummy product:", error);
  }
}

// --- ACTION ---
export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("_intent");

  if (intent === "createTemplate") {
    const name = String(form.get("name") || "").trim();
    if (!name) return json({ error: "Name required" }, { status: 400 });

    const t = await prisma.template.create({ data: { name, shop: session.shop } });
    return redirect(`/app/templates/${t.id}`);
  }

  if (intent === "deleteTemplate") {
    const id = String(form.get("id"));
    await prisma.template.delete({ where: { id, shop: session.shop } });
    return null;
  }

  if (intent === "duplicateTemplate") {
    const id = String(form.get("id"));
    const originalTemplate = await prisma.template.findUnique({
      where: { id, shop: session.shop },
      include: {
        fields: true,
        rules: true
      }
    });

    if (!originalTemplate) return json({ error: "Template not found" }, { status: 404 });

    const newTemplate = await prisma.template.create({
      data: {
        name: `${originalTemplate.name} (Copy)`,
        shop: session.shop,
        fields: {
          create: originalTemplate.fields.map(f => ({
            name: f.name,
            label: f.label,
            type: f.type,
            optionsJson: f.optionsJson ?? undefined,
            priceAdjustmentsJson: f.priceAdjustmentsJson ?? undefined,
            variantMappingJson: f.variantMappingJson ?? undefined,
            required: f.required,
            sort: f.sort
          }))
        }
      },
      include: {
        fields: true
      }
    });

    // Remap rule field references
    const fieldIdMap: Record<string, string> = {};
    for (const oldField of originalTemplate.fields) {
      const newField = newTemplate.fields.find(f => f.name === oldField.name && f.sort === oldField.sort);
      if (newField) {
        fieldIdMap[oldField.id] = newField.id;
      }
    }

    if (originalTemplate.rules.length > 0) {
      const rulesToCreate = originalTemplate.rules.map(r => {
        let newConditions = r.conditionsJson;
        if (Array.isArray(newConditions)) {
          newConditions = newConditions.map((c: any) => ({
            ...c,
            fieldId: fieldIdMap[c.fieldId] || c.fieldId
          }));
        }
        return {
          templateId: newTemplate.id,
          targetFieldId: fieldIdMap[r.targetFieldId] || r.targetFieldId,
          actionType: r.actionType,
          targetOptionsJson: r.targetOptionsJson as any,
          targetPriceAdjustmentsJson: r.targetPriceAdjustmentsJson as any,
          conditionsJson: newConditions as any,
          sort: r.sort
        };
      });

      await prisma.rule.createMany({
        data: rulesToCreate
      });
    }

    return redirect(`/app/templates/${newTemplate.id}`);
  }

  if (intent === "createDataset") {
    const name = String(form.get("name") || "").trim();
    if (!name) return json({ error: "Name required" }, { status: 400 });

    const d = await prisma.dataset.create({ data: { name, shop: session.shop, optionsJson: JSON.stringify([]) } });
    return redirect(`/app/datasets/${d.id}`);
  }

  if (intent === "deleteDataset") {
    const id = String(form.get("id"));
    await prisma.dataset.delete({ where: { id, shop: session.shop } });
    return null;
  }

  return null;
}

export default function Index() {
  const { templates, datasets, planInfo, limits, upgraded, atTemplateLimit } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  const getInitialTab = () => {
    switch (searchParams.get("tab")) {
      case "templates": return 1;
      case "datasets": return 2;
      default: return 0;
    }
  };

  const [selectedTab, setSelectedTab] = useState(getInitialTab());
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newDatasetName, setNewDatasetName] = useState("");
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    const hidden = localStorage.getItem("hideVariantIqOnboarding") === "true";
    setIsDismissed(hidden);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem("hideVariantIqOnboarding", "true");
    setIsDismissed(true);
  };

  const handleTabChange = (selectedTabIndex: number) => setSelectedTab(selectedTabIndex);

  const tabs = [
    { id: 'dashboard-tab', content: 'Dashboard' },
    { id: 'templates-tab', content: 'Templates' },
    { id: 'datasets-tab', content: 'Datasets' },
  ];

  // --- VIEWS ---
  const DashboardView = (
    <BlockStack gap="500">
      {/* Upgrade success flash */}
      {upgraded && (
        <Banner tone="success" title="Welcome to Pro! 🎉">
          <Text as="p">Your subscription is active. All features are now unlocked.</Text>
        </Banner>
      )}

      {/* Upgrade prompt for Free tier */}
      {planInfo.tier === "Free" && (
        <Banner
          tone="warning"
          title="You're on the Free plan"
          action={{ content: "Upgrade to Pro", url: "/app/billing" }}
        >
          <Text as="p">
            Unlock unlimited templates, conditional rules, datasets, analytics, and webhook integrations — starting at $9.99/month with a 14-day free trial.
          </Text>
        </Banner>
      )}

      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Welcome to VariantIQ</Text>
          <Text as="p">
            VariantIQ allows you to easily manage custom product options, conditional logic rules, and dynamic pricing across your Shopify catalog.
          </Text>
          <Text as="p">
            Get started by exploring the core features below:
          </Text>
        </BlockStack>
      </Card>

      <InlineGrid columns={2} gap="400">
        {/* Analytics card */}
        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingMd">📊 Analytics</Text>
            <Text as="p" tone="subdued">View template views, add-to-cart events, and conversion rates.</Text>
            {limits.hasAnalytics ? (
              <Link to="/app/analytics" style={{ textDecoration: "none" }}>
                <Button variant="plain">View Analytics →</Button>
              </Link>
            ) : (
              <Link to="/app/billing" style={{ textDecoration: "none" }}>
                <Button variant="plain" tone="critical">🔒 Pro feature — Upgrade</Button>
              </Link>
            )}
          </BlockStack>
        </Card>
        {/* Webhooks card */}
        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingMd">🔗 Webhooks</Text>
            <Text as="p" tone="subdued">Send order data with custom options to Zapier, Make, or any endpoint.</Text>
            {limits.hasWebhooks ? (
              <Link to="/app/webhooks" style={{ textDecoration: "none" }}>
                <Button variant="plain">Manage Webhooks →</Button>
              </Link>
            ) : (
              <Link to="/app/billing" style={{ textDecoration: "none" }}>
                <Button variant="plain" tone="critical">🔒 Pro feature — Upgrade</Button>
              </Link>
            )}
          </BlockStack>
        </Card>
      </InlineGrid>

      {!isDismissed && (
        <Banner
          title="🚀 Step 1: Activate VariantIQ on your Storefront"
          tone="info"
          onDismiss={handleDismiss}
        >
          <Text as="p" variant="bodyMd">
            Before your custom fields will appear to customers, you must add the VariantIQ App Block to your theme.
          </Text>
          <div style={{ paddingLeft: "16px", marginTop: "12px", paddingBottom: "8px" }}>
            <BlockStack gap="200">
              <Text as="p">1. Go to your Shopify Admin and click <Text as="strong">Online Store {">"} Themes</Text>.</Text>
              <Text as="p">2. Click <Text as="strong">Customize</Text> on your current theme.</Text>
              <Text as="p">3. Navigate to your <Text as="strong">Default Product</Text> template using the top dropdown.</Text>
              <Text as="p">4. On the left sidebar, under the <Text as="strong">Product Information</Text> section, click <Text as="strong">+ Add block</Text>.</Text>
              <Text as="p">5. Select <Text as="strong">VariantIQ Custom Fields</Text> from the Apps section and drag it above your Add to Cart button.</Text>
              <Text as="p">6. Click <Text as="strong">Save</Text> in the top right corner.</Text>
            </BlockStack>
          </div>
        </Banner>
      )}

      <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
        <Card>
          <BlockStack gap="400">
            <Text as="h3" variant="headingMd">Templates</Text>
            <Text as="p" tone="subdued">
              Templates are the core of VariantIQ. A template contains your custom fields (like text boxes, dropdowns, file uploads) and dynamic rules (e.g., "Show field Y if option X is selected").
              Once built, you can link a single template to hundreds of products at once.
            </Text>
            <Button onClick={() => setSelectedTab(1)}>Manage Templates</Button>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h3" variant="headingMd">Global Datasets</Text>
            <Text as="p" tone="subdued">
              Datasets let you create massive, reusable lists of options (like all 200 of your brand colors).
              Instead of manually typing colors into every single dropdown field in your templates, you can import them here once and reference them dynamically using Rules.
            </Text>
            <Button onClick={() => setSelectedTab(2)}>Manage Datasets</Button>
          </BlockStack>
        </Card>
      </InlineGrid>
    </BlockStack>
  );

  const TemplatesView = (
    <BlockStack gap="500">
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Create New Template</Text>
          <Text as="p" tone="subdued">
            A Template acts as a blueprint. For example, you might create a "T-Shirts" template containing fields for "Custom Name" and "Logo Upload".
            You can then assign that exact template to all of your T-Shirt products.
          </Text>
          {atTemplateLimit ? (
            <Banner
              tone="warning"
              title={`Free plan limit reached (${limits.maxTemplates} template)`}
              action={{ content: "Upgrade to Pro", url: "/app/billing" }}
            >
              <Text as="p">
                Upgrade to Pro for unlimited templates, fields, rules, datasets, analytics, and webhooks.
              </Text>
            </Banner>
          ) : (
            <Form method="post">
              <input type="hidden" name="_intent" value="createTemplate" />
              <InlineGrid columns="3fr 1fr" gap="400" alignItems="end">
                <TextField
                  label="Template Name"
                  labelHidden
                  value={newTemplateName}
                  onChange={setNewTemplateName}
                  name="name"
                  autoComplete="off"
                  placeholder="e.g. T-Shirts"
                />
                <Button submit variant="primary" disabled={!newTemplateName.trim()}>Create</Button>
              </InlineGrid>
            </Form>
          )}
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">Your Templates</Text>
          {templates.length === 0 ? (
            <Text as="p" tone="subdued">No templates yet.</Text>
          ) : (
            <ResourceList
              resourceName={{ singular: 'template', plural: 'templates' }}
              items={templates}
              renderItem={(t: any) => (
                <ResourceItem
                  id={t.id}
                  url={`/app/templates/${t.id}`}
                  accessibilityLabel={`Edit template ${t.name}`}
                >
                  <InlineGrid columns="1fr auto" gap="200" alignItems="center">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingMd">{t.name}</Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        Updated {new Date(t.updatedAt).toLocaleDateString()}
                      </Text>
                    </BlockStack>
                    <InlineStack gap="200" align="end" blockAlign="center">
                      <div onClick={(e) => e.stopPropagation()}>
                        <Form method="post" onSubmit={(e) => { if (!confirm(`Are you sure you want to duplicate ${t.name}?`)) e.preventDefault(); }}>
                          <input type="hidden" name="_intent" value="duplicateTemplate" />
                          <input type="hidden" name="id" value={t.id} />
                          <Button submit variant="tertiary">Duplicate</Button>
                        </Form>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <Form method="post" onSubmit={(e) => { if (!confirm(`Are you sure you would like to delete ${t.name}?`)) e.preventDefault(); }}>
                          <input type="hidden" name="_intent" value="deleteTemplate" />
                          <input type="hidden" name="id" value={t.id} />
                          <Button submit tone="critical">Delete</Button>
                        </Form>
                      </div>
                    </InlineStack>
                  </InlineGrid>
                </ResourceItem>
              )}
            />
          )}
        </BlockStack>
      </Card>
    </BlockStack>
  );

  const DatasetsView = limits.hasDatasets ? (
    <BlockStack gap="500">
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Global Datasets</Text>
          <Text as="p">
            Create reusable lists of massive options (e.g. "Brands", "Shirt Colors") that can be referenced by the Visual Rule Builder to dynamically limit product choices without rebuilding the list every time.
          </Text>

          <Form method="post">
            <input type="hidden" name="_intent" value="createDataset" />
            <InlineStack gap="300" align="start">
              <TextField
                label="New Dataset Name"
                labelHidden
                name="name"
                value={newDatasetName}
                onChange={setNewDatasetName}
                autoComplete="off"
                placeholder="e.g. Nike Primary Colors"
              />
              <Button submit variant="primary" disabled={!newDatasetName}>
                Create Dataset
              </Button>
            </InlineStack>
          </Form>
        </BlockStack>
      </Card>

      {datasets.length > 0 && (
        <Card>
          <ResourceList
            resourceName={{ singular: 'dataset', plural: 'datasets' }}
            items={datasets}
            renderItem={(dataset) => {
              const count = Array.isArray(dataset.optionsJson) ? dataset.optionsJson.length :
                (typeof dataset.optionsJson === 'string' ? JSON.parse(dataset.optionsJson || "[]").length : 0);
              return (
                <ResourceItem
                  id={dataset.id}
                  url={`/app/datasets/${dataset.id}`}
                  accessibilityLabel={`View details for ${dataset.name}`}
                >
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="200">
                      <Text variant="bodyMd" fontWeight="bold" as="h3">
                        {dataset.label || dataset.name}
                      </Text>
                      <Text variant="bodySm" tone="subdued" as="span">
                        Internal ID: {dataset.name} • {count} options loaded
                      </Text>
                    </BlockStack>
                    <Form method="post" onSubmit={(e) => { if (!confirm("Are you sure?")) e.preventDefault() }}>
                      <input type="hidden" name="_intent" value="deleteDataset" />
                      <input type="hidden" name="id" value={dataset.id} />
                      <Button submit tone="critical">Delete</Button>
                    </Form>
                  </InlineStack>
                </ResourceItem>
              );
            }}
          />
        </Card>
      )}
    </BlockStack>
  ) : (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">🔒 Pro Feature: Global Datasets</Text>
        <Text as="p" tone="subdued">
          Global Datasets let you build massive reusable option lists (e.g. all 200 of your brand colors)
          and reference them dynamically in your templates — without retyping them every time.
          Available on the Pro plan.
        </Text>
        <InlineStack align="start">
          <Link to="/app/billing" style={{ textDecoration: "none" }}>
            <Button variant="primary">Upgrade to Pro — $9.99/mo</Button>
          </Link>
        </InlineStack>
      </BlockStack>
    </Card>
  );

  return (
    <Page
      title="VariantIQ Manager"
      titleMetadata={
        <Badge tone={planInfo.tone}>{planInfo.tier}</Badge>
      }
    >
      <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
        <div style={{ paddingTop: '1rem' }}>
          {selectedTab === 0 && DashboardView}
          {selectedTab === 1 && TemplatesView}
          {selectedTab === 2 && DatasetsView}
        </div>
      </Tabs>
    </Page>
  );
}