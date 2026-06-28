import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");
  const directStyleId = url.searchParams.get("styleId"); // For internal admin color fetching

  // Since this route is hit from the storefront, we allow CORS
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let ssApiUsername: string | null = null;
    let ssApiKey: string | null = null;
    let ssStyleId: string | null = null;
    let ssColorsFilter: string[] | null = null;

    if (directStyleId) {
      // Internal admin call — fetch colors for a style ID directly
      // Try to find any store settings with S&S credentials
      const settings = await prisma.storeSettings.findFirst({
        where: { ssApiUsername: { not: null } },
      });
      if (!settings || !settings.ssApiUsername || !settings.ssApiKey) {
        return json({ error: "S&S API not configured" }, { status: 400, headers: corsHeaders });
      }
      ssApiUsername = settings.ssApiUsername;
      ssApiKey = settings.ssApiKey;
      ssStyleId = directStyleId.trim();
      // No color filter for admin — return all colors
      ssColorsFilter = null;
    } else {
      // Storefront call — uses shop + productId
      if (!shop || !productId) {
        return json({ error: "Missing shop or productId" }, { status: 400, headers: corsHeaders });
      }

      const productGid = `gid://shopify/Product/${productId}`;

      // Lookup settings and product link concurrently
      const [settings, link] = await Promise.all([
        prisma.storeSettings.findUnique({ where: { shop } }),
        prisma.productTemplateLink.findFirst({
          where: { shop, productGid },
          select: { ssStyleId: true, ssColorsJson: true },
        }),
      ]);

      if (!settings || !settings.ssApiUsername || !settings.ssApiKey) {
        return json({ error: "S&S API not configured for this shop" }, { status: 400, headers: corsHeaders });
      }

      if (!link || !link.ssStyleId) {
        return json({ items: [] }, { headers: corsHeaders });
      }

      ssApiUsername = settings.ssApiUsername;
      ssApiKey = settings.ssApiKey;
      ssStyleId = link.ssStyleId.trim();
      ssColorsFilter = link.ssColorsJson as string[] | null;
    }

    // Fetch from S&S Activewear
    const ssUrl = `https://api.ssactivewear.com/v2/products/?style=${encodeURIComponent(ssStyleId)}`;
    const auth = Buffer.from(`${ssApiUsername}:${ssApiKey}`).toString('base64');

    const response = await fetch(ssUrl, {
      headers: {
        "Authorization": `Basic ${auth}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "(no body)");
      console.error(`[S&S API] HTTP ${response.status}: ${errorBody.substring(0, 500)}`);
      return json({ error: `S&S API error: HTTP ${response.status}`, detail: errorBody.substring(0, 200) }, { status: 502, headers: corsHeaders });
    }

    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error(`[S&S API] Non-JSON response: ${responseText.substring(0, 500)}`);
      return json({ error: "S&S API returned invalid response", detail: responseText.substring(0, 200) }, { status: 502, headers: corsHeaders });
    }

    // Handle case where S&S returns an error object instead of an array
    if (!Array.isArray(data)) {
      console.error("[S&S API] Unexpected response format:", JSON.stringify(data).substring(0, 500));
      return json({ error: "S&S API returned unexpected format", detail: JSON.stringify(data).substring(0, 200) }, { status: 502, headers: corsHeaders });
    }
    
    // Sanitize and format data
    // The S&S API returns an array of variants for the style
    let items = data.map((item: any) => {
      let totalQty = 0;
      if (typeof item.qty === 'number') {
        totalQty = item.qty;
      } else if (Array.isArray(item.qty)) {
        totalQty = item.qty
          .map((wh: any) => parseInt(wh.qty || 0, 10))
          .reduce((a: number, b: number) => a + b, 0);
      }
      return {
        sku: item.sku,
        color: item.colorName,
        size: item.sizeName,
        qty: totalQty,
      };
    });

    // Filter by selected colors if a filter is set (storefront only)
    if (ssColorsFilter && ssColorsFilter.length > 0) {
      const allowed = new Set(ssColorsFilter);
      items = items.filter((item: any) => allowed.has(item.color));
    }

    return json({ items }, { headers: corsHeaders });

  } catch (error: any) {
    console.error("[S&S Inventory API] Error:", error);
    return json({ error: `Failed to fetch inventory: ${error?.message || String(error)}` }, { status: 500, headers: corsHeaders });
  }
}
