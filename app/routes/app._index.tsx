import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, Text, BlockStack } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  console.log("[DEBUG] Loader called");
  
  try {
    const { session } = await authenticate.admin(request);
    console.log("[DEBUG] Session:", session?.shop);
    
    return json({ 
      shop: session.shop,
      message: "VariantIQ is working!",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("[DEBUG] Error in loader:", error);
    return json({ 
      shop: "unknown",
      message: "Error occurred",
      error: String(error)
    });
  }
}

export default function Index() {
  console.log("[DEBUG] Component rendering");
  const data = useLoaderData<typeof loader>();
  console.log("[DEBUG] Loader data:", data);

  return (
    <Page title="VariantIQ Debug">
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingLg">
              {data.message}
            </Text>
            <Text as="p">Shop: {data.shop}</Text>
            <Text as="p">Time: {data.timestamp}</Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}