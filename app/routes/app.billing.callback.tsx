import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Shopify redirects merchants here after they confirm (or decline) billing.
 * The charge_id in the URL is a numeric Shopify subscription ID.
 * We verify it's ACTIVE before granting Pro access.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);

  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");

  if (!chargeId) {
    return redirect("/app/billing?error=Missing+charge+ID+from+Shopify.");
  }

  try {
    const response = await admin.graphql(
      `#graphql
      query GetSubscription($id: ID!) {
        node(id: $id) {
          ... on AppSubscription {
            id
            status
          }
        }
      }`,
      {
        variables: {
          id: `gid://shopify/AppSubscription/${chargeId}`,
        },
      }
    );

    const data = await response.json();
    const status = data?.data?.node?.status;

    if (status === "ACTIVE") {
      // Subscription confirmed — send merchant back to the dashboard with a success flash.
      return redirect("/app?upgraded=1");
    }

    // Merchant declined or something went wrong.
    return redirect(
      "/app/billing?error=Subscription+was+not+activated.+You+can+try+again+below."
    );
  } catch (err) {
    console.error("[VariantIQ] Billing callback error:", err);
    return redirect(
      "/app/billing?error=Could+not+verify+your+subscription.+Please+contact+support."
    );
  }
}

// This route always redirects — no UI needed.
export default function BillingCallback() {
  return null;
}
