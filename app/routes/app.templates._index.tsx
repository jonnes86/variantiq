import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { Page, Card, Text, TextField, Button, BlockStack, InlineGrid } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const templates = await prisma.template.findMany({
    where: { shop: session.shop },
    orderBy: { updatedAt: "desc" },
  });
  return json({ templates });
}

export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const name = String(form.get("name") || "").trim();
  const { session } = await authenticate.admin(request);
  if (!name) return redirect("/app/templates");
  const t = await prisma.template.create({ data: { name, shop: session.shop } });
  return redirect(`/app/templates/${t.id}`);
}

export default function TemplatesIndex() {
  const { templates } = useLoaderData<typeof loader>();
  return (
    <Page title="Templates" primaryAction={{ content: "New Template", url: "#create" }}>
      <Card id="create">
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">Create a new template</Text>
          <Form method="post">
            <InlineGrid columns={["1fr", "auto"]} gap="200">
              <TextField label="Name" name="name" autoComplete="off" />
              <Button submit>Save</Button>
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
            <ul style={{margin:0, paddingLeft: "1rem"}}>
              {templates.map((t: any) => (
                <li key={t.id}>
                  <a href={`/app/templates/${t.id}`}>{t.name}</a> &middot; updated {new Date(t.updatedAt).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </BlockStack>
      </Card>
    </Page>
  );
}
