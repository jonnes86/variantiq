import type { LoaderFunctionArgs } from "@remix-run/node";
import { Page, Layout, Card, Text, BlockStack, Button, InlineStack } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { Link } from "@remix-run/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Do NOT force authenticate here — let child routes handle it
  return null;
};

export default function Index() {
  return (
    <Page>
      <TitleBar title="VariantIQ" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Welcome to VariantIQ
                  </Text>
                  <Text variant="bodyMd" as="p">
                    Create dynamic product options with conditional logic. Build custom fields once,
                    reuse them across multiple products, and provide a personalized shopping experience.
                  </Text>
                </BlockStack>

                <BlockStack gap="300">
                  <Text as="h3" variant="headingMd">
                    Get Started
                  </Text>
                  <InlineStack gap="300">
                    <Link to="/app/templates">
                      <Button variant="primary">Manage Templates</Button>
                    </Link>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="300">
                <Text as="h2" variant="headingMd">
                  Quick Guide
                </Text>
                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    <strong>1. Create a Template</strong><br />
                    Define the custom fields you want to collect from customers.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>2. Add Fields</strong><br />
                    Text inputs, dropdowns, radio buttons, or checkboxes.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>3. Set Rules</strong><br />
                    Show, hide, require, or disable fields based on customer choices.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    <strong>4. Link to Products</strong><br />
                    Attach your template to specific products in your store.
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
