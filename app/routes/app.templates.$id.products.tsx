import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
import { Page, Card, Button, BlockStack, ResourceList, ResourceItem, Text, TextField, InlineStack, Badge, Banner } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { useState } from "react";

export async function loader({ request, params }: LoaderFunctionArgs) {
  // TEMPORARY - authentication disabled for testing
  return json({ 
    template: {
      id: params.id,
      name: "Short Sleeve T-Shirts",
      shop: "atestteamstore.myshopify.com"
    },
    products: [
      { id: "gid://shopify/Product/1", title: "Test Product 1", handle: "test-1", featuredImage: null },
      { id: "gid://shopify/Product/2", title: "Test Product 2", handle: "test-2", featuredImage: null }
    ],
    linkedProductIds: [],
    error: null,
    currentScope: "testing-no-auth"
  });
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
  const { template, products, linkedProductIds, error, errorMessage, currentScope } = useLoaderData<typeof loader>();
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
        <Banner tone="info">
          <p><strong>Testing Mode:</strong> Authentication is temporarily disabled.</p>
          <p>Current scope: {currentScope}</p>
        </Banner>

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
                        <InlineStack gap="200">
                          <Badge tone="success">Linked</Badge>
                          <Button 
                            submit 
                            name="_intent" 
                            value="unlink"
                            tone="critical"
                          >
                            Unlink
                          </Button>
                        </InlineStack>
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