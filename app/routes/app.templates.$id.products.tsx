import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { Page, Card, Button, BlockStack, ResourceList, ResourceItem, Text, TextField, InlineStack, Badge } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { useState } from "react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session, admin } = await authenticate.admin(request);
  
  const template = await prisma.template.findFirst({
    where: { id: params.id!, shop: session.shop },
    include: { links: true },
  });
  
  if (!template) throw new Response("Not found", { status: 404 });

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
  const linkedProductIds = template.links.map(link => link.productGid);

  return json({ 
    template, 
    products: data.products.nodes,
    linkedProductIds 
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("_intent") || "");

  if (intent === "link") {
    const productGid = String(form.get("productGid"));
    
    // Check if already linked
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
  const { template, products, linkedProductIds } = useLoaderData<typeof loader>();
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
              Select which products should use this template. When customers view these products,
              they'll see your custom fields.
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
            resourceName={{ singular: 'product', plural: 'products' }}
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
                        style={{ width: 50, height: 50, objectFit: 'cover' }}
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
                      <input type="hidden" name="productGid" value={product.id} />
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