import { json, redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Button,
  InlineGrid,
  InlineStack,
  Badge,
  List,
  Divider,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { detectPlan, isPro } from "../billing.server";

// App handle from the Shopify admin URL (admin.shopify.com/store/{shop}/apps/{handle})
const APP_HANDLE = "variantiq-3";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const planInfo = await detectPlan(session.shop, admin);

  // Already Pro or Developer — no reason to be on this page.
  if (isPro(planInfo.tier)) {
    return redirect("/app");
  }

  const url = new URL(request.url);
  const error = url.searchParams.get("error");

  // Build the managed pricing URL for the merchant's store
  // Extract shop handle from session.shop (e.g., "mystore.myshopify.com" → "mystore")
  const shopHandle = session.shop.replace(".myshopify.com", "");
  const pricingUrl = `https://admin.shopify.com/store/${shopHandle}/charges/${APP_HANDLE}/pricing_plans`;

  return json({ error, pricingUrl });
}

export default function BillingPage() {
  const { error, pricingUrl } = useLoaderData<typeof loader>();

  return (
    <Page
      title="Upgrade to Pro"
      backAction={{ content: "Home", url: "/app" }}
    >
      <BlockStack gap="500">
        {error && (
          <Banner tone="critical" title="Billing Error">
            <Text as="p">{error}</Text>
          </Banner>
        )}

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Unlock the full power of VariantIQ
            </Text>
            <Text as="p" tone="subdued">
              Upgrade to Pro to get unlimited templates, conditional logic
              rules, global datasets, analytics, and webhook integrations —
              all with a 14-day free trial.
            </Text>
          </BlockStack>
        </Card>

        <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
          {/* Monthly Plan */}
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text as="h2" variant="headingLg">
                  Monthly
                </Text>
                <InlineStack blockAlign="end" gap="100">
                  <Text as="p" variant="headingXl" fontWeight="bold">
                    $9.99
                  </Text>
                  <Text as="p" tone="subdued">
                    / month
                  </Text>
                </InlineStack>
                <Text as="p" tone="subdued" variant="bodySm">
                  Includes 14-day free trial. Cancel anytime.
                </Text>
              </BlockStack>

              <Divider />

              <List>
                <List.Item>Unlimited templates</List.Item>
                <List.Item>Unlimited fields per template</List.Item>
                <List.Item>Conditional logic rules</List.Item>
                <List.Item>Global datasets</List.Item>
                <List.Item>Analytics dashboard</List.Item>
                <List.Item>Webhook integrations (Zapier, Make, etc.)</List.Item>
              </List>

              <Button
                variant="primary"
                fullWidth
                url={pricingUrl}
                target="_top"
              >
                Start Free Trial — Monthly
              </Button>
            </BlockStack>
          </Card>

          {/* Annual Plan */}
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="100">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="h2" variant="headingLg">
                    Annual
                  </Text>
                  <Badge tone="success">Save 16%</Badge>
                </InlineStack>
                <InlineStack blockAlign="end" gap="100">
                  <Text as="p" variant="headingXl" fontWeight="bold">
                    $99.99
                  </Text>
                  <Text as="p" tone="subdued">
                    / year
                  </Text>
                </InlineStack>
                <Text as="p" tone="subdued" variant="bodySm">
                  Includes 14-day free trial. ~$8.33/mo billed annually.
                </Text>
              </BlockStack>

              <Divider />

              <List>
                <List.Item>Everything in Monthly</List.Item>
                <List.Item>2 months free versus monthly billing</List.Item>
                <List.Item>Priority support</List.Item>
              </List>

              <Button
                variant="primary"
                tone="success"
                fullWidth
                url={pricingUrl}
                target="_top"
              >
                Start Free Trial — Annual
              </Button>
            </BlockStack>
          </Card>
        </InlineGrid>

        {/* Current plan reminder */}
        <Card>
          <BlockStack gap="200">
            <Text as="h3" variant="headingMd">
              Your current plan: Free
            </Text>
            <Text as="p" tone="subdued">
              You can continue using VariantIQ for free with 1 template and
              up to 3 fields. Conditional rules, datasets, analytics, and
              webhooks require a Pro subscription.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
