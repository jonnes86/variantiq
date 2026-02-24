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

    // Hydrate Dataset Rules
    const datasetRefs = new Set<string>();
    resolvedTemplate.rules.forEach((rule: any) => {
      if (rule.actionType === "LIMIT_OPTIONS_DATASET" && rule.targetOptionsJson) {
        try {
          const parsed = typeof rule.targetOptionsJson === 'string' ? JSON.parse(rule.targetOptionsJson) : rule.targetOptionsJson;
          if (parsed.datasetId) datasetRefs.add(parsed.datasetId);
        } catch (e) { }
      }
    });

    if (datasetRefs.size > 0) {
      console.log(`[API] Hydrating ${datasetRefs.size} datasets for template`);
      const datasets = await prisma.dataset.findMany({ where: { id: { in: Array.from(datasetRefs) } } });
      const dsMap = datasets.reduce((acc: any, d: any) => {
        acc[d.id] = typeof d.optionsJson === 'string' ? JSON.parse(d.optionsJson) : (d.optionsJson || []);
        return acc;
      }, {});

      resolvedTemplate.rules = resolvedTemplate.rules.map((rule: any) => {
        if (rule.actionType === "LIMIT_OPTIONS_DATASET" && rule.targetOptionsJson) {
          try {
            const parsed = typeof rule.targetOptionsJson === 'string' ? JSON.parse(rule.targetOptionsJson) : rule.targetOptionsJson;
            if (parsed.datasetId && dsMap[parsed.datasetId]) {
              return {
                ...rule,
                actionType: "LIMIT_OPTIONS",
                targetOptionsJson: JSON.stringify(dsMap[parsed.datasetId])
              };
            }
          } catch (e) { }
        }
        return rule;
      });
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
  } catch (error: any) {
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