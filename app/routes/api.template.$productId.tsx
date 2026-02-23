import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "../db.server";

/**
 * Public API endpoint - returns template data for a product
 * No authentication required (public storefront access)
 * 
 * Usage: GET /api/template/gid%3A%2F%2Fshopify%2FProduct%2F12345
 */

export async function loader({ request, params }: LoaderFunctionArgs) {
  // CORS Headers Helper
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // Handle OPTIONS for CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const productGid = decodeURIComponent(params.productId || "");

  console.log("[API] Template request for product:", productGid);

  if (!productGid) {
    return json(
      { error: "Product ID required" },
      {
        status: 400,
        headers: corsHeaders,
      }
    );
  }

  try {
    // Find the template link for this product
    const link = await prisma.productTemplateLink.findFirst({
      where: { productGid },
      include: {
        template: {
          include: {
            fields: { orderBy: { sort: "asc" } },
            rules: { orderBy: { sort: "asc" } },
          },
        },
      },
    });

    if (!link) {
      console.log("[API] No template found for product:", productGid);
      return json(
        {
          template: null,
          message: "No template found for this product",
        },
        {
          headers: {
            ...corsHeaders,
            "Cache-Control": "public, max-age=60", // Cache for 1 minute
          },
        }
      );
    }

    console.log("[API] Template found:", link.template.name);

    // Merge logic: If product has custom fields/rules, override the template ones natively.
    const resolvedTemplate = { ...link.template };

    if (link.customFieldsJson) {
      console.log("[API] Injecting product-specific custom fields override");
      resolvedTemplate.fields = link.customFieldsJson as any[];
    }

    if (link.customRulesJson) {
      console.log("[API] Injecting product-specific custom rules override");
      resolvedTemplate.rules = link.customRulesJson as any[];
    }

    // Return template data
    return json(
      {
        template: resolvedTemplate,
        productGid,
      },
      {
        headers: {
          ...corsHeaders,
          "Cache-Control": "public, max-age=60",
        },
      }
    );
  } catch (error) {
    console.error("[API] Error fetching template:", error);
    return json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}