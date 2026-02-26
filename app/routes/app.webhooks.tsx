import { useState } from "react";
import { json } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useRouteError } from "@remix-run/react";
import {
    Page, Card, BlockStack, InlineStack, TextField, Button, Text,
    Badge, DataTable, Banner, Divider
} from "@shopify/polaris";
import { DeleteIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
    try {
        const { session } = await authenticate.admin(request);
        const webhooks = await prisma.webhookEndpoint.findMany({
            where: { shop: session.shop },
            orderBy: { createdAt: "desc" },
        });
        return json({ webhooks });
    } catch (error) {
        console.error("[Webhooks Loader Error]", error);
        throw new Response(
            `Webhooks loader failed: ${error instanceof Error ? error.message : String(error)}`,
            { status: 500 }
        );
    }
}

export async function action({ request }: ActionFunctionArgs) {
    const { session } = await authenticate.admin(request);
    const form = await request.formData();
    const intent = String(form.get("_intent") || "");

    if (intent === "add") {
        const url = String(form.get("url") || "").trim();
        const label = String(form.get("label") || "").trim();
        if (!url.startsWith("http")) return json({ error: "Invalid URL" }, { status: 400 });
        await prisma.webhookEndpoint.create({ data: { shop: session.shop, url, label } });
    }

    if (intent === "delete") {
        const id = String(form.get("id") || "");
        await prisma.webhookEndpoint.deleteMany({ where: { id, shop: session.shop } });
    }

    if (intent === "toggle") {
        const id = String(form.get("id") || "");
        const active = form.get("active") === "true";
        await prisma.webhookEndpoint.updateMany({ where: { id, shop: session.shop }, data: { active: !active } });
    }

    return json({ success: true });
}

export default function WebhooksPage() {
    const { webhooks } = useLoaderData<typeof loader>();
    const submit = useSubmit();
    const navigation = useNavigation();
    const isSaving = navigation.state !== "idle";

    const [url, setUrl] = useState("");
    const [label, setLabel] = useState("");

    const rows = webhooks.map((w: any) => [
        w.label || "—",
        <Text as="span" variant="bodySm" tone="subdued">{w.url}</Text>,
        w.active ? <Badge tone="success">Active</Badge> : <Badge>Paused</Badge>,
        <InlineStack gap="100">
            <Button size="micro" variant="plain" onClick={() => submit({ _intent: "toggle", id: w.id, active: String(w.active) }, { method: "post" })}>
                {w.active ? "Pause" : "Resume"}
            </Button>
            <Button size="micro" variant="plain" tone="critical" icon={DeleteIcon} onClick={() => { if (confirm("Delete this webhook?")) submit({ _intent: "delete", id: w.id }, { method: "post" }); }} />
        </InlineStack>
    ]);

    return (
        <Page title="Webhooks / Integrations" backAction={{ content: "Home", url: "/app" }}>
            <BlockStack gap="500">
                <Banner tone="info">
                    <BlockStack gap="100">
                        <Text as="p" fontWeight="semibold">How it works</Text>
                        <Text as="p">When a Shopify order is placed that contains VariantIQ line item properties (e.g., from your custom options), VariantIQ will POST the order data to each active webhook URL below. Perfect for Zapier, Make, or custom fulfillment integrations.</Text>
                    </BlockStack>
                </Banner>

                <Card>
                    <BlockStack gap="400">
                        <Text as="h3" variant="headingMd">Add Webhook Endpoint</Text>
                        <Divider />
                        <TextField label="Label (optional)" value={label} onChange={setLabel} autoComplete="off" placeholder="e.g. Zapier – Production Orders" />
                        <TextField label="URL" value={url} onChange={setUrl} autoComplete="off" placeholder="https://hooks.zapier.com/hooks/catch/..." />
                        <InlineStack align="start">
                            <Button
                                variant="primary"
                                loading={isSaving}
                                disabled={!url.trim()}
                                onClick={() => { submit({ _intent: "add", url, label }, { method: "post" }); setUrl(""); setLabel(""); }}
                            >
                                Add Endpoint
                            </Button>
                        </InlineStack>
                    </BlockStack>
                </Card>

                {webhooks.length > 0 && (
                    <Card>
                        <BlockStack gap="200">
                            <Text as="h3" variant="headingMd">Active Endpoints</Text>
                            <DataTable
                                columnContentTypes={["text", "text", "text", "text"]}
                                headings={["Label", "URL", "Status", "Actions"]}
                                rows={rows}
                            />
                        </BlockStack>
                    </Card>
                )}

                {webhooks.length === 0 && (
                    <Card>
                        <div style={{ padding: "32px", textAlign: "center" }}>
                            <Text as="p" variant="bodyMd" tone="subdued">No webhook endpoints yet — add one above to start receiving order events.</Text>
                        </div>
                    </Card>
                )}
            </BlockStack>
        </Page>
    );
}

export function ErrorBoundary() {
    const error = useRouteError();
    const message = error instanceof Error ? error.message : (error instanceof Response ? `${error.status}: ${error.statusText}` : String(error));
    return (
        <Page title="Webhooks — Error" backAction={{ content: "Home", url: "/app" }}>
            <Banner tone="critical" title="Something went wrong loading the Webhooks page">
                <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{message}</pre>
            </Banner>
        </Page>
    );
}
