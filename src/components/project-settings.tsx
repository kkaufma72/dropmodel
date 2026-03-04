"use client";

import { useState, useCallback, Fragment } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import {
  Sparkles,
  RefreshCw,
  Pencil,
  AlertTriangle,
  X,
  Settings2,
} from "lucide-react";
import { OnboardingQuestionnaire } from "@/components/onboarding-questionnaire";
import type { QuestionnaireAnswers } from "@/types/onboarding";

// ─── Types ──────────────────────────────────────────────

interface ModelConfig {
  temperature: number;
  systemPrompt: string;
  maxTokens: number;
  model: string;
}

interface Customization {
  chatbotColor: string;
  welcomeMessage: string;
  logo: string | null;
}

interface ProjectConfigData {
  useCase: string;
  useCaseCustom: string | null;
  companyName: string | null;
  industry: string | null;
  tone: string;
  failureBehavior: string;
  contactInfo: string | null;
  collectFields: string[];
  restrictions: string | null;
  customRules: string | null;
  language: string;
  responseLength: string;
  generatedPrompt: string | null;
  promptVersion: number;
}

interface ProjectSettingsProps {
  projectId: string;
  initialModelConfig: Record<string, unknown>;
  initialCustomization: Record<string, unknown>;
  initialConfig?: ProjectConfigData | null;
}

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful AI assistant. Answer questions based only on the provided context. If the answer is not in the context, say 'I don't have enough information to answer that.' Always be concise and helpful.";

const COLOR_SWATCHES = [
  { name: "Violet", value: "#7c3aed" },
  { name: "Blue", value: "#2563eb" },
  { name: "Emerald", value: "#059669" },
  { name: "Rose", value: "#e11d48" },
  { name: "Amber", value: "#d97706" },
  { name: "Cyan", value: "#0891b2" },
  { name: "Pink", value: "#db2777" },
  { name: "Slate", value: "#475569" },
];

// ─── Human-readable label maps ──────────────────────────

const USE_CASE_LABELS: Record<string, string> = {
  customer_support: "customer support",
  knowledge_base: "internal knowledge base",
  product_docs: "product documentation",
  sales: "sales & lead generation",
  other: "general purpose",
};

const TONE_LABELS: Record<string, string> = {
  professional: "professional",
  friendly: "friendly",
  casual: "casual",
};

const FAILURE_LABELS: Record<string, string> = {
  admit_unknown: "admits when it doesn't know",
  suggest_contact: "suggests contacting support",
  general_knowledge: "uses general knowledge",
  collect_info: "collects info for follow-up",
};

const COLLECT_LABELS: Record<string, string> = {
  name: "names",
  email: "emails",
  phone: "phone numbers",
  company: "company names",
};

// ─── Component ──────────────────────────────────────────

