import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

/**
 * GDPR Mandatory Webhook: shop/redact
 *
 * Shopify sends this 48 hours after a store uninstalls the app,
 * requesting that ALL data for that shop be permanently deleted.
 * This handler purges all VariantIQ records for the shop.
 */
export async function action({ request }: ActionFunctionArgs) {
    const { topic, shop } = await authenticate.webhook(request);

    console.log(`[GDPR] shop/redact received for shop: ${shop}`);
    console.log(`[GDPR] Topic: ${topic}`);
    console.log(`[GDPR] Purging ALL data for shop: ${shop}`);

    try {
        // Delete in dependency order (children before parents)
        // Fields, Rules, and ProductTemplateLinks cascade from Template,
        // but we delete explicitly for clarity and safety.

        await prisma.webhookEndpoint.deleteMany({ where: { shop } });
        console.log(`[GDPR] Deleted WebhookEndpoints for ${shop}`);

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
        console.log(`[GDPR] Deleted TemplateVersions for ${shop}`);

        await prisma.productTemplateLink.deleteMany({ where: { shop } });
        console.log(`[GDPR] Deleted ProductTemplateLinks for ${shop}`);

        await prisma.dataset.deleteMany({ where: { shop } });
        console.log(`[GDPR] Deleted Datasets for ${shop}`);

        // Cascading delete: Template → Field, Rule
        await prisma.template.deleteMany({ where: { shop } });
        console.log(`[GDPR] Deleted Templates (+ cascaded Fields & Rules) for ${shop}`);

        await prisma.session.deleteMany({ where: { shop } });
        console.log(`[GDPR] Deleted Sessions for ${shop}`);

        console.log(`[GDPR] ✅ All data purged for shop: ${shop}`);
    } catch (error) {
        console.error(`[GDPR] ❌ Error purging data for shop ${shop}:`, error);
        // Still return 200 to acknowledge receipt — Shopify will retry otherwise
    }

    return json({ success: true });
}
