// Filename: app/routes/app.templates._index.tsx
import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, Link } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  TextField,
  Button,
  BlockStack,
  InlineGrid,
  Banner
} from "@shopify/polaris";
import { authenticateAdminSafe } from "../shopify.server";
import { prisma } from "../db.server";
import { useState } from "react";

// --- Loader ---
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // 1. Authenticate
    const { session } = await authenticateAdminSafe(request);
    if (!session) {
      return redirect("/auth/login");
    }

    // 2. Database Check (Critical for preventing 500s)
    if (!prisma) {
      console.error("CRITICAL: Prisma client is undefined.");
      throw new Error("Database connection failed.");
    }
  
    // 3. Fetch Data
    const templates = await prisma.template.findMany({
      where: { shop: session.shop },
      orderBy: { updatedAt: "desc" },
    });
    
    return json({ templates, error: null });

  } catch (error) {
    console.error("Templates Index Loader Error:", error);
    // Return error as data to allow UI to render instead of 500 crash
    return json({ 
      templates: [], 
      error: "Failed to load templates. Please check server logs." 
    });
  }
}

// --- Action ---
export async function action({ request }: ActionFunctionArgs) {
  try {
    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
    
    const { session } = await authenticateAdminSafe(request);
    if (!session) return redirect("/auth/login");
  
    if (!name) return json({ error: "Name is required" }, { status: 400 });
    
    if (!prisma) throw new Error("Database connection failed.");

    const t = await prisma.template.create({ data: { name, shop: session.shop } });
    return redirect(`/app/templates/${t.id}`);

  } catch (error) {
    console.error("Templates Index Action Error:", error);
    return json({ error: "Failed to create template." }, { status: 500 });
  }
}

// --- Component ---
export default function TemplatesIndex() {
  const { templates, error } = useLoaderData<typeof loader>();
  const [templateName, setTemplateName] = useState("");

  // Error State UI
  if (error) {
    return (
      <Page title="Templates">
        <Banner tone="critical" title="Error Loading Templates">
          <p>{error}</p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page title="Templates">
      <BlockStack gap="500">
        {/* Creation Form */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Create New Template</Text>
            <Form method="post">
              <InlineGrid columns={["3fr", "1fr"]} gap="400" alignItems="end">
                <TextField
                  label="Template Name"
                  labelHidden
                  placeholder="e.g., T-Shirt Sizes"
                  value={templateName}
                  onChange={setTemplateName}
                  name="name"
                  autoComplete="off"
                />
                <Button submit primary disabled={templateName.trim().length === 0}>
                  Create
                </Button>
              </InlineGrid>
            </Form>
          </BlockStack>
        </Card>

        {/* Templates List */}
        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Your Templates</Text>
            {templates.length === 0 ? (
              <Text as="p" tone="subdued">No templates yet — create your first one above.</Text>
            ) : (
              <BlockStack gap="300">
                {templates.map((t: any) => (
                  <Card key={t.id}>
                    <InlineGrid columns={["1fr", "auto"]} gap="200" alignItems="center">
                      <BlockStack gap="100">
                        <Text as="h3" variant="headingMd">
                          <Link to={`/app/templates/${t.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                            {t.name}
                          </Link>
                        </Text>
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
    </Page>
  );
}