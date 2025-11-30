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
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { useState } from "react";

// --- Loader ---
export async function loader({ request }: LoaderFunctionArgs) {
  console.log("Templates Loader: Start");
  try {
    const { session } = await authenticate.admin(request);
    if (!session) return redirect("/auth/login");

    if (!prisma) throw new Error("Database connection failed.");
  
    const templates = await prisma.template.findMany({
      where: { shop: session.shop },
      orderBy: { updatedAt: "desc" },
    });
    
    console.log(`Templates Loader: Found ${templates.length} templates`);

    return json(
      { templates, error: null },
      { 
        // Force no-cache to ensure fresh data and prevent 304 Not Modified issues during dev
        headers: { 
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate" 
        } 
      }
    );

  } catch (error) {
    console.error("Templates Loader: Error", error);
    if (error instanceof Response) throw error;
    return json({ 
      templates: [], 
      error: "Failed to load templates. Please check server logs." 
    });
  }
}

// --- Action ---
export async function action({ request }: ActionFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    const form = await request.formData();
    const name = String(form.get("name") || "").trim();
  
    if (!name) return json({ error: "Name is required" }, { status: 400 });
    if (!prisma) throw new Error("Database connection failed.");

    const t = await prisma.template.create({ data: { name, shop: session.shop } });
    return redirect(`/app/templates/${t.id}`);

  } catch (error) {
    console.error("Templates Action: Error", error);
    if (error instanceof Response) throw error;
    return json({ error: "Failed to create template." }, { status: 500 });
  }
}

// --- Component ---
export default function TemplatesIndex() {
  const { templates, error } = useLoaderData<typeof loader>();
  const [templateName, setTemplateName] = useState("");

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