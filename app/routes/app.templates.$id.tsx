// Filename: app/routes/app.templates.$id.tsx
import {
  json,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
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
  Select,
  Banner,
  ResourceList,
  ResourceItem,
  InlineStack,
  Checkbox,
} from "@shopify/polaris";
import { prisma } from "../db.server";
import { useState } from "react";
import { authenticate } from "../shopify.server";

// ... GraphQL and other code unchanged ...

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { session, admin } = await authenticate.admin(request);
    if (!session) return redirect("/auth/login");

    const templateId = params.id!;
    if (!templateId) return redirect("/app");
    if (!prisma) throw new Error("Database connection failed");

    // Load the template including its fields, rules, and links
    const template = await prisma.template.findFirst({
      where: { id: templateId, shop: session.shop },
      include: {
        fields: { orderBy: { sort: "asc" } },
        rules: { orderBy: { sort: "asc" } },
        links: true,
      },
    });
    if (!template) {
      throw new Response("Template not found.", { status: 404 });
    }

    // ... fetching products from Shopify (unchanged) ...

    return json({
      template: {
        id: template.id,
        name: template.name,
        shop: template.shop,
+       // New appearance fields included in loader data
+       fontFamily: template.fontFamily,
+       fontSize: template.fontSize,
+       fontWeight: template.fontWeight,
+       textColor: template.textColor,
+       backgroundColor: template.backgroundColor,
+       borderColor: template.borderColor,
+       borderRadius: template.borderRadius,
+       padding: template.padding,
+       hoverBackgroundColor: template.hoverBackgroundColor,
+       hoverTextColor: template.hoverTextColor,
        fields: template.fields,
        rules: template.rules,
        links: template.links,
      },
      products,
      linkedProductIds,
      nextPageCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
      previousPageCursor: pageInfo.hasPreviousPage ? pageInfo.startCursor : null,
      query: queryParam,
      error: null,
    });
  } catch (error) {
    // ... error handling unchanged ...
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    if (!session) return redirect("/auth/login");

    const templateId = params.id!;
    if (!templateId) return redirect("/app");
    if (!prisma) throw new Error("Database connection failed");

    const form = await request.formData();
    const intent = String(form.get("_intent"));

    // ... Existing field/rule/link handlers (addField, deleteField, etc.) ...

    // --- New: Handle Appearance update ---
    if (intent === "updateAppearance") {
      // Get style values from form (allow empty strings)
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

      // Update the template with new appearance styles
      await prisma.template.update({
        where: { id: templateId },
        data: {
+         fontFamily,
+         fontSize,
+         fontWeight,
+         textColor,
+         backgroundColor,
+         borderColor,
+         borderRadius,
+         padding,
+         hoverBackgroundColor,
+         hoverTextColor,
        },
      });
      return json({ success: true });
    }

    return null;
  } catch (error) {
    // ... error handling unchanged ...
  }
}

export default function TemplateDetail() {
  const {
    template,
    products,
    linkedProductIds,
    nextPageCursor,
    previousPageCursor,
    query,
  } = useLoaderData<typeof loader>();
  const submit = useSubmit();

  const [selectedTab, setSelectedTab] = useState(0);
  // ... other existing state for fields/rules ...

  // --- New state for appearance form ---
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
  const [isHover, setIsHover] = useState(false); // for preview hover effect

  // Handle saving appearance
  const handleSaveAppearance = () => {
    submit(
      {
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
      },
      { method: "post" }
    );
  };

  // Define the Appearance tab content
  const AppearanceView = (
    <BlockStack gap="400">
      <Card>
        <BlockStack gap="400">
          <InlineGrid columns={["1fr", "auto"]}>
            <Text as="h3" variant="headingMd">
              Appearance
            </Text>
          </InlineGrid>
          <Text as="p">
            Customize the button’s appearance by setting each style below.
          </Text>
          {/* Font family input */}
          <TextField
            label="Font Family"
            helpText="CSS font-family (e.g., Arial, sans-serif)."
            value={fontFamily}
            onChange={setFontFamily}
            placeholder="e.g. Arial, sans-serif"
          />
          {/* Font size input */}
          <TextField
            label="Font Size"
            helpText="CSS font-size (e.g., 16px, 1em)."
            value={fontSize}
            onChange={setFontSize}
            placeholder="e.g. 16px"
          />
          {/* Font weight input */}
          <TextField
            label="Font Weight"
            helpText="CSS font-weight (e.g., bold or 400)."
            value={fontWeight}
            onChange={setFontWeight}
            placeholder="e.g. bold or 400"
          />
          {/* Text color input */}
          <TextField
            label="Text Color"
            helpText="CSS color of the button text (e.g., #ffffff)."
            value={textColor}
            onChange={setTextColor}
            placeholder="#ffffff"
          />
          {/* Background color input */}
          <TextField
            label="Background Color"
            helpText="CSS background color (e.g., #0000ff)."
            value={backgroundColor}
            onChange={setBackgroundColor}
            placeholder="#0000ff"
          />
          {/* Border color input */}
          <TextField
            label="Border Color"
            helpText="CSS color for the button border (e.g., #cccccc)."
            value={borderColor}
            onChange={setBorderColor}
            placeholder="#cccccc"
          />
          {/* Border radius input */}
          <TextField
            label="Border Radius"
            helpText="CSS border-radius (e.g., 4px)."
            value={borderRadius}
            onChange={setBorderRadius}
            placeholder="e.g. 4px"
          />
          {/* Padding input */}
          <TextField
            label="Padding"
            helpText="CSS padding (e.g., 8px 16px)."
            value={padding}
            onChange={setPadding}
            placeholder="e.g. 8px 16px"
          />
          {/* Hover background color input */}
          <TextField
            label="Hover Background Color"
            helpText="Background color on hover (e.g., #0055aa)."
            value={hoverBackgroundColor}
            onChange={setHoverBackgroundColor}
            placeholder="#0055aa"
          />
          {/* Hover text color input */}
          <TextField
            label="Hover Text Color"
            helpText="Text color on hover (e.g., #ffffff)."
            value={hoverTextColor}
            onChange={setHoverTextColor}
            placeholder="#ffffff"
          />
        </BlockStack>
      </Card>

      {/* Live preview of the styled button */}
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
          >
            Sample Button
          </Button>
        </BlockStack>
      </Card>

      {/* Save button */}
      <InlineGrid columns={2} gap="200">
        <Button onClick={handleSaveAppearance} primary>
          Save Appearance
        </Button>
      </InlineGrid>
    </BlockStack>
  );

  const RulesView = (
    /* Existing RulesView code unchanged */
    // ...
  );

  const FieldsView = (
    /* Existing FieldsView code unchanged */
    // ...
  );

  const ProductsView = (
    /* Existing ProductsView code unchanged */
    // ...
  );

  return (
    <Page title={template.name}>
      <BlockStack gap="500">
        <Tabs
          tabs={[
            { id: "fields", content: "Fields", badge: String(template.fields.length) },
            { id: "products", content: "Products", badge: String(template.links.length) },
            { id: "rules", content: "Rules", badge: String(template.rules.length) },
+           { id: "appearance", content: "Appearance" }, // New tab
          ]}
          selected={selectedTab}
          onSelect={setSelectedTab}
        />
        <div style={{ marginTop: "1rem" }}>
          {selectedTab === 0 && FieldsView}
          {selectedTab === 1 && ProductsView}
          {selectedTab === 2 && RulesView}
+         {selectedTab === 3 && AppearanceView}  {/* Show Appearance tab */}
        </div>
      </BlockStack>
    </Page>
  );
}
