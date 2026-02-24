import { useState } from "react";
import { json, redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
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

// --- LOADER ---
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  // Auto-generate the Dummy Product required for Cart-syncing Dynamic Prices
  await ensureDummyProductExists(admin);

  const templates = await prisma.template.findMany({
    where: { shop: session.shop },
    orderBy: { updatedAt: "desc" },
  });

  const datasets = await prisma.dataset.findMany({
    where: { shop: session.shop },
    orderBy: { updatedAt: "desc" },
  });

  return json({ templates, datasets });
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
  const { templates, datasets } = useLoaderData<typeof loader>();
  const [selectedTab, setSelectedTab] = useState(0);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newDatasetName, setNewDatasetName] = useState("");

  const handleTabChange = (selectedTabIndex: number) => setSelectedTab(selectedTabIndex);

  const tabs = [
    { id: 'dashboard-tab', content: 'Dashboard' },
    { id: 'templates-tab', content: 'Templates' },
    { id: 'datasets-tab', content: 'Datasets' },
  ];

  // --- VIEWS ---
  const DashboardView = (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Welcome to VariantIQ</Text>
          <Text as="p">
            VariantIQ helps you define and manage custom variant option templates.
          </Text>
          <Button onClick={() => setSelectedTab(1)}>Go to Templates</Button>
        </BlockStack>
      </Card>
    </BlockStack>
  );

  const TemplatesView = (
    <BlockStack gap="500">
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Create New Template</Text>
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
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="200">
          <Text as="h2" variant="headingMd">Your Templates</Text>
          {templates.length === 0 ? (
            <Text as="p" tone="subdued">No templates yet.</Text>
          ) : (
            <BlockStack gap="300">
              {templates.map((t: any) => (
                <Card key={t.id}>
                  <InlineGrid columns="1fr auto" gap="200" alignItems="center">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingMd">{t.name}</Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        Updated {new Date(t.updatedAt).toLocaleDateString()}
                      </Text>
                    </BlockStack>
                    <Link to={`/ app / templates / ${t.id} `} style={{ textDecoration: 'none' }}>
                      <Button>Edit</Button>
                    </Link>
                  </InlineGrid>
                </Card>
              ))}
            </BlockStack>
          )}
        </BlockStack>
      </Card>
    </BlockStack>
  );

  const DatasetsView = (
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
                        {dataset.name}
                      </Text>
                      <Text variant="bodySm" tone="subdued" as="span">
                        {count} options loaded
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
  );

  return (
    <Page title="VariantIQ Manager">
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