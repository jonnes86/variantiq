import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * GDPR Mandatory Webhook: customers/data_request
 *
 * Shopify sends this when a customer requests their data.
 * VariantIQ does NOT store any direct customer personal data —
 * we only store template/field/rule configurations scoped to the shop.
 * Therefore, we acknowledge the request with no data to report.
 */
export async function action({ request }: ActionFunctionArgs) {
    const { topic, shop } = await authenticate.webhook(request);

    console.log(`[GDPR] customers/data_request received for shop: ${shop}`);
    console.log(`[GDPR] Topic: ${topic}`);
    console.log(
        "[GDPR] VariantIQ stores no direct customer PII. Acknowledging request."
    );

    return json({ success: true });
}
