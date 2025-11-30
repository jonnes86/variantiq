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

export default function Index() {
  const navigate = useNavigate();

  const handleManageTemplates = () => {
    console.log("Navigating to templates...");
    navigate("/app/templates");
  };

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
                <Button primary onClick={handleManageTemplates}>
                  Manage Templates
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}