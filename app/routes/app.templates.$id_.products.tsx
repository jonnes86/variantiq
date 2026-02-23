// Filename: app/routes/app.templates.$id_.products.tsx
import { json, redirect, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, Link, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  ResourceList,
  ResourceItem,
  Badge,
  Button,
  LegacyStack,
  Banner,
  InlineStack,
  Thumbnail,
  TextField,
  BlockStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { useState, useCallback, useEffect } from "react";

// --- GraphQL Query to fetch products with pagination ---
const PRODUCTS_QUERY = `
  query GetProducts($first: Int, $after: String, $last: Int, $before: String, $query: String) {
    products(first: $first, after: $after, last: $last, before: $before, query: $query) {
      pageInfo {
        hasNextPage
        hasPreviousPage
        endCursor
        startCursor
      }
      edges {
        node {
          id
          title
          vendor
          featuredImage {
            url
            altText
          }
        }
      }
    }
  }
`;

// --- Loader ---
export async function loader({ request, params }: LoaderFunctionArgs) {
  try {
    const { session, admin } = await authenticate.admin(request);
    if (!session) {
      return redirect("/auth/login");
    }

    const templateId = params.id;
    if (!templateId) return redirect("/app");

    if (!prisma) throw new Error("Database connection failed");

    // 1. Load the template and linked products from the database
    const template = await prisma.template.findFirst({
      where: { id: templateId, shop: session.shop },
      include: {
        links: true, // 'links' relation holds productTemplateLink entries
      },
    });
    if (!template) {
      throw new Response("Template not found.", { status: 404 });
    }
    const linkedProductIds = template.links.map((link: any) => link.productGid);

    // 2. Determine pagination direction based on query params
    const url = new URL(request.url);
    const afterCursor = url.searchParams.get("cursor");
    const beforeCursor = url.searchParams.get("before");

    // Setup GraphQL variables for forward (after) or backward (before) pagination
    let variables: { first?: number; after?: string; last?: number; before?: string; query?: string } = {};

    const search = url.searchParams.get("search");
    if (search) {
      variables.query = `title:*${search}*`;
    }

    if (beforeCursor) {
      // Going to previous page: use 'before' cursor with last:25
      variables.before = beforeCursor;
      variables.last = 25;
    } else {
      // Initial or next page: use 'after' cursor (if any) with first:25
      variables.first = 25;
      if (afterCursor) {
        variables.after = afterCursor;
      }
    }

    // 3. Fetch products from Shopify Admin GraphQL with pagination
    const response = await admin.graphql(PRODUCTS_QUERY, { variables });
    const responseJson = await response.json();
    if ((responseJson as any).errors) {
      console.error("GraphQL Errors:", (responseJson as any).errors);
      throw new Error("Failed to fetch products from Shopify");
    }
    const productConnection = responseJson.data.products;
    const products = productConnection.edges.map((edge: any) => edge.node);

    // Sort so linked products appear at the top locally
    products.sort((a: any, b: any) => {
      const aLinked = linkedProductIds.includes(a.id);
      const bLinked = linkedProductIds.includes(b.id);
      if (aLinked && !bLinked) return -1;
      if (!aLinked && bLinked) return 1;
      return 0;
    });

    const pageInfo = productConnection.pageInfo;

    return json({
      template: { id: template.id, name: template.name },
      products,
      linkedProductIds,
      searchQuery: search || "",
      // Include pagination cursors for UI navigation
      nextPageCursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
      previousPageCursor: pageInfo.hasPreviousPage ? pageInfo.startCursor : null,
      error: null
    });
  } catch (error) {
    console.error("Products Loader Error:", error);
    if (error instanceof Response) throw error;
    return json({
      template: { id: "", name: "Error" },
      products: [],
      linkedProductIds: [],
      searchQuery: "",
      nextPageCursor: null,
      previousPageCursor: null,
      error: "Failed to load products. Please check server logs."
    });
  }
}

// --- Action ---
export async function action({ request, params }: ActionFunctionArgs) {
  try {
    const { session } = await authenticate.admin(request);
    if (!session) return redirect("/auth/login");

    const templateId = params.id!;
    const formData = await request.formData();
    const intent = formData.get("_intent");
    const productGid = formData.get("productGid") as string;
    const shop = session.shop;

    if (!productGid) {
      return json({ error: "Missing required data." }, { status: 400 });
    }
    if (!prisma) throw new Error("Database connection failed");

    // Handle link or unlink actions
    if (intent === "link") {
      await prisma.productTemplateLink.create({
        data: { shop, templateId, productGid }
      });
    } else if (intent === "unlink") {
      await prisma.productTemplateLink.deleteMany({
        where: { shop, templateId, productGid }
      });
    }

    // Returning null triggers a loader reload (refreshing the product list)
    return null;
  } catch (error) {
    console.error("Products Action Error:", error);
    if (error instanceof Response) throw error;
    return json({ error: "Failed to update product link." }, { status: 500 });
  }
}

// --- Component ---
export default function TemplateProductsPage() {
  const { template, products, linkedProductIds, searchQuery, nextPageCursor, previousPageCursor, error } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const [searchValue, setSearchValue] = useState(searchQuery);

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
    },
    []
  );

  useEffect(() => {
    // Debounce search as the user types
    const timer = setTimeout(() => {
      // Prevent unnecessary request if search hasn't changed from original load
      if (searchValue !== searchQuery) {
        submit(searchValue ? { search: searchValue } : {}, { method: "get", replace: true, preventScrollReset: true });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchValue, submit, searchQuery]);

  const handleSearchClear = () => {
    setSearchValue("");
    submit({}, { method: "get" });
  };

  if (error) {
    return (
      <Page title="Manage Product Links">
        <Banner tone="critical" title="Error">
          <p>{error}</p>
        </Banner>
      </Page>
    );
  }

  const resourceName = {
    singular: "product",
    plural: "products",
  };

  return (
    <Page
      title={`Link Products to: ${template.name}`}
      backAction={{ content: "Template Detail", url: `/app/templates/${template.id}?tab=products` }}
      subtitle="Select which Shopify products should use this template."
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Available Products ({products.length})
              </Text>

              <InlineStack gap="300" blockAlign="center">
                <div style={{ flexGrow: 1 }}>
                  <TextField
                    label="Search products"
                    labelHidden
                    value={searchValue}
                    onChange={handleSearchChange}
                    clearButton
                    onClearButtonClick={handleSearchClear}
                    autoComplete="off"
                    placeholder="Search by product title..."
                  />
                </div>
              </InlineStack>

              <ResourceList
                resourceName={resourceName}
                items={products}
                renderItem={(product: any) => {
                  const isLinked = linkedProductIds.includes(product.id);
                  const actionVerb = isLinked ? "Unlink" : "Link";
                  // product.id is a gid, we only want the numeric ID for the URL route
                  const numericProductId = product.id.split('/').pop();

                  const media = (
                    <Thumbnail
                      source={
                        product.featuredImage?.url ||
                        "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png?format=webp&v=1530129081"
                      }
                      alt={product.featuredImage?.altText || product.title}
                    />
                  );

                  return (
                    <ResourceItem
                      id={product.id}
                      accessibilityLabel={`View details for ${product.title}`}
                      name={product.title}
                      media={media}
                      onClick={() => { }}
                    >
                      <LegacyStack alignment="center">
                        <LegacyStack.Item fill>
                          <Text variant="headingMd" as="h3">{product.title}</Text>
                          <Text variant="bodySm" as="p" tone="subdued">{product.vendor}</Text>
                        </LegacyStack.Item>
                        <LegacyStack.Item>
                          {isLinked && <Badge tone="success">Linked</Badge>}
                        </LegacyStack.Item>
                        <LegacyStack.Item>
                          <InlineStack gap="200" align="end">
                            {isLinked && (
                              <Button
                                url={`/app/templates/${template.id}/products/${numericProductId}`}
                              >
                                Customize
                              </Button>
                            )}
                            <Form method="post">
                              <input type="hidden" name="productGid" value={product.id} />
                              <input type="hidden" name="_intent" value={isLinked ? "unlink" : "link"} />
                              <Button
                                submit
                                variant={isLinked ? undefined : "primary"}
                              >
                                {actionVerb}
                              </Button>
                            </Form>
                          </InlineStack>
                        </LegacyStack.Item>
                      </LegacyStack>
                    </ResourceItem>
                  );
                }}
              />
              {/* Pagination Controls */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1rem" }}>
                {previousPageCursor ? (
                  <Link
                    to={`/app/templates/${template.id}/products?before=${previousPageCursor}`}
                    style={{ textDecoration: "none" }}
                  >
                    <Button>Previous Page</Button>
                  </Link>
                ) : (
                  <Button disabled>Previous Page</Button>
                )}
                {nextPageCursor ? (
                  <Link
                    to={`/app/templates/${template.id}/products?cursor=${nextPageCursor}`}
                    style={{ textDecoration: "none" }}
                  >
                    <Button variant="primary">Next Page</Button>
                  </Link>
                ) : (
                  <Button disabled variant="primary">Next Page</Button>
                )}
              </div>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
