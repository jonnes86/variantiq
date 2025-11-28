import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, Link } from "@remix-run/react";
import { Page, Card, Text, TextField, Button, BlockStack, InlineGrid } from "@shopify/polaris";
import { authenticateAdminSafe } from "../shopify.server";
import { prisma } from "../db.server";
import { useState } from "react";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticateAdminSafe(request);
  if (!session) {
    // Explicitly redirect to login if no session
    return redirect("/auth/login");
  }

  const templates = await prisma.template.findMany({
    where: { shop: session.shop },
    orderBy: { updatedAt: "desc" },
  });
  return json({ templates });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const { session } = await authenticateAdminSafe(request);
  if (!session) {
    return redirect("/auth/login");
  }

  if (!name) return redirect("/app/templates");

  const t = await prisma.template.create({ data: { name, shop: session.shop } });
  return redirect(`/app/templates/${t.id}`);
}

export default function TemplatesIndex() {
  const { templates } = useLoaderData<typeof loader>();
  const [templateName, setTemplateName] = useState("");

  return (
    <Page title="Templates">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Create a new template</Text>
            <Form method="post">
              <InlineGrid columns={["1fr", "auto"]} gap="200">
                <TextField
                  label="Name"
                  name="name"
                  value={templateName}
                  onChange={setTemplateName}
                  autoComplete="off"
                  placeholder="e.g., T-Shirt Customization"
                />
                <Button submit disabled={!templateName.trim()}>Create Template</Button>
              </InlineGrid>
            </Form>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">Your templates</Text>
            {templates.length === 0 ? (
              <Text as="p" tone="subdued">No templates yet — create your first one above.</Text>
            ) : (
              <BlockStack gap="300">
                {templates.map((t: any) => (
                  <Card key={t.id}>
                    <InlineGrid columns={["1fr", "auto"]} gap="200">
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
                      <Link to={`/app/templates/${t.id}`}>
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
