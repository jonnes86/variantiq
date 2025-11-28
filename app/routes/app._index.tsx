// Filename: app/routes/app._index.tsx
// Removed explicit imports for unused Remix components (Link, useLoaderData)
// to reduce complexity, but they are often required in typical Remix setup.

// To potentially work around compilation issues related to @shopify/polaris
// when it's expected to be globally available, we minimize the import footprint.
// The Polaris components are still needed for the UI, so we keep the import, 
// hoping the environment resolves it properly now.
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  InlineStack
} from "@shopify/polaris";

// --- Component ---
export default function Index() {
  
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
                <Button primary url="/app/templates">
                  Manage Templates
                </Button>
                <Button url="/app/products">
                  View Products
                </Button>
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