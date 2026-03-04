import type { Plan } from "@/generated/prisma/client";

export interface PlanConfig {
  name: string;
  queryLimit: number;
  projectLimit: number; // -1 = unlimited
  storageLimitBytes: number;
  features: string[];
  priceId?: string;
  price?: number; // monthly USD
}

export const PLANS: Record<Plan, PlanConfig> = {
  FREE: {
    name: "Free",
    queryLimit: 999_999, // effectively unlimited
    projectLimit: 100,
    storageLimitBytes: 10 * 1024 * 1024 * 1024, // 10GB
    features: [
      "100 projects",
      "Unlimited queries",
      "10GB storage",
    ],
  },
  PRO: {
    name: "Pro",
    queryLimit: 1_000,
    projectLimit: 10,
    storageLimitBytes: 100 * 1024 * 1024, // 100MB
    features: [
      "10 projects",
      "1K queries/day",
      "100MB storage",
      "Custom branding",
      "Remove watermark",
    ],
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    price: 29,
  },
  TEAM: {
    name: "Team",
    queryLimit: 10_000,
    projectLimit: -1, // unlimited
    storageLimitBytes: 1024 * 1024 * 1024, // 1GB
    features: [
      "Unlimited projects",
      "10K queries/day",
      "1GB storage",
      "API access",
      "Analytics",
      "Priority support",
    ],
    priceId: process.env.STRIPE_TEAM_PRICE_ID,
    price: 99,
  },
};

export function getPlanConfig(plan: Plan): PlanConfig {
  return PLANS[plan];
}

export function formatStorage(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${Math.round(bytes / (1024 * 1024))} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
