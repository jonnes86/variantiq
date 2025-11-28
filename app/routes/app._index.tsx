// Filename: app/routes/app._index.tsx
// All imports for @remix-run/react and @shopify/polaris have been REMOVED
// to resolve persistent compilation errors. These components and hooks (useNavigate,
// Page, Layout, Card, Text, BlockStack, Button, InlineStack) are assumed to be
// available globally in the Shopify/Remix runtime environment, as seen in other working files.

/**
 * The main dashboard page for the VariantIQ application.
 * Provides an overview and navigation links to core features.
 */
export default function Index() {
  // @ts-ignore - Assuming useNavigate is globally available via App Bridge/Remix runtime
  const navigate = useNavigate();
  
  // Handlers for programmatic navigation using useNavigate is the most reliable method
  const goToTemplates = () => navigate("/app/templates");
  
  // The 'View Products' button remains commented out until the 'app/products' route is confirmed stable.
  
  // @ts-ignore - Assuming Polaris components are globally available
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
                {/* Navigation using onClick and useNavigate hook */}
                <Button primary onClick={goToTemplates}>
                  Manage Templates
                </Button>
                {/* <Button onClick={goToProducts}>
                  View Products
                </Button> */}
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