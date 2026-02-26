import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useRouteError } from "@remix-run/react";
import {
    Page, Layout, Card, BlockStack, InlineStack, Text, Badge, DataTable, Divider, Banner
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
    try {
        const { session } = await authenticate.admin(request);
        const templates = await prisma.template.findMany({
            where: { shop: session.shop },
            orderBy: { views: "desc" },
            include: { links: true },
        });
        return json({ templates });
    } catch (error) {
        console.error("[Analytics Loader Error]", error);
        throw new Response(
            `Analytics loader failed: ${error instanceof Error ? error.message : String(error)}`,
            { status: 500 }
        );
    }
}

export default function AnalyticsDashboard() {
    const { templates } = useLoaderData<typeof loader>();

    const totalViews = templates.reduce((s, t) => s + (t.views || 0), 0);
    const totalAdds = templates.reduce((s, t) => s + (t.addsToCart || 0), 0);
    const overallCvr = totalViews > 0 ? ((totalAdds / totalViews) * 100).toFixed(1) : "—";

    // Bar chart as CSS bars (no external lib)
    const maxViews = Math.max(...templates.map(t => t.views || 0), 1);

    const rows = templates.map(t => {
        const cvr = t.views > 0 ? ((t.addsToCart / t.views) * 100).toFixed(1) + "%" : "—";
        return [
            t.name,
            String(t.links?.length ?? 0),
            String(t.views || 0),
            String(t.addsToCart || 0),
            cvr,
        ];
    });

    return (
        <Page title="Analytics" backAction={{ content: "Home", url: "/app" }}>
            <BlockStack gap="500">

                {/* Summary cards */}
                <Layout>
                    <Layout.Section variant="oneThird">
                        <Card>
                            <BlockStack gap="100">
                                <Text as="p" variant="bodySm" tone="subdued">Total Template Views</Text>
                                <Text as="p" variant="headingXl">{totalViews.toLocaleString()}</Text>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                    <Layout.Section variant="oneThird">
                        <Card>
                            <BlockStack gap="100">
                                <Text as="p" variant="bodySm" tone="subdued">Add-to-Cart Events</Text>
                                <Text as="p" variant="headingXl">{totalAdds.toLocaleString()}</Text>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                    <Layout.Section variant="oneThird">
                        <Card>
                            <BlockStack gap="100">
                                <Text as="p" variant="bodySm" tone="subdued">Overall Conversion Rate</Text>
                                <Text as="p" variant="headingXl">{overallCvr}{overallCvr !== "—" ? "%" : ""}</Text>
                            </BlockStack>
                        </Card>
                    </Layout.Section>
                </Layout>

                {/* Visual bar chart */}
                <Card>
                    <BlockStack gap="300">
                        <Text as="h3" variant="headingMd">Views by Template</Text>
                        <Divider />
                        {templates.length === 0 && (
                            <Text as="p" tone="subdued">No data yet — views are tracked when customers open product pages with a VariantIQ template.</Text>
                        )}
                        {templates.map(t => {
                            const widthPct = Math.round(((t.views || 0) / maxViews) * 100);
                            const cvrVal = t.views > 0 ? ((t.addsToCart / t.views) * 100).toFixed(1) : null;
                            return (
                                <BlockStack key={t.id} gap="100">
                                    <InlineStack align="space-between" blockAlign="center">
                                        <Text as="span" variant="bodySm" fontWeight="semibold">{t.name}</Text>
                                        <InlineStack gap="200" blockAlign="center">
                                            <Badge tone="info">{`${t.views || 0} views`}</Badge>
                                            <Badge tone="success">{`${t.addsToCart || 0} adds`}</Badge>
                                            {cvrVal && <Badge>{`${cvrVal}% CVR`}</Badge>}
                                        </InlineStack>
                                    </InlineStack>
                                    <div style={{ background: "#e5e7eb", borderRadius: "9999px", height: "8px", overflow: "hidden" }}>
                                        <div style={{ width: `${widthPct}%`, background: "#6366f1", height: "100%", borderRadius: "9999px", transition: "width 0.3s" }} />
                                    </div>
                                </BlockStack>
                            );
                        })}
                    </BlockStack>
                </Card>

                {/* Data table */}
                <Card>
                    <BlockStack gap="200">
                        <Text as="h3" variant="headingMd">Template Breakdown</Text>
                        <DataTable
                            columnContentTypes={["text", "numeric", "numeric", "numeric", "text"]}
                            headings={["Template", "Linked Products", "Views", "Add to Carts", "CVR"]}
                            rows={rows}
                            footerContent={`${templates.length} template${templates.length !== 1 ? "s" : ""}`}
                        />
                    </BlockStack>
                </Card>
            </BlockStack>
        </Page>
    );
}

export function ErrorBoundary() {
    const error = useRouteError();
    const message = error instanceof Error ? error.message : (error instanceof Response ? `${error.status}: ${error.statusText}` : String(error));
    return (
        <Page title="Analytics — Error" backAction={{ content: "Home", url: "/app" }}>
            <Banner tone="critical" title="Something went wrong loading the Analytics page">
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message}</pre>
            </Banner>
        </Page>
    );
}
