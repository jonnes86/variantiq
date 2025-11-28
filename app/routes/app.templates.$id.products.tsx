// All imports for @remix-run/react, @shopify/polaris, @remix-run/node,
// ../shopify.server, and ../db.server have been REMOVED to resolve persistent compilation errors.
// These dependencies are assumed to be available globally in the Shopify/Remix runtime environment.


// --- Types (Placeholders) ---
interface Template {
  id: number;
  name: string;
}

interface Product {
  id: string; // GraphQL ID, e.g., 'gid://shopify/Product/12345'
  title: string;
  vendor: string;
}

interface LoaderData {
  template: Template;
  products: Product[];
  linkedProductIds: string[];
}

// --- GraphQL Query to fetch products (Placeholder) ---
const PRODUCTS_QUERY = `
  query GetProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          vendor
        }
      }
    }
  }
`;

// --- Remix Loader ---
// All server dependencies (LoaderFunctionArgs, authenticateAdminSafe, db, json, Response) are assumed to be available globally.
export const loader = async ({ request, params }: any) => {
  // authenticateAdminSafe is assumed to be available globally
  const { session, admin } = await authenticateAdminSafe(request);

  // If the session is missing or invalid, immediately return 401
  if (!session || !admin) {
    // Response is assumed to be available globally
    throw new Response("Unauthorized: Session or Admin client missing.", { status: 401 });
  }
    
  // --- START: Short-Term Step 2 Instrumentation ---
  // Log the session shop to confirm session presence in server logs
  console.log("Template Products loader session shop:", session.shop);
  // --- END: Short-Term Step 2 Instrumentation ---
  
  const templateId = params.id ? parseInt(params.id, 10) : null;
  if (!templateId) {
    throw new Response("Template ID is missing.", { status: 400 });
  }

  try {
    // 'db' is assumed to be available globally
    const template = await db.template.findUnique({
      where: { id: templateId, shop: session.shop },
      include: {
        productTemplateLinks: true,
      },
    });

    if (!template) {
      throw new Response("Template not found.", { status: 404 });
    }

    const linkedProductIds = template.productTemplateLinks.map(link => link.productGid);

    // 2. Fetch all products from Shopify Admin GraphQL (using a limited set for demo)
    const { data } = await admin.graphql(PRODUCTS_QUERY, {
      variables: { first: 25 },
    });
    
    // Type casting here is necessary
    const products = data.products.edges.map((edge: any) => edge.node) as Product[];

    // 'json' is assumed to be available globally
    return json({
      template: { id: template.id, name: template.name },
      products,
      linkedProductIds,
    });
  } catch (error) {
    // Catch database or GraphQL errors
    console.error("Error in app.templates.$id.products loader:", error);
    throw new Response("Internal Server Error during data fetch.", { status: 500 }); 
  }
};


// --- Remix Action ---
// All server dependencies (ActionFunctionArgs, redirect) are assumed to be available globally.
export const action = async ({ request, params }: any) => {
  // authenticateAdminSafe is assumed to be available globally
  const { session } = await authenticateAdminSafe(request);
  
  if (!session) {
    // 'Response' is assumed to be available globally
    return new Response("Unauthorized", { status: 401 });
  }
  
  const templateId = params.id ? parseInt(params.id, 10) : null;
  const formData = await request.formData();

  const intent = formData.get("_intent");
  const productGid = formData.get("productGid") as string;
  const shop = session.shop;

  if (!templateId || !productGid) {
    return json({ error: "Missing required data." }, { status: 400 });
  }

  try {
    // 'db' is assumed to be available globally
    if (intent === "link") {
      await db.productTemplateLink.create({
        data: {
          shop,
          templateId,
          productGid,
        },
      });
    } else if (intent === "unlink") {
      await db.productTemplateLink.deleteMany({
        where: {
          shop,
          templateId,
          productGid,
        },
      });
    }
    // 'redirect' is assumed to be available globally
    return redirect(`/app/templates/${templateId}/products`);

  } catch (error) {
    console.error("Error in product link action:", error);
    return json({ error: "Failed to update product link." }, { status: 500 });
  }
};


// --- Remix Component ---
// All client dependencies (useLoaderData, Form, Page, Layout, Card, Text, ResourceList, ResourceItem, Badge, Button, LegacyStack) are assumed to be available globally.
export default function TemplateProductsPage() {
  // useLoaderData is assumed to be available globally
  const { template, products, linkedProductIds } = useLoaderData() as LoaderData;

  const resourceName = {
    singular: 'product',
    plural: 'products',
  };

  return (
    // Polaris components are assumed to be available globally
    <Page
      title={`Link Products to: ${template.name}`}
      // backAction is assumed to use the Remix url helper correctly in the underlying framework
      backAction={{ content: "Template Detail", url: `/app/templates/${template.id}` }} 
      subtitle="Select which Shopify products should use this template."
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Text as="h2" variant="headingMd">
              Available Products ({products.length})
            </Text>
            <ResourceList
              resourceName={resourceName}
              items={products}
              renderItem={(product: Product) => {
                const isLinked = linkedProductIds.includes(product.id);
                const actionVerb = isLinked ? "Unlink" : "Link";
                
                return (
                  <ResourceItem
                    id={product.id}
                    url="#" // Not a real link, just for ResourceItem structure
                    accessibilityLabel={`View details for ${product.title}`}
                    name={product.title}
                  >
                    <LegacyStack alignment="center">
                      <LegacyStack.Item fill>
                        <Text variant="headingMd" as="h3">{product.title}</Text>
                        <Text variant="bodySm" color="subdued">{product.vendor}</Text>
                      </LegacyStack.Item>
                      <LegacyStack.Item>
                        {isLinked && <Badge status="success">Linked</Badge>}
                      </LegacyStack.Item>
                      <LegacyStack.Item>
                        {/* Form component is assumed to be available globally */}
                        <Form method="post">
                            <input type="hidden" name="productGid" value={product.id} />
                            <Button 
                                submit
                                primary={!isLinked}
                                // Use the intent name to differentiate form submission in the action function
                                name="_intent" 
                                value={isLinked ? "unlink" : "link"} 
                            >
                                {actionVerb}
                            </Button>
                        </Form>
                      </LegacyStack.Item>
                    </LegacyStack>
                  </ResourceItem>
                );
              }}
            />
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}