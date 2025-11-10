import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { Page, Card, TextField, Button, BlockStack, InlineGrid, ButtonGroup } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const template = await prisma.template.findFirst({
    where: { id: params.id!, shop: session.shop },
  });
  if (!template) throw new Response("Not found", { status: 404 });
  return json({ template });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");

  if (intent === "rename") {
    const name = String(form.get("name") || "").trim();
    if (name) await prisma.template.update({ where: { id: params.id! }, data: { name } });
    return redirect(`/app/templates/${params.id}`);
  }

  if (intent === "delete") {
    await prisma.template.delete({ where: { id: params.id! } });
    return redirect("/app/templates");
  }

  return redirect(`/app/templates/${params.id}`);
}

export default function TemplateDetail() {
  const { template } = useLoaderData<typeof loader>();
  return (
    <Page title={template.name} secondaryActions={[{content:"Rules", url:`/app/templates/${template.id}/rules`}]} >
      <Card>
        <BlockStack gap="400">
          <Form method="post">
            <InlineGrid columns={["1fr","auto"]} gap="200">
              <TextField label="Template name" name="name" defaultValue={template.name} />
              <ButtonGroup>
                <Button submit name="_intent" value="rename">Save</Button>
                <Button tone="critical" variant="secondary" submit name="_intent" value="delete">Delete</Button>
              </ButtonGroup>
            </InlineGrid>
          </Form>
        </BlockStack>
      </Card>
    </Page>
  );
}
