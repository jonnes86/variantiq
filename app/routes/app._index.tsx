// Filename: app/routes/app._index.tsx
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Button,
  InlineStack,
} from "@shopify/polaris";

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
                VariantIQ helps you define and manage custom variant option templates.
              </Text>
              <InlineStack gap="200" align="start">
                {/* FIX: Using 'url' prop on Polaris Button directly.
                  In Shopify App Bridge context, this handles navigation reliably.
                  We are avoiding Remix <Link> temporarily to bypass potential 
                  client-side routing/caching issues ("No route matches URL").
                */}
                <Button primary url="/app/templates">
                  Manage Templates
                </Button>
                
                {/* <Button url="/app/products">View Products</Button> */}
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
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}