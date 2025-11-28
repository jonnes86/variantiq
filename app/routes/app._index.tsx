import { Link } from "@remix-run/react";
import { Page, Layout, Card, Text, BlockStack, Button, InlineStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";

export default function Index() {
  return (
    <Page>
      <TitleBar title="VariantIQ" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">Welcome to VariantIQ</Text>
                <InlineStack gap="300">
                  <Link to="/app/templates">
                    <Button variant="primary">Manage Templates</Button>
                  </Link>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
