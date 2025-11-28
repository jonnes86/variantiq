// Filename: app/routes/app._index.tsx
import { Link, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  InlineStack
} from "@shopify/polaris";
// Note: useLoaderData is imported but commented out below as it's not strictly used in this specific component's logic, 
// but is often included in standard Remix components.

// --- Component ---
export default function Index() {
  // const data = useLoaderData(); // No loader data needed here
  
  return (
    <Page>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Welcome to VariantIQ
              </Text>
              <Text as="p">
                VariantIQ helps you define and manage custom variant option templates to ensure consistent data and structured variants across your product catalog.
              </Text>
              <InlineStack gap="200" align="start">
                <Link to="/app/templates">
                  <Button primary>
                    Manage Templates
                  </Button>
                </Link>
                <Link to="/app/products">
                   <Button>
                    View Products
                  </Button>
                </Link>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
        
        <Layout.Section secondary>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Getting Started
                </Text>
                <Text as="p" tone="subdued">
                  1. Click "Manage Templates" to create your first variant template (e.g., "T-Shirt Sizes").
                </Text>
                <Text as="p" tone="subdued">
                  2. Add custom fields (like "Size", "Color", "Material") to your template.
                </Text>
                <Text as="p" tone="subdued">
                  3. Link the template to relevant Shopify products.
                </Text>
                <Text as="p" tone="subdued">
                  4. The template will automatically apply rules and consistency checks to linked products.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}