import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { Page, Card, Button, BlockStack, ResourceList, ResourceItem, Text, TextField, InlineStack, Badge } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { useState } from "react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { session, admin } = await authenticate.admin(request);
    
    // Show session details directly in browser
    return new Response(JSON.stringify({
      debug: "SESSION INFO",
      sessionId: session.id,
      shop: session.shop,
      scope: session.scope,
      isOnline: session.isOnline,
      accessToken: session.accessToken ? "EXISTS" : "MISSING"
    }, null, 2), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
    
  } catch (error: any) {
    return new Response(JSON.stringify({
      debug: "AUTH ERROR",
      error: error.message,
      stack: error.stack
    }, null, 2), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
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
        data: {
          shop: session.shop,
          productGid,
          templateId: params.id!,
        }
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
  return <div>Debug mode - check JSON output</div>;
}