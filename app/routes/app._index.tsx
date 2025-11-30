import { useState } from "react";
import { json, redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  InlineGrid,
  Tabs,
  TextField,
  Banner
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

// --- LOADER ---
export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const templates = await prisma.template.findMany({
    where: { shop: session.shop },
    orderBy: { updatedAt: "desc" },
  });

  return json({ templates });
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
  return null;
}

export default function Index() {
  const { templates } = useLoaderData<typeof loader>();
  const [selectedTab, setSelectedTab] = useState(0);
  const [newTemplateName, setNewTemplateName] = useState("");

  const handleTabChange = (selectedTabIndex: number) => setSelectedTab(selectedTabIndex);

  const tabs = [
    { id: 'dashboard-tab', content: 'Dashboard' },
    { id: 'templates-tab', content: 'Templates' },
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
            <InlineGrid columns={["3fr", "1fr"]} gap="400" alignItems="end">
              <TextField
                label="Template Name"
                labelHidden
                value={newTemplateName}
                onChange={setNewTemplateName}
                name="name"
                autoComplete="off"
                placeholder="e.g. T-Shirts"
              />
              <Button submit primary disabled={!newTemplateName.trim()}>Create</Button>
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
                  <InlineGrid columns={["1fr", "auto"]} gap="200" alignItems="center">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingMd">{t.name}</Text>
                      <Text as="p" tone="subdued" variant="bodySm">
                        Updated {new Date(t.updatedAt).toLocaleDateString()}
                      </Text>
                    </BlockStack>
                    <Link to={`/app/templates/${t.id}`} style={{ textDecoration: 'none' }}>
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

  return (
    <Page title="VariantIQ">
      <Layout>
        <Layout.Section>
          <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange} />
          <div style={{ marginTop: '1rem' }}>
            {selectedTab === 0 && DashboardView}
            {selectedTab === 1 && TemplatesView}
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}