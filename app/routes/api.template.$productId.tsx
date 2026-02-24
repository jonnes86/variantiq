import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { prisma } from "../db.server";

/**
 * Public API endpoint - returns template data for a product
 * No authentication required (public storefront access)
 * 
 * Usage: GET /api/template/gid%3A%2F%2Fshopify%2FProduct%2F12345
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }
  return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
}

export async function loader({ request, params }: LoaderFunctionArgs) {

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
      select: { // Select specific fields for the productTemplateLink itself
        id: true,
        shop: true,
        createdAt: true,
        productGid: true,
        templateId: true,
        customFieldsJson: true, // Ensure these are selected
        customRulesJson: true,   // Ensure these are selected
        template: {
          include: {
            fields: {
              orderBy: { sort: "asc" },
              select: {
                id: true,
                templateId: true,
                name: true,
                label: true,
                type: true,
                optionsJson: true,
                priceAdjustmentsJson: true,
                variantMappingJson: true, // Include variantMappingJson
                required: true,
                sort: true,
                createdAt: true,
                updatedAt: true,
              },
            },
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