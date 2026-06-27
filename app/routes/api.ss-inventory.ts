import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");

  // Since this route is hit from the storefront, we allow CORS
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!shop || !productId) {
    return json({ error: "Missing shop or productId" }, { status: 400, headers: corsHeaders });
  }

  try {
    const productGid = `gid://shopify/Product/${productId}`;

    // Lookup settings and product link concurrently
    const [settings, link] = await Promise.all([
      prisma.storeSettings.findUnique({ where: { shop } }),
      prisma.productTemplateLink.findFirst({
        where: { shop, productGid },
        select: { ssStyleId: true },
      }),
    ]);

    if (!settings || !settings.ssApiUsername || !settings.ssApiKey) {
      return json({ error: "S&S API not configured for this shop" }, { status: 400, headers: corsHeaders });
    }

    if (!link || !link.ssStyleId) {
      return json({ items: [] }, { headers: corsHeaders });
    }

    const ssStyleId = link.ssStyleId.trim();
    
    // Fetch from S&S Activewear
    const ssUrl = `https://api.ssactivewear.com/v2/products/?style=${encodeURIComponent(ssStyleId)}`;
    const auth = Buffer.from(`${settings.ssApiUsername}:${settings.ssApiKey}`).toString('base64');

    const response = await fetch(ssUrl, {
      headers: {
        "Authorization": `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      throw new Error(`S&S API responded with ${response.status}`);
    }

    const data = await response.json();
    
    // Sanitize and format data
    // The S&S API returns an array of variants for the style
    const items = data.map((item: any) => ({
      sku: item.sku,
      color: item.colorName,
      size: item.sizeName,
      qty: (item.qty || [])
        .map((wh: any) => parseInt(wh.qty || 0, 10))
        .reduce((a: number, b: number) => a + b, 0)
    }));

    return json({ items }, { headers: corsHeaders });

  } catch (error: any) {
    console.error("[S&S Inventory API] Error:", error);
    return json({ error: "Failed to fetch inventory" }, { status: 500, headers: corsHeaders });
  }
}
