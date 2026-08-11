import { redirect } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

/**
 * Legacy billing callback route.
 * With Shopify App Pricing (Managed Pricing), Shopify handles the full
 * subscription confirmation flow. This route is kept as a simple redirect
 * so any old bookmarks or cached URLs don't 404.
 *
 * detectPlan() in billing.server.ts will automatically pick up the new
 * subscription status via the activeSubscriptions query.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return redirect("/app?upgraded=1");
}

// This route always redirects — no UI needed.
export default function BillingCallback() {
  return null;
}
