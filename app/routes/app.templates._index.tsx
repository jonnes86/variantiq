// Filename: app/routes/app.templates._index.tsx

// All imports have been removed to prevent module resolution errors.
// Dependencies (json, redirect, useLoaderData, Form, Link, Page, Card, Text, TextField, Button, BlockStack, InlineGrid, authenticateAdminSafe, prisma, useState)
// are assumed to be globally available in the runtime environment.

// --- Remix Loader ---
export async function loader({ request }: any) {
  try {
    // 1. Authentication Check
    // authenticateAdminSafe is assumed to be available globally
    const authResult = await authenticateAdminSafe(request);
    const session = authResult?.session; // Safely access session
    
    if (!session) {
      // redirect is assumed to be available globally
      return redirect("/auth/login");
    }

    // 2. Database Availability Check (Critical for 500s)
    // prisma is assumed to be available globally
    if (typeof prisma === 'undefined') {
        console.error("CRITICAL ERROR: Prisma client is not defined. Database access failed.");
        throw new Error("Database service is unavailable.");
    }

    // 3. Database Fetch
    const templates = await prisma.template.findMany({
      where: { shop: session.shop },
      orderBy: { updatedAt: "desc" },
    });

    // json is assumed to be available globally
    return json({ templates });

  } catch (error) {
    console.error("500 ERROR in app.templates._index loader:", error);
    // Throw a 500 response (Response is assumed to be available globally)
    throw new Response(`Internal Server Error in Templates Loader: ${(error as Error).message}`, { status: 500 });
  }
}

// --- Remix Action ---
export async function action({ request }: any) {
  try {
    const form = await request.formData();
    const name = String(form.get("name") || "").trim();

    // 1. Authentication Check
    const authResult = await authenticateAdminSafe(request);
    const session = authResult?.session; // Safely access session

    if (!session) {
      return redirect("/auth/login");
    }

    if (!name) return redirect("/app/templates");

    // 2. Database Availability Check (Critical for 500s)
    if (typeof prisma === 'undefined') {
        console.error("CRITICAL ERROR: Prisma client is not defined in Action.");
        // json is assumed to be available globally
        return json({ error: "Database service is unavailable for template creation." }, { status: 500 });
    }

    // 3. Database Write
    const t = await prisma.template.create({ data: { name, shop: session.shop } });
    return redirect(`/app/templates/${t.id}`);

  } catch (error) {
    console.error("ERROR in app.templates._index action:", error);
    // json is assumed to be available globally
    return json({ error: "Failed to create template." }, { status: 500 });
  }
}

// --- Component ---
export default function TemplatesIndex() {
  // useLoaderData and useState are assumed to be globally available
  // The loader guarantees that templates will be available if no 500 occurs.
  const loaderData: any = useLoaderData(); 
  const templates = loaderData?.templates || [];
  
  const [templateName, setTemplateName] = useState("");

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