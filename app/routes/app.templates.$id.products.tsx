import { json, type LoaderFunctionArgs, type ActionFunctionArgs, redirect } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { session, admin } = await authenticate.admin(request);
    
    return json({
      debug: "SESSION INFO",
      sessionId: session.id,
      shop: session.shop,
      scope: session.scope,
      isOnline: session.isOnline,
      accessToken: session.accessToken ? "EXISTS" : "MISSING"
    });
    
  } catch (error: any) {
    return json({
      debug: "AUTH ERROR",
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");

  if (intent === "link") {
    const productGid = String(form.get("productGid"));
    const existing = await prisma.productTemplateLink.findFirst({
      where: { productGid, templateId: params.id! }
    });
    if (!existing) {
      await prisma.productTemplateLink.create({
        data: { shop: session.shop, productGid, templateId: params.id! }
      });
    }
  }

  if (intent === "unlink") {
    const productGid = String(form.get("productGid"));
    await prisma.productTemplateLink.deleteMany({
      where: { productGid, templateId: params.id! }
    });
  }

  return redirect(`/app/templates/${params.id}/products`);
}

export default function TemplateProducts() {
  const data = useLoaderData<typeof loader>();
  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}