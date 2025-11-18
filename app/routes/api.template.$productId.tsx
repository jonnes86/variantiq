import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "../db.server";

/**
 * Public API endpoint - returns template data for a product
 * No authentication required (public storefront access)
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const productGid = decodeURIComponent(params.productId || "");

  if (!productGid) {
    return json({ error: "Product ID required" }, { status: 400 });
  }

  try {
    // Find the template link for this product
    const link = await prisma.productTemplateLink.findFirst({
      where: { productGid },
      include: {
        template: {
          include: {
            fields: { orderBy: { sort: 'asc' } },
            rules: { orderBy: { sort: 'asc' } }
          }
        }
      }
    });

    if (!link) {
      return json({ 
        template: null,
        message: "No template found for this product" 
      });
    }

    // Return template data
    return json(
      { 
        template: link.template,
        productGid 
      },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=300" // Cache for 5 minutes
        }
      }
    );
  } catch (error) {
    console.error("Error fetching template:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}