import type { LoaderFunctionArgs } from "@remix-run/node";
import { Page, Layout, Card, Text, BlockStack, Button, InlineStack } from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { Redirect } from "@shopify/app-bridge"; // ✅ keep this, but only alongside useAppBridge

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Do NOT force authenticate here — let child routes handle it
  return null;
};

export default function Index() {
  const app = useAppBridge();

  const handleRedirect = () => {
    const redirect = Redirect.create(app);
    redirect.dispatch(Redirect.Action.APP, "/app/templates");
  };

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
                    <Button variant="primary" onClick={handleRedirect}>
                      Manage Templates
                    </Button>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
