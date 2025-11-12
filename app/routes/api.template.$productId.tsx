import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { prisma } from "../db.server";

export async function loader({ params }: LoaderFunctionArgs) {
  const productId = params.productId;
  
  if (!productId) {
    return json({ error: "Product ID required" }, { status: 400 });
  }

  // Convert numeric ID to GID format
  const productGid = `gid://shopify/Product/${productId}`;

  // Find template linked to this product
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

  if (!link || !link.template) {
    return json({ error: "No template found" }, { status: 404 });
  }

  return json({
    template: {
      id: link.template.id,
      name: link.template.name
    },
    fields: link.template.fields,
    rules: link.template.rules
  }, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=300"
    }
  });
}