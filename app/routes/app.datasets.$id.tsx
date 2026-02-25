import { useState, useCallback } from "react";
import { json, redirect } from "@remix-run/node";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useNavigate } from "@remix-run/react";
import {
    Page,
    Layout,
    Card,
    BlockStack,
    TextField,
    Button,
    Text,
    PageActions,
    InlineStack,
    Banner,
    Select
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
    const { session } = await authenticate.admin(request);
    const id = params.id;

    const dataset = await prisma.dataset.findUnique({
        where: { id, shop: session.shop },
    });

    if (!dataset) {
        return redirect("/app");
    }

    let parsedOptions: string[] = [];
    try {
        parsedOptions = typeof dataset.optionsJson === 'string'
            ? JSON.parse(dataset.optionsJson)
            : (Array.isArray(dataset.optionsJson) ? dataset.optionsJson : []);
    } catch (e) { }

    // Explicitly carry label + type through Remix's json serializer,
    // because Remix's JsonifyObject sometimes strips non-standard Prisma fields.
    const safeDataset = {
        ...dataset,
        label: (dataset as any).label ?? "",
        type: (dataset as any).type ?? "select",
    };
    return json({ dataset: safeDataset, parsedOptions });
}

export async function action({ request, params }: ActionFunctionArgs) {
    const { session } = await authenticate.admin(request);
    const id = params.id;

    const dataset = await prisma.dataset.findUnique({
        where: { id, shop: session.shop },
    });

    if (!dataset) {
        return json({ error: "Not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const name = String(formData.get("name") || "").trim();
    const label = String(formData.get("label") || "").trim();
    const type = String(formData.get("type") || "select").trim();
    const rawOptions = String(formData.get("options") || "");

    if (!name) {
        return json({ error: "Dataset name is required" }, { status: 400 });
    }

    // Parse multiline string into distinct cleaned array items
    const newOptions = rawOptions
        .split(/\r?\n/)
        .map(opt => opt.trim())
        .filter(opt => opt.length > 0);

    // Eliminate exact duplicates
    const uniqueOptions = Array.from(new Set(newOptions));

    await prisma.dataset.update({
        where: { id },
        data: {
            name,
            label,
            type,
            optionsJson: JSON.stringify(uniqueOptions),
        } as any,
    });

    return json({ success: true });
}

export default function DatasetDetail() {
    const { dataset, parsedOptions } = useLoaderData<typeof loader>();
    const submit = useSubmit();
    const navigation = useNavigation();
    const navigate = useNavigate();

    const isSaving = navigation.state === "submitting" || navigation.state === "loading";

    const [name, setName] = useState(dataset.name);
    const [label, setLabel] = useState(dataset.label || "");
    const [type, setType] = useState(dataset.type || "select");

    // Convert parsed options array to multiline string for simple mass text-editing
    const [optionsStr, setOptionsStr] = useState(parsedOptions.join("\n"));
    const [importText, setImportText] = useState("");
    const [showImport, setShowImport] = useState(false);

    const handleMergeImport = () => {
        const imported = importText
            .split(/[\n,]+/)
            .map(v => v.trim())
            .filter(v => v.length > 0);
        const existing = optionsStr.split(/\r?\n/).map(v => v.trim()).filter(v => v);
        const merged = Array.from(new Set([...existing, ...imported]));
        setOptionsStr(merged.join("\n"));
        setImportText("");
        setShowImport(false);
    };

    const handleSave = useCallback(() => {
        const formData = new FormData();
        formData.append("name", name);
        formData.append("label", label);
        formData.append("type", type);
        formData.append("options", optionsStr);
        submit(formData, { method: "post" });
    }, [name, label, type, optionsStr, submit]);

    return (
        <Page
            backAction={{ content: "Datasets", url: "/app?tab=datasets" }}
            title={name || "Untitled Dataset"}
            compactTitle
            primaryAction={{
                content: "Save",
                onAction: handleSave,
                loading: isSaving,
            }}
        >
            <BlockStack gap="500">
                <Layout>
                    <Layout.Section>
                        <BlockStack gap="400">
                            <Card>
                                <BlockStack gap="400">
                                    <TextField
                                        label="Dataset Name (Internal)"
                                        value={name}
                                        onChange={setName}
                                        autoComplete="off"
                                        helpText="Identify this dataset in the rule builder (e.g., 'Nike Fall Colors')"
                                    />
                                    <TextField
                                        label="Public Display Name"
                                        value={label}
                                        onChange={setLabel}
                                        autoComplete="off"
                                        helpText="The label shown to customers on the storefront"
                                    />
                                    <Select
                                        label="Display Type"
                                        options={[
                                            { label: "Dropdown Select", value: "select" },
                                            { label: "Radio Buttons", value: "radio" },
                                            { label: "Checkboxes", value: "checkbox" }
                                        ]}
                                        value={type}
                                        onChange={setType}
                                        helpText="How these options should be presented to customers"
                                    />
                                </BlockStack>
                            </Card>

                            <Card>
                                <BlockStack gap="400">
                                    <InlineStack align="space-between" blockAlign="center">
                                        <Text as="h3" variant="headingMd">Options List</Text>
                                        <Text as="span" variant="bodySm" tone="subdued">
                                            {optionsStr.split(/\r?\n/).filter(opt => opt.trim().length > 0).length} valid options detected
                                        </Text>
                                    </InlineStack>

                                    <Banner tone="info">
                                        <Text as="p">
                                            Enter each option on a new line. You can safely paste large lists directly from Excel or Google Sheets.
                                            Empty lines and exact duplicates will be automatically ignored upon saving.
                                        </Text>
                                    </Banner>

                                    <TextField
                                        label="Options"
                                        labelHidden
                                        value={optionsStr}
                                        onChange={setOptionsStr}
                                        multiline={12}
                                        autoComplete="off"
                                        placeholder="Red&#10;Blue&#10;Green"
                                    />

                                    <InlineStack align="start">
                                        <Button
                                            variant="plain"
                                            onClick={() => setShowImport(v => !v)}
                                        >
                                            {showImport ? "▲ Hide import" : "▼ Paste / import values to merge"}
                                        </Button>
                                    </InlineStack>

                                    {showImport && (
                                        <BlockStack gap="200">
                                            <Banner tone="info">
                                                Paste comma-separated or line-separated values. Click <strong>Merge</strong> to add them to your existing options list without replacing anything.
                                            </Banner>
                                            <TextField
                                                label="Values to import"
                                                labelHidden
                                                value={importText}
                                                onChange={setImportText}
                                                multiline={6}
                                                autoComplete="off"
                                                placeholder="White, Black, Navy, Red&#10;or one per line"
                                            />
                                            <InlineStack gap="200">
                                                <Button variant="primary" onClick={handleMergeImport} disabled={!importText.trim()}>
                                                    Merge into options
                                                </Button>
                                                <Button variant="plain" onClick={() => { setImportText(""); setShowImport(false); }}>
                                                    Cancel
                                                </Button>
                                            </InlineStack>
                                        </BlockStack>
                                    )}
                                </BlockStack>
                            </Card>
                        </BlockStack>
                    </Layout.Section>
                </Layout>

                <PageActions
                    primaryAction={{
                        content: "Save Dataset",
                        onAction: handleSave,
                        loading: isSaving,
                    }}
                    secondaryActions={[
                        {
                            content: "Discard Unsaved Changes",
                            onAction: () => {
                                setName(dataset.name);
                                setLabel(dataset.label || "");
                                setType(dataset.type || "select");
                                setOptionsStr(parsedOptions.join("\n"));
                            },
                        },
                    ]}
                />
            </BlockStack>
        </Page>
    );
}
