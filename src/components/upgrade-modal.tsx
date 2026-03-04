"use client";

import { useState, useCallback } from "react";
import { X, Check, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS, type PlanConfig } from "@/lib/plans";
import { useToast } from "@/components/toast";
import type { Plan } from "@/generated/prisma/client";

// ─── Types ──────────────────────────────────────────────

interface UpgradeModalProps {
  currentPlan: Plan;
  isOpen: boolean;
  onClose: () => void;
  limitMessage?: string;
}

const PLAN_ORDER: Plan[] = ["FREE", "PRO", "TEAM"];

// ─── Component ──────────────────────────────────────────

export function UpgradeModal({
  currentPlan,
  isOpen,
  onClose,
  limitMessage,
}: UpgradeModalProps) {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const { toast } = useToast();

  const handleUpgrade = useCallback(async (plan: Plan) => {
    const config = PLANS[plan];
    if (!config.priceId) return;

    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: config.priceId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Checkout failed" }));
        toast(err.error || "Failed to start checkout.", "error");
        return;
      }

      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setLoadingPlan(null);
    }
  }, [toast]);

  const handleManage = useCallback(async () => {
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      if (!res.ok) return;
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      // ignore
    }
  }, []);

  if (!isOpen) return null;

  const currentIndex = PLAN_ORDER.indexOf(currentPlan);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl rounded-2xl bg-white p-6 shadow-xl">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-md p-1 text-gray-400 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-violet-100">
            <Zap className="h-6 w-6 text-violet-600" />
          </div>
          <h2 className="mt-3 text-xl font-semibold text-gray-900">
            Upgrade your plan
          </h2>
          {limitMessage && (
            <p className="mt-1 text-sm text-gray-500">{limitMessage}</p>
          )}
        </div>

        {/* Plan cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {PLAN_ORDER.map((planKey) => {
            const config: PlanConfig = PLANS[planKey];
            const isCurrent = planKey === currentPlan;
            const planIndex = PLAN_ORDER.indexOf(planKey);
            const isUpgrade = planIndex > currentIndex;
            const isPopular = planKey === "PRO";

            return (
              <div
                key={planKey}
                className={`relative rounded-xl border-2 p-5 transition-colors ${
                  isPopular
                    ? "border-violet-600 bg-violet-50/30"
                    : isCurrent
                      ? "border-gray-300 bg-gray-50"
                      : "border-gray-200 hover:border-gray-300"
                }`}
              >
                {isPopular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-violet-600 px-3 py-0.5 text-xs font-medium text-white">
                    Popular
                  </span>
                )}

                <h3 className="text-lg font-semibold text-gray-900">
                  {config.name}
                </h3>

                <div className="mt-2">
                  {config.price ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-gray-900">
                        ${config.price}
                      </span>
                      <span className="text-sm text-gray-500">/month</span>
                    </div>
                  ) : (
                    <div className="text-3xl font-bold text-gray-900">Free</div>
                  )}
                </div>

                <ul className="mt-4 space-y-2">
                  {config.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2 text-sm text-gray-600"
                    >
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
                      {feature}
                    </li>
                  ))}
                </ul>

                <div className="mt-5">
                  {isCurrent ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      disabled
                    >
                      Current plan
                    </Button>
                  ) : isUpgrade ? (
                    <Button
                      variant={isPopular ? "primary" : "secondary"}
                      size="sm"
                      className="w-full"
                      onClick={() => handleUpgrade(planKey)}
                      disabled={loadingPlan !== null}
                    >
                      {loadingPlan === planKey
                        ? "Redirecting…"
                        : `Upgrade to ${config.name}`}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      onClick={handleManage}
                    >
                      Manage subscription
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Manage link for paid users */}
        {currentPlan !== "FREE" && (
          <div className="mt-4 text-center">
            <button
              onClick={handleManage}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Manage billing & invoices →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
