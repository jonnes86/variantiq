// Filename: app/routes/app._index.tsx
import { useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  InlineStack,
} from "@shopify/polaris";

/**
 * The main dashboard page for the VariantIQ application.
 * This is the clean, standard implementation for the rebuild.
 */
export default function Index() {
  const navigate = useNavigate();
  
  // Reliable programmatic navigation
  const goToTemplates = () => navigate("/app/templates");
  
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
                <Button primary onClick={goToTemplates}>
                  Manage Templates
                </Button>
                {/* Products button is temporarily disabled for the initial rebuild step 
                  to focus strictly on getting the Templates flow working first.
                */}
                {/* <Button onClick={() => navigate("/app/products")}>View Products</Button> */}
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
                  1. Click "Manage Templates" to create your first variant template.
                </Text>
                <Text as="p" tone="subdued">
                  2. Define custom fields (like "Size", "Color") and rules.
                </Text>
                <Text as="p" tone="subdued">
                  3. Link the template to your Shopify products.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
