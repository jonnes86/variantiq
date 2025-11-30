// Filename: app/routes/app.templates.$id.tsx
import {
  json,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import {
  useLoaderData,
  useSubmit,
  useNavigate,
} from "@remix-run/react";
import {
  Page,
  Card,
  TextField,
  Button,
  BlockStack,
  Tabs,
  Text,
  Banner,
  InlineGrid,
} from "@shopify/polaris";
import { prisma } from "../db.server";
import { useState, useEffect } from "react";
import { authenticate } from "../shopify.server";

// --- Loader ---
export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    
    // Check session manually if needed, though authenticate.admin handles redirects
    if (!session) {
      return redirect("/auth/login");
    }

    const templateId = params.id!;
    
    if (!prisma) {
      throw new Error("Database connection failed");
    }

    const template = await prisma.template.findFirst({
      where: { id: templateId, shop: session.shop },
      include: {
        fields: { orderBy: { sort: "asc" } },
        rules: { orderBy: { sort: "asc" } },
        links: true,
      },
    });

    if (!template) {
      throw new Response("Not found", { status: 404 });
    }

    // You can expand this to fetch products if needed
    // For now, returning empty products array to keep it simple and safe
    const products: any[] = []; 

    return json({
      template,
      products,
      hasReadProducts: true,
    });

  } catch (error) {
    console.error("Template Detail Loader Error:", error);
    if (error instanceof Response) {
      throw error;
    }
    throw error; // Re-throw to hit the ErrorBoundary
  }
}

// --- Action ---
export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    if (!session) return redirect("/auth/login");

    const templateId = params.id!;
    const form = await request.formData();
    const intent = form.get("_intent");

    if (intent === "updateName") {
      const name = String(form.get("templateName") || "").trim();
      if (!name) return json({ error: "Name empty" }, { status: 400 });
      
      await prisma.template.update({
        where: { id: templateId },
        data: { name },
      });
      return json({ success: true });
    }
    
    return null;

  } catch (error) {
    console.error("Template Detail Action Error:", error);
    if (error instanceof Response) throw error;
    return json({ error: "Action failed" }, { status: 500 });
  }
}

// --- Component ---
export default function TemplateDetail() {
  const { template } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigate = useNavigate();
  
  const [selectedTab, setSelectedTab] = useState(0);
  const [templateName, setTemplateName] = useState(template.name);

  // Sync state if template changes (e.g. after save)
  useEffect(() => {
    setTemplateName(template.name);
  }, [template.name]);

  const tabs = [
    { id: "fields", content: "Fields" },
    { id: "products", content: "Products" },
    { id: "rules", content: "Rules" },
  ];

  return (
    <Page
      backAction={{ content: "Dashboard", onAction: () => navigate("/app") }}
      title={template.name}
    >
      <BlockStack gap="500">
        <Card>
          <BlockStack gap="400">
            <TextField
              label="Template Name"
              value={templateName}
              onChange={setTemplateName}
              autoComplete="off"
            />
            <InlineGrid columns={["1fr", "auto"]}>
               <div /> {/* Spacer */}
               <Button 
                 onClick={() => submit({ templateName, _intent: "updateName" }, { method: "post" })}
                 disabled={templateName === template.name}
                 primary
               >
                 Save
               </Button>
            </InlineGrid>
          </BlockStack>
        </Card>
        
        <Tabs tabs={tabs} selected={selectedTab} onSelect={setSelectedTab}>
           <Card>
             <BlockStack gap="400">
                <Text as="h2" variant="headingMd">{tabs[selectedTab].content}</Text>
                <Text as="p" tone="subdued">
                  Feature content for {tabs[selectedTab].content} will go here.
                </Text>
             </BlockStack>
           </Card>
        </Tabs>
      </BlockStack>
    </Page>
  );
}