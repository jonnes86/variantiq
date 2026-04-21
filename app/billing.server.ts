// ============================================================
// billing.server.ts — Single source of truth for plan detection
// and limit definitions across all VariantIQ routes.
// ============================================================

export type PlanTier = "Developer" | "Pro" | "Free";

export type PlanInfo = {
  tier: PlanTier;
  tone: "success" | "info" | "attention" | undefined;
};

// ---- Plan Limits ----
export const PLAN_LIMITS: Record<
  PlanTier,
  {
    maxTemplates: number;
    maxFieldsPerTemplate: number;
    hasRules: boolean;
    hasDatasets: boolean;
    hasAnalytics: boolean;
    hasWebhooks: boolean;
  }
> = {
  Free: {
    maxTemplates: 1,
    maxFieldsPerTemplate: 3,
    hasRules: false,
    hasDatasets: false,
    hasAnalytics: false,
    hasWebhooks: false,
  },
  Pro: {
    maxTemplates: Infinity,
    maxFieldsPerTemplate: Infinity,
    hasRules: true,
    hasDatasets: true,
    hasAnalytics: true,
    hasWebhooks: true,
  },
  Developer: {
    maxTemplates: Infinity,
    maxFieldsPerTemplate: Infinity,
    hasRules: true,
    hasDatasets: true,
    hasAnalytics: true,
    hasWebhooks: true,
  },
};

// ---- Helpers ----
export function isPro(tier: PlanTier): boolean {
  return tier === "Pro" || tier === "Developer";
}

export function getLimits(tier: PlanTier) {
  return PLAN_LIMITS[tier];
}

// ---- Plan Detection ----
export async function detectPlan(shop: string, admin: any): Promise<PlanInfo> {
  // 1. Check FREE_STORES env var first — zero billing API calls needed.
  const freeStores = (process.env.FREE_STORES || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (freeStores.includes(shop.toLowerCase())) {
    return { tier: "Developer", tone: "info" };
  }

  // 2. Query Shopify billing API for an active subscription.
  try {
    const res = await admin.graphql(`#graphql
      query {
        appInstallation {
          activeSubscriptions {
            name
            status
          }
        }
      }
    `);
    const data = await res.json();
    const subs: Array<{ name: string; status: string }> =
      data?.data?.appInstallation?.activeSubscriptions ?? [];
    const active = subs.find((s) => s.status === "ACTIVE");
    if (active) {
      return { tier: "Pro", tone: "success" };
    }
  } catch (e) {
    console.error("[VariantIQ] Could not fetch billing status:", e);
  }

  // 3. No active subscription → Free tier.
  return { tier: "Free", tone: "attention" };
}
