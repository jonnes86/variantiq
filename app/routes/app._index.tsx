// Filename: app/routes/app._index.tsx
import { Link } from "@remix-run/react";
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
                {/* FIX: Wrapping the Button in a Link component.
                   This bypasses potential onClick/useNavigate issues in the embedded iframe.
                */}
                <Link to="/app/templates" style={{ textDecoration: 'none' }}>
                  <Button primary>
                    Manage Templates
                  </Button>
                </Link>
                
                {/* Products button is temporarily disabled for the initial rebuild step 
                  to focus strictly on getting the Templates flow working first.
                */}
                {/* <Link to="/app/products" style={{ textDecoration: 'none' }}>
                  <Button>View Products</Button>
                </Link> 
                */}
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
