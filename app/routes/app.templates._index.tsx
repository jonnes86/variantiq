// All imports have been removed to prevent module resolution errors.
// Dependencies (json, redirect, useLoaderData, Form, Link, Page, Card, Text, TextField, Button, BlockStack, InlineGrid, authenticateAdminSafe, prisma, useState)
// are assumed to be globally available in the runtime environment.

// --- Remix Loader ---
export async function loader({ request }: any) {
  // authenticateAdminSafe is assumed to be available globally
  const { session } = await authenticateAdminSafe(request);
  if (!session) {
    // redirect is assumed to be available globally
    return redirect("/auth/login");
  }

  // prisma is assumed to be available globally
  const templates = await prisma.template.findMany({
    where: { shop: session.shop },
    orderBy: { updatedAt: "desc" },
  });
  // json is assumed to be available globally
  return json({ templates });
}

// --- Remix Action ---
export async function action({ request }: any) {
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  // authenticateAdminSafe is assumed to be available globally
  const { session } = await authenticateAdminSafe(request);
  if (!session) {
    return redirect("/auth/login");
  }

  if (!name) return redirect("/app/templates");

  // prisma is assumed to be available globally
  const t = await prisma.template.create({ data: { name, shop: session.shop } });
  return redirect(`/app/templates/${t.id}`);
}

// --- Component ---
export default function TemplatesIndex() {
  // useLoaderData and useState are assumed to be globally available
  const { templates } = useLoaderData();
  const [templateName, setTemplateName] = useState("");

  // Placeholder function for onChange if necessary, though Polaris TextField handles it
  const handleTemplateNameChange = (value: string) => setTemplateName(value);

  return (
    // Polaris components are assumed to be available globally
    <Page title="Templates">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Create new template</Text>
            {/* Form component is assumed to be available globally */}
            <Form method="post">
              <InlineGrid columns={["3fr", "1fr"]} gap="200">
                {/* TextField component is assumed to be available globally */}
                <TextField 
                  label="Template name"
                  labelHidden
                  value={templateName}
                  // Using the assumed global handleTemplateNameChange
                  onChange={handleTemplateNameChange} 
                  name="name"
                  autoComplete="off"
                  placeholder="e.g. T-Shirt Sizes, Jewelry Materials"
                />
                {/* Button component is assumed to be available globally */}
                <Button submit primary disabled={!templateName.trim()}>Create Template</Button>
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
                          {/* Link component is assumed to be available globally */}
                          <Link to={`/app/templates/${t.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                            {t.name}
                          </Link>
                        </Text>
                        <Text as="p" tone="subdued" variant="bodySm">
                          Updated {new Date(t.updatedAt).toLocaleDateString()}
                        </Text>
                      </BlockStack>
                      {/* Link component is assumed to be available globally */}
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