import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * GDPR Mandatory Webhook: customers/redact
 *
 * Shopify sends this when a store requests deletion of a specific customer's data.
 * VariantIQ does NOT store any direct customer personal data —
 * we only store template/field/rule configurations scoped to the shop.
 * Therefore, we acknowledge the request with no data to delete.
 */
export async function action({ request }: ActionFunctionArgs) {
    const { topic, shop } = await authenticate.webhook(request);

    console.log(`[GDPR] customers/redact received for shop: ${shop}`);
    console.log(`[GDPR] Topic: ${topic}`);
    console.log(
        "[GDPR] VariantIQ stores no direct customer PII. No data to redact."
    );

    return json({ success: true });
}
