// app/routes/app.templates.$id.tsx

import {
  json,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  useCatch,
} from "@remix-run/node";
import { useLoaderData, useSubmit, Form, Link } from "@remix-run/react";
import {
  Page,
  Card,
  TextField,
  Button,
  BlockStack,
  Tabs,
  Text,
  InlineGrid,
} from "@shopify/polaris";
import { prisma } from "../db.server";
import { useState } from "react";
import { authenticate } from "../shopify.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    if (!session) return redirect("/auth/login");

    const templateId = params.id;
    if (!templateId) return redirect("/app");

    const template = await prisma.template.findFirst({
      where: { id: templateId, shop: session.shop },
      include: {
        fields: { orderBy: { sort: "asc" } },
        rules: { orderBy: { sort: "asc" } },
        links: true,
      },
    });

    if (!template) throw new Response("Template not found", { status: 404 });

    return json({ template });
  } catch (error) {
    console.error("Loader Error:", error);
    throw new Response("Unexpected Server Error", { status: 500 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  if (!session) return redirect("/auth/login");

  const templateId = params.id;
  if (!templateId) return redirect("/app");

  const form = await request.formData();
  const intent = String(form.get("_intent"));

  if (intent === "updateAppearance") {
    const fontFamily = String(form.get("fontFamily") || "");
    const fontSize = String(form.get("fontSize") || "");
    const fontWeight = String(form.get("fontWeight") || "");
    const textColor = String(form.get("textColor") || "");
    const backgroundColor = String(form.get("backgroundColor") || "");
    const borderColor = String(form.get("borderColor") || "");
    const borderRadius = String(form.get("borderRadius") || "");
    const padding = String(form.get("padding") || "");
    const hoverBackgroundColor = String(form.get("hoverBackgroundColor") || "");
    const hoverTextColor = String(form.get("hoverTextColor") || "");

    await prisma.template.update({
      where: { id: templateId },
      data: {
        fontFamily,
        fontSize,
        fontWeight,
        textColor,
        backgroundColor,
        borderColor,
        borderRadius,
        padding,
        hoverBackgroundColor,
        hoverTextColor,
      },
    });
    return json({ success: true });
  }

  return null;
}

export default function TemplateDetail() {
  const { template } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [selectedTab, setSelectedTab] = useState(0);

  const [fontFamily, setFontFamily] = useState(template.fontFamily || "");
  const [fontSize, setFontSize] = useState(template.fontSize || "");
  const [fontWeight, setFontWeight] = useState(template.fontWeight || "");
  const [textColor, setTextColor] = useState(template.textColor || "");
  const [backgroundColor, setBackgroundColor] = useState(template.backgroundColor || "");
  const [borderColor, setBorderColor] = useState(template.borderColor || "");
  const [borderRadius, setBorderRadius] = useState(template.borderRadius || "");
  const [padding, setPadding] = useState(template.padding || "");
  const [hoverBackgroundColor, setHoverBackgroundColor] = useState(template.hoverBackgroundColor || "");
  const [hoverTextColor, setHoverTextColor] = useState(template.hoverTextColor || "");
  const [isHover, setIsHover] = useState(false);

  const handleSaveAppearance = () => {
    submit({
      _intent: "updateAppearance",
      fontFamily,
      fontSize,
      fontWeight,
      textColor,
      backgroundColor,
      borderColor,
      borderRadius,
      padding,
      hoverBackgroundColor,
      hoverTextColor,
    }, { method: "post" });
  };

  const AppearanceView = (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <InlineGrid columns={["1fr", "auto"]}>
            <Text as="h3" variant="headingMd">Appearance</Text>
          </InlineGrid>
          <Text as="p">Customize the button’s appearance by setting each style below.</Text>
          <TextField label="Font Family" value={fontFamily} onChange={setFontFamily} placeholder="e.g. Arial" />
          <TextField label="Font Size" value={fontSize} onChange={setFontSize} placeholder="e.g. 16px" />
          <TextField label="Font Weight" value={fontWeight} onChange={setFontWeight} placeholder="e.g. bold" />
          <TextField label="Text Color" value={textColor} onChange={setTextColor} placeholder="#ffffff" />
          <TextField label="Background Color" value={backgroundColor} onChange={setBackgroundColor} placeholder="#0000ff" />
          <TextField label="Border Color" value={borderColor} onChange={setBorderColor} placeholder="#cccccc" />
          <TextField label="Border Radius" value={borderRadius} onChange={setBorderRadius} placeholder="e.g. 4px" />
          <TextField label="Padding" value={padding} onChange={setPadding} placeholder="e.g. 8px 16px" />
          <TextField label="Hover Background Color" value={hoverBackgroundColor} onChange={setHoverBackgroundColor} placeholder="#0055aa" />
          <TextField label="Hover Text Color" value={hoverTextColor} onChange={setHoverTextColor} placeholder="#ffffff" />
        </BlockStack>
      </Card>
      <Card>
        <BlockStack gap="200">
          <Text as="h4" variant="headingSm">Preview</Text>
          <Button
            onMouseEnter={() => setIsHover(true)}
            onMouseLeave={() => setIsHover(false)}
            style={{
              fontFamily: fontFamily || undefined,
              fontSize: fontSize || undefined,
              fontWeight: fontWeight || undefined,
              color: isHover && hoverTextColor ? hoverTextColor : (textColor || undefined),
              backgroundColor: isHover && hoverBackgroundColor ? hoverBackgroundColor : (backgroundColor || undefined),
              border: borderColor ? `1px solid ${borderColor}` : undefined,
              borderRadius: borderRadius || undefined,
              padding: padding || undefined,
            }}
          >Sample Button</Button>
        </BlockStack>
      </Card>
      <InlineGrid columns={2} gap="200">
        <Button onClick={handleSaveAppearance} primary>Save Appearance</Button>
      </InlineGrid>
    </BlockStack>
  );

  return (
    <Page title={template.name}>
      <BlockStack gap="500">
        <Tabs
          tabs={[
            { id: "fields", content: "Fields", badge: String(template.fields.length) },
            { id: "products", content: "Products", badge: String(template.links.length) },
            { id: "rules", content: "Rules", badge: String(template.rules.length) },
            { id: "appearance", content: "Appearance" },
          ]}
          selected={selectedTab}
          onSelect={setSelectedTab}
        />
        <div style={{ marginTop: "1rem" }}>
          {selectedTab === 0 && <div>FieldsView</div>}
          {selectedTab === 1 && <div>ProductsView</div>}
          {selectedTab === 2 && <div>RulesView</div>}
          {selectedTab === 3 && AppearanceView}
        </div>
      </BlockStack>
    </Page>
  );
}

export function CatchBoundary() {
  const caught = useCatch();
  return (
    <Page title="Error">
      <Text tone="critical">Error: {caught.statusText}</Text>
    </Page>
  );
}

export function ErrorBoundary({ error }: { error: Error }) {
  console.error(error);
  return (
    <Page title="App Error">
      <Text tone="critical">Something went wrong: {error.message}</Text>
    </Page>
  );
}