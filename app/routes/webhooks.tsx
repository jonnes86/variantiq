import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

/**
 * Catch-all compliance webhook handler.
 * Shopify sends customers/data_request, customers/redact, and shop/redact
 * to this single endpoint. We dispatch based on the topic.
 */
export async function action({ request }: ActionFunctionArgs) {
    const { topic, shop } = await authenticate.webhook(request);

    console.log(`[Webhook] Received topic: ${topic} for shop: ${shop}`);

    switch (topic) {
        case "CUSTOMERS_DATA_REQUEST":
            console.log("[GDPR] customers/data_request — no customer PII stored. Acknowledging.");
            break;

        case "CUSTOMERS_REDACT":
            console.log("[GDPR] customers/redact — no customer PII stored. Acknowledging.");
            break;

        case "SHOP_REDACT":
            console.log(`[GDPR] shop/redact — purging ALL data for shop: ${shop}`);
            try {
                await prisma.webhookEndpoint.deleteMany({ where: { shop } });
                await prisma.templateVersion.deleteMany({
                    where: {
                        templateId: {
                            in: (
                                await prisma.template.findMany({
                                    where: { shop },
                                    select: { id: true },
                                })
                            ).map((t) => t.id),
                        },
                    },
                });
                await prisma.productTemplateLink.deleteMany({ where: { shop } });
                await prisma.dataset.deleteMany({ where: { shop } });
                await prisma.template.deleteMany({ where: { shop } });
                await prisma.session.deleteMany({ where: { shop } });
                console.log(`[GDPR] ✅ All data purged for shop: ${shop}`);
            } catch (error) {
                console.error(`[GDPR] ❌ Error purging data for shop ${shop}:`, error);
            }
            break;

        default:
            console.log(`[Webhook] Unhandled topic: ${topic}`);
    }

    return json({ success: true });
}
