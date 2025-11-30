import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import {
  Page,
  Card,
  Button,
  BlockStack,
  ResourceList,
  ResourceItem,
  Text,
  TextField,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { useState } from "react";

import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);

  if (!session) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const template = await prisma.template.findFirst({
    where: { id: params.id!, shop: session.shop },
    include: {
      // ⬇⬇ If your relation is called `productTemplateLinks` instead of `links`,
      // change this include + the map below to match your schema.
      links: true,
    },
  });

  if (!template) {
    throw new Response("Not found", { status: 404 });
  }

  // Fetch products from Shopify
  const response = await admin.graphql(`
    query {
      products(first: 50) {
        nodes {
          id
          title
          handle
          featuredImage {
            url
          }
        }
      }
    }
  `);

  const { data } = await response.json();
  const products = data.products.nodes;

  const linkedProductIds = template.links.map((link: any) => link.productGid);

  return json({
    template,
    products,
    linkedProductIds,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  // IMPORTANT: use `redirect` from authenticate.admin (embedded-safe)
  const { session, redirect } = await authenticate.admin(request);

  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  const productGid = String(form.get("productGid") || "");

  if (!productGid) {
    return json({ error: "Missing productGid" }, { status: 400 });
  }

  if (intent === "link") {
    // Check if already linked
    const existing = await prisma.productTemplateLink.findFirst({
      where: { productGid, templateId: params.id! },
    });

    if (!existing) {
      await prisma.productTemplateLink.create({
        data: {
          shop: session.shop,
          productGid,
          templateId: params.id!,
        },
      });
    }
  }

  if (intent === "unlink") {
    await prisma.productTemplateLink.deleteMany({
      where: { productGid, templateId: params.id! },
    });
  }

  // Uses Shopify’s redirect helper – required in embedded apps
  return redirect(`/app/templates/${params.id}/products`);
}

export default function TemplateProducts() {
  const { template, products, linkedProductIds } =
    useLoaderData<typeof loader>();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProducts = products.filter((p: any) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Page
      title={`Link Products to "${template.name}"`}
      backAction={{ url: `/app/templates/${template.id}` }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            <Text as="p">
              Select which products should use this template. When customers
              view these products, they&apos;ll see your custom fields.
            </Text>
            <TextField
              label="Search products"
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by product name..."
              autoComplete="off"
              clearButton
              onClearButtonClick={() => setSearchQuery("")}
            />
          </BlockStack>
        </Card>

        <Card>
          <ResourceList
            resourceName={{ singular: "product", plural: "products" }}
            items={filteredProducts}
            renderItem={(product: any) => {
              const isLinked = linkedProductIds.includes(product.id);

              return (
                <ResourceItem
                  id={product.id}
                  media={
                    product.featuredImage ? (
                      <img
                        src={product.featuredImage.url}
                        alt={product.title}
                        style={{ width: 50, height: 50, objectFit: "cover" }}
                      />
                    ) : undefined
                  }
                >
                  <InlineStack align="space-between">
                    <BlockStack gap="100">
                      <Text as="h3" variant="bodyMd" fontWeight="semibold">
                        {product.title}
                      </Text>
                      <Text as="p" tone="subdued">
                        {product.handle}
                      </Text>
                    </BlockStack>
                    <Form method="post">
                      <input
                        type="hidden"
                        name="productGid"
                        value={product.id}
                      />
                      {isLinked ? (
                        <>
                          <Badge tone="success">Linked</Badge>
                          <Button
                            submit
                            name="_intent"
                            value="unlink"
                            tone="critical"
                          >
                            Unlink
                          </Button>
                        </>
                      ) : (
                        <Button submit name="_intent" value="link">
                          Link Template
                        </Button>
                      )}
                    </Form>
                  </InlineStack>
                </ResourceItem>
              );
            }}
          />
        </Card>
      </BlockStack>
    </Page>
  );
}
