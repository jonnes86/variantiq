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

  if (request.method === "POST") {
    try {
      const data = await request.json();
      const { templateId, event } = data;

      if (templateId) {
        if (event === 'view') {
          await prisma.template.update({
            where: { id: templateId },
            data: { views: { increment: 1 } }
          });
        } else if (event === 'add_to_cart') {
          await prisma.template.update({
            where: { id: templateId },
            data: { addsToCart: { increment: 1 } }
          });
        }
      }
      return json({ success: true }, { headers: corsHeaders });
    } catch (e) {
      console.error("[API] Analytics tracking error:", e);
      return json({ error: "Failed to track analytics" }, { status: 400, headers: corsHeaders });
    }
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
      resolvedTemplate.fields = typeof link.customFieldsJson === 'string' ? JSON.parse(link.customFieldsJson) : link.customFieldsJson;
    }

    if (link.customRulesJson) {
      console.log("[API] Injecting product-specific custom rules override");
      resolvedTemplate.rules = typeof link.customRulesJson === 'string' ? JSON.parse(link.customRulesJson) : link.customRulesJson;
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
        const parsedOptions = typeof d.optionsJson === 'string' ? JSON.parse(d.optionsJson) : (d.optionsJson || []);
        acc[d.id] = { ...d, optionsJson: parsedOptions };
        return acc;
      }, {});

      resolvedTemplate.rules = resolvedTemplate.rules.map((rule: any) => {
        if (rule.actionType === "LIMIT_OPTIONS_DATASET" && rule.targetOptionsJson) {
          try {
            const parsed = typeof rule.targetOptionsJson === 'string' ? JSON.parse(rule.targetOptionsJson) : rule.targetOptionsJson;
            if (parsed.datasetId && dsMap[parsed.datasetId]) {
              const ds = dsMap[parsed.datasetId];

              // Mutate the Native Field stub that the Visual Rule Builder generated for this dataset,
              // overwriting it with the live global Dataset properties so it stays perfectly synced.
              const targetField = resolvedTemplate.fields.find((f: any) => f.id === rule.targetFieldId);
              if (targetField) {
                targetField.optionsJson = ds.optionsJson;
                targetField.label = ds.label || ds.name;
                targetField.type = ds.type || "select";
              }

              return {
                ...rule,
                actionType: "LIMIT_OPTIONS",
                targetOptionsJson: JSON.stringify(ds.optionsJson)
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
          "Cache-Control": "no-cache, no-store, must-revalidate",
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