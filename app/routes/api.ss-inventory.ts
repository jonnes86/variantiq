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
    let localInventory: Record<string, number> | null = null;

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
          select: { ssStyleId: true, ssColorsJson: true, localInventoryJson: true },
        }),
      ]);

      if (!settings || !settings.ssApiUsername || !settings.ssApiKey) {
        return json({ error: "S&S API not configured for this shop" }, { status: 400, headers: corsHeaders });
      }

      if (!link || !link.ssStyleId) {
        // Even without S&S style, return local inventory if available
        if (link?.localInventoryJson) {
          const localInv = link.localInventoryJson as Record<string, number>;
          const localItems: any[] = [];
          Object.entries(localInv).forEach(([key, qty]) => {
            const [color, size] = key.split(':');
            if (color && size && qty > 0) {
              localItems.push({ sku: `local-${color}-${size}`, color, size, qty });
            }
          });
          return json({ items: localItems }, { headers: corsHeaders });
        }
        return json({ items: [] }, { headers: corsHeaders });
      }

      ssApiUsername = settings.ssApiUsername;
      ssApiKey = settings.ssApiKey;
      ssStyleId = link.ssStyleId.trim();
      ssColorsFilter = link.ssColorsJson as string[] | null;
      localInventory = link.localInventoryJson as Record<string, number> | null;
    }

    // Fetch from S&S Activewear - products + styles in parallel
    const ssProductsUrl = `https://api.ssactivewear.com/v2/products/?partnumber=${encodeURIComponent(ssStyleId)}`;
    const ssStylesUrl = `https://api.ssactivewear.com/v2/styles/?partnumber=${encodeURIComponent(ssStyleId)}`;
    const auth = Buffer.from(`${ssApiUsername}:${ssApiKey}`).toString('base64');
    const authHeaders = { "Authorization": `Basic ${auth}` };

    const [response, stylesResponse] = await Promise.all([
      fetch(ssProductsUrl, { headers: authHeaders }),
      fetch(ssStylesUrl, { headers: authHeaders }).catch(() => null),
    ]);

    // Try to extract the full title from the styles endpoint
    let styleFullTitle = '';
    if (stylesResponse && stylesResponse.ok) {
      try {
        const stylesData = await stylesResponse.json();
        if (Array.isArray(stylesData) && stylesData.length > 0) {
          styleFullTitle = stylesData[0].title || stylesData[0].baseCategory || '';
          console.log("[S&S Styles API] Title:", styleFullTitle, "Keys:", Object.keys(stylesData[0]).join(', '));
        }
      } catch (e) {
        console.warn("[S&S Styles API] Parse error:", e);
      }
    }

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
    // Log first item keys for debugging
    let rawSample: any = null;
    if (data.length > 0) {
      console.log("[S&S API] Sample item keys:", Object.keys(data[0]).join(', '));
      // Capture a subset of raw fields for debugging
      rawSample = {};
      for (const key of Object.keys(data[0])) {
        const val = data[0][key];
        if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean' || val === null) {
          rawSample[key] = val;
        }
      }
    }
    let items = data
      // Filter out drop-ship only items
      .filter((item: any) => !item.dropShip)
      .map((item: any) => {
        let totalQty = 0;
        if (Array.isArray(item.warehouses)) {
          // Use per-warehouse data, excluding drop-ship warehouses (contain "DS" or "Drop Ship")
          totalQty = item.warehouses
            .filter((wh: any) => {
              const name = (wh.warehouseAbbr || wh.warehouseName || '').toString();
              return !name.includes('(DS)') && !name.toUpperCase().includes('DS');
            })
            .map((wh: any) => parseInt(wh.qty || 0, 10))
            .reduce((a: number, b: number) => a + b, 0);
        } else if (typeof item.qty === 'number') {
          totalQty = item.qty;
        } else if (Array.isArray(item.qty)) {
          // Legacy format: qty is an array of warehouse objects
          totalQty = item.qty
            .filter((wh: any) => {
              const name = (wh.warehouseAbbr || wh.warehouseName || '').toString();
              return !name.includes('(DS)') && !name.toUpperCase().includes('DS');
            })
            .map((wh: any) => parseInt(wh.qty || 0, 10))
            .reduce((a: number, b: number) => a + b, 0);
        }
        return {
          sku: item.sku,
          color: item.colorName,
          size: item.sizeName,
          qty: totalQty,
          styleName: item.styleName || '',
          brandName: item.brandName || '',
          colorSwatchImage: item.colorSwatchImage
            ? (item.colorSwatchImage.startsWith('http') ? item.colorSwatchImage : `https://www.ssactivewear.com/${item.colorSwatchImage}`)
            : null,
          colorSwatchTextColor: item.colorSwatchTextColor || null,
        };
      });

    // Extract style/brand/title from first raw data item for display
    const styleName = items.length > 0 ? items[0].styleName : '';
    const brandName = items.length > 0 ? items[0].brandName : '';
    const styleTitle = styleFullTitle || (data.length > 0 ? (data[0].title || data[0].styleName || '') : '');

    // Add local inventory overrides
    if (localInventory) {
      Object.entries(localInventory).forEach(([key, localQty]) => {
        if (localQty <= 0) return;
        const [color, size] = key.split(':');
        if (!color || !size) return;

        // Find existing item and add to it, or create new
        const existing = items.find((i: any) => i.color === color && i.size === size);
        if (existing) {
          existing.qty += localQty;
        } else {
          items.push({ sku: `local-${color}-${size}`, color, size, qty: localQty });
        }
      });
    }

    // Filter by selected colors if a filter is set (storefront only)
    if (ssColorsFilter && ssColorsFilter.length > 0) {
      const allowed = new Set(ssColorsFilter);
      items = items.filter((item: any) => allowed.has(item.color));
    }

    return json({ items, styleName, brandName, styleTitle, rawSample }, { headers: corsHeaders });

  } catch (error: any) {
    console.error("[S&S Inventory API] Error:", error);
    return json({ error: `Failed to fetch inventory: ${error?.message || String(error)}` }, { status: 500, headers: corsHeaders });
  }
}