export function ProjectSettings({
  projectId,
  initialModelConfig,
  initialCustomization,
  initialConfig,
}: ProjectSettingsProps) {
  const modelCfg = initialModelConfig as unknown as Partial<ModelConfig>;
  const custom = initialCustomization as unknown as Partial<Customization>;

  const [temperature, setTemperature] = useState(modelCfg.temperature ?? 0.7);
  const [systemPrompt, setSystemPrompt] = useState(
    modelCfg.systemPrompt ?? DEFAULT_SYSTEM_PROMPT
  );
  const [maxTokens, setMaxTokens] = useState(modelCfg.maxTokens ?? 500);
  const [accentColor, setAccentColor] = useState(
    custom.chatbotColor ?? "#7c3aed"
  );
  const [welcomeMessage, setWelcomeMessage] = useState(
    custom.welcomeMessage ?? "Hi! Ask me anything about our docs."
  );
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  // AI Personality state
  const [projectConfig, setProjectConfig] = useState<ProjectConfigData | null>(
    initialConfig ?? null
  );
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showReconfigureModal, setShowReconfigureModal] = useState(false);

  // ── Build a summary sentence from config ──────────────
  function buildConfigSummary(cfg: ProjectConfigData): string {
    const parts: string[] = [];

    const toneLabel = TONE_LABELS[cfg.tone] || cfg.tone;
    const useCaseLabel = USE_CASE_LABELS[cfg.useCase] || cfg.useCase;
    const companyClause = cfg.companyName ? ` for ${cfg.companyName}` : "";

    parts.push(
      `Your bot is a ${toneLabel} ${useCaseLabel} assistant${companyClause}.`
    );

    const failureLabel = FAILURE_LABELS[cfg.failureBehavior];
    if (failureLabel) {
      parts.push(`It ${failureLabel}.`);
    }

    if (cfg.collectFields.length > 0) {
      const fieldLabels = cfg.collectFields
        .map((f) => COLLECT_LABELS[f] || f)
        .join(", ");
      parts.push(`It collects user ${fieldLabels}.`);
    }

    if (cfg.restrictions) {
      parts.push(`It avoids discussing: ${cfg.restrictions}.`);
    }

    return parts.join(" ");
  }

  // ── Build initial answers from config for modal ───────
  function configToAnswers(cfg: ProjectConfigData): QuestionnaireAnswers {
    return {
      useCase: cfg.useCase as QuestionnaireAnswers["useCase"],
      useCaseCustom: cfg.useCaseCustom ?? undefined,
      companyName: cfg.companyName ?? undefined,
      industry: cfg.industry ?? undefined,
      tone: cfg.tone as QuestionnaireAnswers["tone"],
      failureBehavior:
        cfg.failureBehavior as QuestionnaireAnswers["failureBehavior"],
      contactInfo: cfg.contactInfo ?? undefined,
      collectFields:
        cfg.collectFields as QuestionnaireAnswers["collectFields"],
      restrictions: cfg.restrictions ?? undefined,
      customRules: cfg.customRules ?? undefined,
      language: cfg.language,
      responseLength:
        cfg.responseLength as QuestionnaireAnswers["responseLength"],
    };
  }

  // ── Save handler ──────────────────────────────────────
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelConfig: {
            temperature,
            systemPrompt,
            maxTokens,
            model: modelCfg.model ?? "gpt-4o-mini",
          },
          customization: {
            chatbotColor: accentColor,
            welcomeMessage,
            logo: custom.logo ?? null,
          },
        }),
      });

      if (res.ok) {
        toast("Settings saved successfully.", "success");
      } else {
        toast("Failed to save settings.", "error");
      }
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setIsSaving(false);
    }
  }, [
    projectId,
    temperature,
    systemPrompt,
    maxTokens,
    accentColor,
    welcomeMessage,
    modelCfg.model,
    custom.logo,
    toast,
  ]);

  // ── Regenerate prompt handler ─────────────────────────
  const handleRegenerate = useCallback(async () => {
    if (!projectConfig) return;
    setIsRegenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: configToAnswers(projectConfig),
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setProjectConfig(updated);
        const newPrompt = updated.generatedPrompt || systemPrompt;
        setSystemPrompt(newPrompt);
        setIsEditingPrompt(false);
        toast("System prompt regenerated.", "success");
      } else {
        toast("Failed to regenerate prompt.", "error");
      }
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setIsRegenerating(false);
    }
  }, [projectId, projectConfig, systemPrompt, toast]);

  // ── Reconfigure handler ───────────────────────────────
  const handleReconfigure = useCallback(
    async (data: {
      answers: QuestionnaireAnswers;
      generatedPrompt: string;
      projectName: string;
    }) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/config`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: data.answers }),
        });

        if (res.ok) {
          const updated = await res.json();
          setProjectConfig(updated);
          const newPrompt = updated.generatedPrompt || data.generatedPrompt;
          setSystemPrompt(newPrompt);
          setIsEditingPrompt(false);
          setShowReconfigureModal(false);
          toast("AI personality updated.", "success");
        } else {
          toast("Failed to save configuration.", "error");
        }
      } catch {
        toast("Network error. Please try again.", "error");
      }
    },
    [projectId, toast]
  );

  return (
    <Fragment>
      <div className="relative mx-auto max-w-2xl space-y-8 overflow-y-auto p-4">
        {/* ── AI Personality ────────────────────────────────── */}
        {projectConfig && (
          <section>
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <h3 className="text-sm font-semibold text-gray-900">
                AI Personality
              </h3>
            </div>

            <div className="mt-3 rounded-lg border border-violet-100 bg-violet-50/50 p-4">
              <p className="text-sm leading-relaxed text-gray-700">
                {buildConfigSummary(projectConfig)}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setShowReconfigureModal(true)}
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  Reconfigure
                </Button>
              </div>
            </div>

            {/* System prompt display */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  System Prompt
                </label>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRegenerate}
                    disabled={isRegenerating}
                    className="flex items-center gap-1 text-xs font-medium text-violet-600 hover:text-violet-700 disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${isRegenerating ? "animate-spin" : ""}`}
                    />
                    {isRegenerating ? "Regenerating…" : "Regenerate prompt"}
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={() => setIsEditingPrompt(!isEditingPrompt)}
                    className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    <Pencil className="h-3 w-3" />
                    {isEditingPrompt ? "Lock" : "Edit manually"}
                  </button>
                </div>
              </div>

              <textarea
                rows={5}
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                readOnly={!isEditingPrompt}
                className={`mt-1.5 block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none ${
                  isEditingPrompt
                    ? "border-violet-300 bg-white text-gray-900 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                    : "border-gray-200 bg-gray-50 text-gray-600 cursor-default"
                }`}
              />

              {isEditingPrompt && (
                <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <p className="text-xs text-amber-700">
                    Manual edits will be overwritten if you reconfigure or
                    regenerate. Consider adding custom rules in the
                    questionnaire instead.
                  </p>
                </div>
              )}

              {projectConfig.promptVersion > 1 && (
                <p className="mt-1 text-xs text-gray-400">
                  Prompt version {projectConfig.promptVersion}
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── Model Configuration ────────────────────────────── */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900">
            Model Configuration
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Fine-tune how your AI responds to queries.
          </p>

          <div className="mt-4 space-y-5">
            {/* Temperature */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Temperature
                </label>
                <span className="text-sm tabular-nums text-gray-500">
                  {temperature.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="mt-1.5 w-full accent-violet-600"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>

            {/* System prompt — only show raw textarea when no config exists */}
            {!projectConfig && (
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  System Prompt
                </label>
                <textarea
                  rows={4}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder={DEFAULT_SYSTEM_PROMPT}
                  className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                />
              </div>
            )}

            {/* Max tokens */}
            <div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Max Response Length
                </label>
                <span className="text-sm tabular-nums text-gray-500">
                  {maxTokens} tokens
                </span>
              </div>
              <input
                type="range"
                min={100}
                max={2000}
                step={100}
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="mt-1.5 w-full accent-violet-600"
              />
              <div className="flex justify-between text-xs text-gray-400">
                <span>Short</span>
                <span>Long</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Chatbot Appearance ─────────────────────────────── */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900">
            Chatbot Appearance
          </h3>
          <p className="mt-0.5 text-xs text-gray-500">
            Customize how your chatbot looks when embedded.
          </p>

          <div className="mt-4 space-y-5">
            {/* Color swatches */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Accent Color
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.value}
                    onClick={() => setAccentColor(swatch.value)}
                    title={swatch.name}
                    className={`h-8 w-8 rounded-full transition-all ${
                      accentColor === swatch.value
                        ? "ring-2 ring-offset-2 ring-gray-900"
                        : "hover:scale-110"
                    }`}
                    style={{
                      backgroundColor: swatch.value,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Welcome message */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Welcome Message
              </label>
              <input
                type="text"
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="Hi! Ask me anything about our docs."
                className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
          </div>
        </section>

        {/* ── Save button ──────────────────────────────────── */}
        <div className="border-t border-gray-200 pt-4">
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* ── Reconfigure modal ──────────────────────────────── */}
      {showReconfigureModal && projectConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="relative mx-4 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <button
              onClick={() => setShowReconfigureModal(false)}
              className="absolute right-4 top-4 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Reconfigure AI Personality
            </h2>
            <OnboardingQuestionnaire
              onComplete={handleReconfigure}
              initialAnswers={configToAnswers(projectConfig)}
              initialProjectName={projectConfig.companyName ?? undefined}
            />
          </div>
        </div>
      )}
    </Fragment>
  );
}
