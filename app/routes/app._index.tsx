// Filename: app/routes/app._index.tsx

// All imports have been removed to prevent module resolution errors.
// Dependencies (useLoaderData, Link, Page, Layout, Card, Text, BlockStack, Button, InlineStack)
// are assumed to be globally available in the runtime environment.

// --- Component ---
export default function Index() {
  // FIX: Removed unused useLoaderData() call which was causing a ReferenceError
  // const data = useLoaderData();

  return (
    // Polaris components are assumed to be available globally
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
                {/* CRITICAL FIX: Use the Remix Link component for internal navigation 
                  to ensure client-side routing is handled correctly by the embedded app.
                */}
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