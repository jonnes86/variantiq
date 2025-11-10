import type { MetaFunction } from "@remix-run/node";
import { Page, Card, Text } from "@shopify/polaris";

export const meta: MetaFunction = () => [{ title: "VariantIQ • Templates" }];

export default function TemplatesIndex() {
  return (
    <Page title="Templates">
      <Card>
        <Text as="p" variant="bodyMd">
          Create and manage option templates. (Coming soon)
        </Text>
      </Card>
    </Page>
  );
}
