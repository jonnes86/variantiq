import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "../db.server";

/**
 * Public API endpoint - returns template data for a product
 * No authentication required (public storefront access)
 * 
 * Usage: GET /api/template/gid%3A%2F%2Fshopify%2FProduct%2F12345
 */

// Handle OPTIONS for CORS preflight
export async function loader({ request, params }: LoaderFunctionArgs) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  const productGid = decodeURIComponent(params.productId || "");

  console.log("[API] Template request for product:", productGid);

  if (!productGid) {
    return json(
      { error: "Product ID required" },
      {
        status: 400,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
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
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=60", // Cache for 1 minute
          },
        }
      );
    }

    console.log("[API] Template found:", link.template.name);

    // Return template data
    return json(
      {
        template: link.template,
        productGid,
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Cache-Control": "public, max-age=300", // Cache for 5 minutes
        },
      }
    );
  } catch (error) {
    console.error("[API] Error fetching template:", error);
    return json(
      { error: "Internal server error" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
}