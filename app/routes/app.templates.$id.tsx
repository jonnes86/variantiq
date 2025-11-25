import {
  json,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import {
  useLoaderData,
  Form,
  useSubmit,
  useNavigate,
} from "@remix-run/react";
import {
  Page,
  Card,
  TextField,
  Button,
  BlockStack,
  ButtonGroup,
  Select,
  Checkbox,
  Badge,
  InlineStack,
  Text,
  Divider,
  Tabs,
  ResourceList,
  ResourceItem,
  Banner,
} from "@shopify/polaris";
import { DeleteIcon, EditIcon } from "@shopify/polaris-icons";
import { prisma } from "../db.server";
import { useState, useEffect, useCallback } from "react";
import { authenticateAdminSafe } from "../shopify.server";

// --- Loader ---
export async function loader({ request, params }: LoaderFunctionArgs) {
  const { session, admin } = await authenticateAdminSafe(request);
  if (!session || !admin) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const templateId = params.id!;
  const template = await prisma.template.findFirst({
    where: { id: templateId, shop: session.shop },
    include: {
      fields: { orderBy: { sort: "asc" } },
      rules: { orderBy: { sort: "asc" } },
      links: true,
    },
  });

  if (!template) throw new Response("Not found", { status: 404 });

  const hasReadProducts = session.scope?.includes("read_products");
  let products: any[] = [];
  let productsError: string | null = null;

  if (hasReadProducts) {
    try {
      const response = await admin.graphql(`
        query Products($first: Int!) {
          products(first: $first) {
            nodes {
              id
              title
              handle
              featuredImage { url }
            }
          }
        }
      `, { variables: { first: 50 } });

      const { data } = await response.json();
      products = data?.products?.nodes ?? [];
    } catch (error: any) {
      productsError = error.message;
    }
  }

  return json({
    template,
    products,
    productsError,
    hasReadProducts,
    currentScope: session.scope,
  });
}

// --- Action ---
export async function action({ request, params }: ActionFunctionArgs) {
  const { session } = await authenticateAdminSafe(request);
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const form = await request.formData();
  const intent = String(form.get("_intent") || "");
  const templateId = params.id!;

  switch (intent) {
    case "rename": {
      const name = String(form.get("name") || "").trim();
      if (name) {
        await prisma.template.update({
          where: { id: templateId, shop: session.shop },
          data: { name },
        });
      }
      return redirect(`/app/templates/${templateId}`);
    }

    case "delete": {
      await prisma.template.delete({
        where: { id: templateId, shop: session.shop },
      });
      return redirect("/app/templates");
    }

    case "addField": {
      const type = String(form.get("type"));
      const name = String(form.get("fieldName") || "").trim();
      const label = String(form.get("label") || "").trim();
      const required = form.get("required") === "true";
      const optionsRaw = form.get("options");

      let optionsJson = null;
      if (optionsRaw && String(optionsRaw).trim()) {
        try {
          optionsJson = JSON.parse(String(optionsRaw));
        } catch (e) {
          console.error("Failed to parse options:", e);
        }
      }

      if (name && label) {
        const maxSort = await prisma.field.findFirst({
          where: { templateId },
          orderBy: { sort: "desc" },
          select: { sort: true },
        });

        await prisma.field.create({
          data: {
            templateId,
            type,
            name,
            label,
            required,
            optionsJson,
            sort: (maxSort?.sort || 0) + 1,
          },
        });
      }
      return redirect(`/app/templates/${templateId}`);
    }

    case "deleteField": {
      const fieldId = String(form.get("fieldId"));
      await prisma.field.delete({
        where: { id: fieldId, templateId },
      });
      return redirect(`/app/templates/${templateId}`);
    }

    case "updateField": {
      const fieldId = String(form.get("fieldId"));
      const label = String(form.get("label") || "").trim();
      const required = form.get("required") === "true";
      const optionsRaw = form.get("options");

      let optionsJson = null;
      if (optionsRaw && String(optionsRaw).trim()) {
        try {
          optionsJson = JSON.parse(String(optionsRaw));
        } catch (e) {
          console.error("Failed to parse options JSON:", e);
        }
      }

      await prisma.field.update({
        where: { id: fieldId, templateId },
        data: { label, required, optionsJson },
      });
      return redirect(`/app/templates/${templateId}`);
    }

    case "addRule": {
      const parentFieldId = String(form.get("parentFieldId"));
      const parentValue = String(form.get("parentValue"));
      const childFieldId = String(form.get("childFieldId"));
      const childOptionsRaw = form.get("childOptions");

      let childOptionsJson = null;
      if (childOptionsRaw && String(childOptionsRaw).trim()) {
        try {
          childOptionsJson = JSON.parse(String(childOptionsRaw));
        } catch (e) {
          console.error("Failed to parse child options:", e);
        }
      }

      if (parentFieldId && parentValue && childFieldId) {
        const maxSort = await prisma.rule.findFirst({
          where: { templateId },
          orderBy: { sort: "desc" },
          select: { sort: true },
        });

        await prisma.rule.create({
          data: {
            templateId,
            parentFieldId,
            parentValue,
            childFieldId,
            childOptionsJson,
            sort: (maxSort?.sort || 0) + 1,
          },
        });
      }
      return redirect(`/app/templates/${templateId}`);
    }

    case "deleteRule": {
      const ruleId = String(form.get("ruleId"));
      await prisma.rule.delete({
        where: { id: ruleId, templateId },
      });
      return redirect(`/app/templates/${templateId}`);
    }

    case "linkProduct": {
      const productGid = String(form.get("productGid"));
      await prisma.productTemplateLink.upsert({
        where: {
          shop_productGid_templateId: {
            shop: session.shop,
            productGid,
            templateId,
          },
        },
        update: {},
        create: { shop: session.shop, productGid, templateId },
      });
      return redirect(`/app/templates/${templateId}`);
    }

    case "unlinkProduct": {
      const productGid = String(form.get("productGid"));
      await prisma.productTemplateLink.deleteMany({
        where: { shop: session.shop, productGid, templateId },
      });
      return redirect(`/app/templates/${templateId}`);
    }

    default:
      return redirect(`/app/templates/${templateId}`);
  }
}

// --- Component ---
export default function TemplateDetail() {
  const {
    template,
    products,
    productsError,
    hasReadProducts,
    currentScope,
  } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigate = useNavigate();

  const [selectedTab, setSelectedTab] = useState(0);
  const [templateName, setTemplateName] = useState(template.name);
  const [searchQuery, setSearchQuery] = useState("");
  const [optimisticLinks, setOptimisticLinks] = useState<Set<string>>(new Set());

  useEffect(() => {
    setTemplateName(template.name);
  }, [template.name]);

  const tabs = [
    { id: "fields", content: "Fields", panelID: "fields-panel" },
    { id: "products", content: "Products", panelID: "products-panel" },
    { id: "rules", content: "Rules", panelID: "rules-panel" },
  ];

  const linkedProductIds = template.links.map((link: any) => link.productGid);
  const filteredProducts = products.filter((p: any) =>
    p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Polaris UI continues here (Fields, Products, Rules tabs)
  // Keep your existing JSX for AddFieldForm, EditFieldForm, AddRuleForm
  // No changes needed there — they already work with the updated actions.
}
