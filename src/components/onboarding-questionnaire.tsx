"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  Headphones,
  BookOpen,
  FileCode,
  TrendingUp,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Loader2,
  RefreshCw,
  Send,
  Pencil,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  UseCase,
  Tone,
  FailureBehavior,
  CollectField,
  ResponseLength,
  QuestionnaireAnswers,
} from "@/types/onboarding";

// ─── Constants ──────────────────────────────────────────

const TOTAL_STEPS = 6;

const USE_CASE_OPTIONS: {
  value: UseCase;
  label: string;
  description: string;
  icon: typeof Headphones;
}[] = [
  {
    value: "customer_support",
    label: "Customer Support",
    description: "Answer customer questions from your help docs, FAQs, and policies",
    icon: Headphones,
  },
  {
    value: "knowledge_base",
    label: "Knowledge Base",
    description: "Make internal docs searchable for your team",
    icon: BookOpen,
  },
  {
    value: "product_docs",
    label: "Product Docs",
    description: "Let users ask questions about your product",
    icon: FileCode,
  },
  {
    value: "sales",
    label: "Sales Assistant",
    description: "Qualify leads and answer pre-sales questions",
    icon: TrendingUp,
  },
  {
    value: "other",
    label: "Something Else",
    description: "Tell us what you're building",
    icon: Sparkles,
  },
];

const INDUSTRY_OPTIONS = [
  "Technology",
  "E-commerce",
  "Healthcare",
  "Finance",
  "Education",
  "SaaS",
  "Agency",
  "Consulting",
  "Non-profit",
  "Other",
];

const TONE_OPTIONS: {
  value: Tone;
  label: string;
  sample: string;
}[] = [
  {
    value: "professional",
    label: "Professional",
    sample:
      "Thank you for reaching out. I'd be happy to assist you with your inquiry regarding our return policy.",
  },
  {
    value: "friendly",
    label: "Friendly",
    sample:
      "Hey! Great question. Let me help you out with our return policy — it's pretty straightforward.",
  },
  {
    value: "casual",
    label: "Casual",
    sample: "No worries! Returns are super easy — here's the deal.",
  },
];

const FAILURE_OPTIONS: {
  value: FailureBehavior;
  label: string;
  description: string;
  preview?: string;
  hasInput?: boolean;
}[] = [
  {
    value: "admit_unknown",
    label: "Admit it",
    description: "Honestly say it doesn't have the information",
    preview: "I don't have information about that topic. Could you try rephrasing?",
  },
  {
    value: "suggest_contact",
    label: "Suggest contact",
    description: "Direct users to your support team",
    hasInput: true,
  },
  {
    value: "general_knowledge",
    label: "Use general knowledge",
    description: "Try to help using general knowledge (less accurate but fewer dead ends)",
  },
  {
    value: "collect_info",
    label: "Collect & follow up",
    description: "Capture their question and email for manual follow-up",
    preview:
      "I want to make sure you get the right answer. Can I get your email so our team can follow up?",
  },
];

const COLLECT_FIELD_OPTIONS: { value: CollectField; label: string; description: string }[] = [
  { value: "name", label: "Name", description: "Ask for user's name" },
  { value: "email", label: "Email", description: "Collect email address" },
  { value: "phone", label: "Phone", description: "Ask for phone number" },
  { value: "company", label: "Company", description: "Ask what company they're from" },
];

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "pt", label: "Portuguese" },
  { value: "ja", label: "Japanese" },
  { value: "zh", label: "Chinese" },
  { value: "ko", label: "Korean" },
  { value: "ar", label: "Arabic" },
  { value: "hi", label: "Hindi" },
  { value: "other", label: "Other" },
];

const TEST_QUESTIONS: Record<UseCase, string> = {
  customer_support: "How do I return an item?",
  knowledge_base: "Where can I find the company travel policy?",
  product_docs: "How do I install the software?",
  sales: "What pricing plans do you offer?",
  other: "Can you help me with something?",
};

// ─── Types ──────────────────────────────────────────────

interface OnboardingQuestionnaireProps {
  onComplete: (data: {
    answers: QuestionnaireAnswers;
    generatedPrompt: string;
    projectName: string;
  }) => void;
  initialAnswers?: QuestionnaireAnswers;
  initialProjectName?: string;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

// ─── Component ──────────────────────────────────────────

export function OnboardingQuestionnaire({ onComplete, initialAnswers, initialProjectName }: OnboardingQuestionnaireProps) {
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [isAnimating, setIsAnimating] = useState(false);

  // Step 1
  const [useCase, setUseCase] = useState<UseCase | null>(initialAnswers?.useCase ?? null);
  const [useCaseCustom, setUseCaseCustom] = useState(initialAnswers?.useCaseCustom ?? "");

  // Step 2
  const [companyName, setCompanyName] = useState(initialAnswers?.companyName ?? initialProjectName ?? "");
  const [industry, setIndustry] = useState(initialAnswers?.industry ?? "");
  const [tone, setTone] = useState<Tone | null>(initialAnswers?.tone ?? null);

  // Step 3
  const [failureBehavior, setFailureBehavior] = useState<FailureBehavior | null>(initialAnswers?.failureBehavior ?? null);
  const [contactInfo, setContactInfo] = useState(initialAnswers?.contactInfo ?? "");

  // Step 4
  const [collectFields, setCollectFields] = useState<CollectField[]>(initialAnswers?.collectFields ?? []);

  // Step 5
  const [restrictions, setRestrictions] = useState(initialAnswers?.restrictions ?? "");
  const [customRules, setCustomRules] = useState(initialAnswers?.customRules ?? "");
  const [language, setLanguage] = useState(initialAnswers?.language ?? "en");
  const [languageCustom, setLanguageCustom] = useState("");
  const [responseLength, setResponseLength] = useState<ResponseLength>(initialAnswers?.responseLength ?? "balanced");

  // Step 6 — Preview
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editablePrompt, setEditablePrompt] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Pre-enable fields for sales use case
  useEffect(() => {
    if (useCase === "sales" && collectFields.length === 0) {
      setCollectFields(["name", "email"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCase]);

  // ── Navigation ────────────────────────────────────────

  const animateTo = useCallback((targetStep: number) => {
    setDirection(targetStep > step ? "forward" : "back");
    setIsAnimating(true);
    setTimeout(() => {
      setStep(targetStep);
      setIsAnimating(false);
    }, 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS) animateTo(step + 1);
  }, [step, animateTo]);

  const goBack = useCallback(() => {
    if (step > 1) animateTo(step - 1);
  }, [step, animateTo]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && step > 1) {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [step, goBack]);

  // ── Build answers object ──────────────────────────────

  const buildAnswers = useCallback((): QuestionnaireAnswers => ({
    useCase: useCase || "other",
    useCaseCustom: useCaseCustom || undefined,
    companyName: companyName || undefined,
    industry: industry || undefined,
    tone: tone || "friendly",
    failureBehavior: failureBehavior || "admit_unknown",
    contactInfo: contactInfo || undefined,
    collectFields,
    restrictions: restrictions || undefined,
    customRules: customRules || undefined,
    language: language === "other" ? languageCustom || "en" : language,
    responseLength,
  }), [
    useCase, useCaseCustom, companyName, industry, tone,
    failureBehavior, contactInfo, collectFields, restrictions,
    customRules, language, languageCustom, responseLength,
  ]);

  // ── Step 6: Generate preview ──────────────────────────

  const generatePreview = useCallback(async () => {
    setPreviewLoading(true);
    setChatMessages([]);
    setIsEditingPrompt(false);

    try {
      const answers = buildAnswers();
      const res = await fetch("/api/onboarding/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      });

      if (!res.ok) throw new Error("Preview generation failed");

      const data = await res.json();
      setGeneratedPrompt(data.prompt);
      setEditablePrompt(data.prompt);

      const testQ = TEST_QUESTIONS[answers.useCase];
      setChatMessages([
        { role: "user", content: testQ },
        { role: "assistant", content: data.sampleResponse },
      ]);
    } catch (err) {
      console.error("Preview error:", err);
      setGeneratedPrompt("Failed to generate prompt. Click Regenerate to try again.");
      setEditablePrompt("");
    } finally {
      setPreviewLoading(false);
    }
  }, [buildAnswers]);

  // Trigger preview generation when we arrive at step 6
  useEffect(() => {
    if (step === 6 && !generatedPrompt && !previewLoading) {
      generatePreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Step 6: Test chat ─────────────────────────────────

  const handleTestChat = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg || chatLoading) return;

    setChatMessages((prev) => [...prev, { role: "user", content: msg }]);
    setChatInput("");
    setChatLoading(true);

    try {
      const res = await fetch("/api/onboarding/test-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          systemPrompt: isEditingPrompt ? editablePrompt : generatedPrompt,
        }),
      });

      if (!res.ok) throw new Error("Chat failed");

      const data = await res.json();
      setChatMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Failed to get response. Try again." },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, generatedPrompt, editablePrompt, isEditingPrompt]);

  // ── Final submit ──────────────────────────────────────

  const handleFinish = useCallback(() => {
    const finalPrompt = isEditingPrompt ? editablePrompt : generatedPrompt;
    onComplete({
      answers: buildAnswers(),
      generatedPrompt: finalPrompt,
      projectName: companyName || "Untitled Project",
    });
  }, [isEditingPrompt, editablePrompt, generatedPrompt, buildAnswers, companyName, onComplete]);

  // ── Collect field toggle ──────────────────────────────

  const toggleCollectField = useCallback((field: CollectField) => {
    setCollectFields((prev) =>
      prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field]
    );
  }, []);

  // ── Render ────────────────────────────────────────────

  const progressPercent = (step / TOTAL_STEPS) * 100;

  const slideClass = isAnimating
    ? direction === "forward"
      ? "translate-x-8 opacity-0"
      : "-translate-x-8 opacity-0"
    : "translate-x-0 opacity-100";

  return (
    <div className="mx-auto max-w-[800px]">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-500">
            Step {step} of {TOTAL_STEPS}
          </span>
          {step > 1 && (
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Back
            </button>
          )}
        </div>
        <div className="h-1 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-violet-500 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Step content with slide animation */}
      <div className={`transition-all duration-200 ease-out ${slideClass}`}>
        {step === 1 && (
          <Step1UseCase
            value={useCase}
            customValue={useCaseCustom}
            onSelect={(val) => {
              setUseCase(val);
              if (val !== "other") {
                setUseCaseCustom("");
                goNext();
              }
            }}
            onCustomChange={setUseCaseCustom}
            onNext={goNext}
          />
        )}

        {step === 2 && (
          <Step2Brand
            companyName={companyName}
            industry={industry}
            tone={tone}
            onCompanyNameChange={setCompanyName}
            onIndustryChange={setIndustry}
            onToneChange={setTone}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {step === 3 && (
          <Step3Failure
            value={failureBehavior}
            contactInfo={contactInfo}
            onSelect={(val) => {
              setFailureBehavior(val);
              if (val !== "suggest_contact") goNext();
            }}
            onContactInfoChange={setContactInfo}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {step === 4 && (
          <Step4Collect
            collectFields={collectFields}
            onToggle={toggleCollectField}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {step === 5 && (
          <Step5Rules
            restrictions={restrictions}
            customRules={customRules}
            language={language}
            languageCustom={languageCustom}
            responseLength={responseLength}
            onRestrictionsChange={setRestrictions}
            onCustomRulesChange={setCustomRules}
            onLanguageChange={setLanguage}
            onLanguageCustomChange={setLanguageCustom}
            onResponseLengthChange={setResponseLength}
            onNext={goNext}
            onBack={goBack}
          />
        )}

        {step === 6 && (
          <Step6Preview
            loading={previewLoading}
            prompt={generatedPrompt}
            isEditing={isEditingPrompt}
            editablePrompt={editablePrompt}
            chatMessages={chatMessages}
            chatInput={chatInput}
            chatLoading={chatLoading}
            chatEndRef={chatEndRef}
            onToggleEdit={() => {
              if (isEditingPrompt) {
                setGeneratedPrompt(editablePrompt);
              }
              setIsEditingPrompt(!isEditingPrompt);
            }}
            onEditablePromptChange={setEditablePrompt}
            onChatInputChange={setChatInput}
            onChatSubmit={handleTestChat}
            onRegenerate={generatePreview}
            onFinish={handleFinish}
            onBack={goBack}
          />
        )}
      </div>
    </div>
  );
}

// ─── Step 1: Use Case ───────────────────────────────────

function Step1UseCase({
  value,
  customValue,
  onSelect,
  onCustomChange,
  onNext,
}: {
  value: UseCase | null;
  customValue: string;
  onSelect: (v: UseCase) => void;
  onCustomChange: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900">What are you building?</h2>
      <p className="mt-1 text-sm text-gray-500">
        This helps us tailor your AI&apos;s personality and behavior.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {USE_CASE_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onSelect(opt.value)}
              className={`group flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                selected
                  ? "border-violet-500 bg-violet-50 ring-2 ring-violet-500/20"
                  : "border-gray-200 bg-white hover:border-violet-300 hover:bg-violet-50/50"
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  selected
                    ? "bg-violet-100 text-violet-600"
                    : "bg-gray-100 text-gray-500 group-hover:bg-violet-100 group-hover:text-violet-600"
                }`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className={`text-sm font-medium ${selected ? "text-violet-900" : "text-gray-900"}`}>
                  {opt.label}
                </p>
                <p className={`mt-0.5 text-xs ${selected ? "text-violet-600" : "text-gray-500"}`}>
                  {opt.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Custom use case input */}
      {value === "other" && (
        <div className="mt-4 animate-in fade-in slide-in-from-top-2 duration-200">
          <input
            type="text"
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customValue.trim()) onNext();
            }}
            placeholder="Describe your use case in a sentence…"
            autoFocus
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
          <div className="mt-3 flex justify-end">
            <Button onClick={onNext} disabled={!customValue.trim()}>
              Next
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Brand & Tone ───────────────────────────────

function Step2Brand({
  companyName,
  industry,
  tone,
  onCompanyNameChange,
  onIndustryChange,
  onToneChange,
  onNext,
  onBack,
}: {
  companyName: string;
  industry: string;
  tone: Tone | null;
  onCompanyNameChange: (v: string) => void;
  onIndustryChange: (v: string) => void;
  onToneChange: (v: Tone) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900">Tell us about your brand</h2>
      <p className="mt-1 text-sm text-gray-500">
        These details help personalize your AI assistant.
      </p>

      <div className="mt-6 space-y-5">
        {/* Company name */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Company or project name <span className="text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => onCompanyNameChange(e.target.value)}
            placeholder="Acme Inc."
            className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          />
        </div>

        {/* Industry */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Industry <span className="text-gray-400">(optional)</span>
          </label>
          <select
            value={industry}
            onChange={(e) => onIndustryChange(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="">Select an industry…</option>
            {INDUSTRY_OPTIONS.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        {/* Tone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            How should your AI sound?
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {TONE_OPTIONS.map((opt) => {
              const selected = tone === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onToneChange(opt.value)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    selected
                      ? "border-violet-500 bg-violet-50 ring-2 ring-violet-500/20"
                      : "border-gray-200 bg-white hover:border-violet-300"
                  }`}
                >
                  <p className={`text-sm font-medium ${selected ? "text-violet-900" : "text-gray-900"}`}>
                    {opt.label}
                  </p>
                  <p className={`mt-1.5 text-xs leading-relaxed italic ${selected ? "text-violet-600" : "text-gray-500"}`}>
                    &ldquo;{opt.sample}&rdquo;
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button onClick={onNext} disabled={!tone}>
          Next
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Failure Behavior ───────────────────────────

function Step3Failure({
  value,
  contactInfo,
  onSelect,
  onContactInfoChange,
  onNext,
  onBack,
}: {
  value: FailureBehavior | null;
  contactInfo: string;
  onSelect: (v: FailureBehavior) => void;
  onContactInfoChange: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900">
        When your bot doesn&apos;t know the answer…
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        Choose how your AI should handle questions outside its knowledge.
      </p>

      <div className="mt-6 space-y-3">
        {FAILURE_OPTIONS.map((opt) => {
          const selected = value === opt.value;
          return (
            <div key={opt.value}>
              <button
                onClick={() => onSelect(opt.value)}
                className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
                  selected
                    ? "border-violet-500 bg-violet-50 ring-2 ring-violet-500/20"
                    : "border-gray-200 bg-white hover:border-violet-300 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className={`text-sm font-medium ${selected ? "text-violet-900" : "text-gray-900"}`}>
                      {opt.label}
                    </p>
                    <p className={`mt-0.5 text-xs ${selected ? "text-violet-600" : "text-gray-500"}`}>
                      {opt.description}
                    </p>
                  </div>
                  <ChevronRight
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      selected ? "text-violet-400" : "text-gray-300"
                    }`}
                  />
                </div>
                {opt.preview && selected && (
                  <div className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-xs italic text-gray-500 border border-gray-100">
                    &ldquo;{opt.preview}&rdquo;
                  </div>
                )}
              </button>

              {/* Contact info input for "suggest_contact" */}
              {opt.hasInput && selected && (
                <div className="mt-2 ml-4 animate-in fade-in slide-in-from-top-2 duration-200">
                  <input
                    type="text"
                    value={contactInfo}
                    onChange={(e) => onContactInfoChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && contactInfo.trim()) onNext();
                    }}
                    placeholder="Support email or URL (e.g., support@company.com)"
                    autoFocus
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  />
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" onClick={onNext} disabled={!contactInfo.trim()}>
                      Next
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Back button */}
      <div className="mt-8 flex items-center justify-start">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4: Collect Fields ─────────────────────────────

function Step4Collect({
  collectFields,
  onToggle,
  onNext,
  onBack,
}: {
  collectFields: CollectField[];
  onToggle: (field: CollectField) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900">
        Should your bot collect information?
      </h2>
      <p className="mt-1 text-sm text-gray-500">
        When relevant, your bot can naturally ask users for contact info.
      </p>

      <div className="mt-6 space-y-1">
        {COLLECT_FIELD_OPTIONS.map((opt) => {
          const enabled = collectFields.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => onToggle(opt.value)}
              className="flex w-full items-center justify-between rounded-lg px-4 py-3 transition-colors hover:bg-gray-50"
            >
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                <p className="text-xs text-gray-500">{opt.description}</p>
              </div>
              {/* Toggle switch */}
              <div
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  enabled ? "bg-violet-600" : "bg-gray-200"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform shadow-sm ${
                    enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* Live preview */}
      <div className="mt-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
        <p className="text-xs text-gray-500">
          {collectFields.length > 0
            ? `Your bot will ask for: ${collectFields
                .map((f) => f.charAt(0).toUpperCase() + f.slice(1))
                .join(", ")}`
            : "Your bot won't collect any information"}
        </p>
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button onClick={onNext}>
          Next
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 5: Rules & Language ───────────────────────────

function Step5Rules({
  restrictions,
  customRules,
  language,
  languageCustom,
  responseLength,
  onRestrictionsChange,
  onCustomRulesChange,
  onLanguageChange,
  onLanguageCustomChange,
  onResponseLengthChange,
  onNext,
  onBack,
}: {
  restrictions: string;
  customRules: string;
  language: string;
  languageCustom: string;
  responseLength: ResponseLength;
  onRestrictionsChange: (v: string) => void;
  onCustomRulesChange: (v: string) => void;
  onLanguageChange: (v: string) => void;
  onLanguageCustomChange: (v: string) => void;
  onResponseLengthChange: (v: ResponseLength) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const lengthOptions: { value: ResponseLength; label: string; description: string }[] = [
    { value: "concise", label: "Concise", description: "Short and direct" },
    { value: "balanced", label: "Balanced", description: "Clear and helpful" },
    { value: "detailed", label: "Detailed", description: "Thorough and comprehensive" },
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900">Any ground rules?</h2>
      <p className="mt-1 text-sm text-gray-500">
        Fine-tune your AI&apos;s behavior with optional guidelines.
      </p>

      <div className="mt-6 space-y-5">
        {/* Restrictions */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Topics to avoid <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            value={restrictions}
            onChange={(e) => onRestrictionsChange(e.target.value)}
            rows={2}
            placeholder="e.g., competitor pricing, internal roadmap, legal advice"
            className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none"
          />
        </div>

        {/* Custom rules */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Additional instructions <span className="text-gray-400">(optional)</span>
          </label>
          <textarea
            value={customRules}
            onChange={(e) => onCustomRulesChange(e.target.value)}
            rows={3}
            placeholder="e.g., Always recommend our Pro plan, include links to docs.example.com, respond in bullet points"
            className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-none"
          />
        </div>

        {/* Language */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Primary language</label>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
          >
            {LANGUAGE_OPTIONS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
          {language === "other" && (
            <input
              type="text"
              value={languageCustom}
              onChange={(e) => onLanguageCustomChange(e.target.value)}
              placeholder="Enter language…"
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
          )}
        </div>

        {/* Response length */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Response length
          </label>
          <div className="flex gap-2">
            {lengthOptions.map((opt) => {
              const selected = responseLength === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onResponseLengthChange(opt.value)}
                  className={`flex-1 rounded-lg border-2 px-3 py-2.5 text-center transition-all ${
                    selected
                      ? "border-violet-500 bg-violet-50 ring-2 ring-violet-500/20"
                      : "border-gray-200 bg-white hover:border-violet-300"
                  }`}
                >
                  <p className={`text-sm font-medium ${selected ? "text-violet-900" : "text-gray-900"}`}>
                    {opt.label}
                  </p>
                  <p className={`mt-0.5 text-xs ${selected ? "text-violet-600" : "text-gray-500"}`}>
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button onClick={onNext}>
          Next
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 6: Preview ────────────────────────────────────

function Step6Preview({
  loading,
  prompt,
  isEditing,
  editablePrompt,
  chatMessages,
  chatInput,
  chatLoading,
  chatEndRef,
  onToggleEdit,
  onEditablePromptChange,
  onChatInputChange,
  onChatSubmit,
  onRegenerate,
  onFinish,
  onBack,
}: {
  loading: boolean;
  prompt: string;
  isEditing: boolean;
  editablePrompt: string;
  chatMessages: ChatMsg[];
  chatInput: string;
  chatLoading: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  onToggleEdit: () => void;
  onEditablePromptChange: (v: string) => void;
  onChatInputChange: (v: string) => void;
  onChatSubmit: (e: FormEvent) => void;
  onRegenerate: () => void;
  onFinish: () => void;
  onBack: () => void;
}) {
  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
        <div className="relative">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-100 to-violet-200 animate-pulse" />
          <Sparkles className="absolute -right-1 -top-1 h-5 w-5 text-amber-500 animate-bounce" />
        </div>
        <h3 className="mt-6 text-lg font-semibold text-gray-900">
          Generating your custom AI personality…
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          This takes a few seconds
        </p>
        {/* Shimmer bar */}
        <div className="mt-6 h-2 w-48 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-violet-400 to-violet-600 animate-shimmer" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900">Preview your AI</h2>
      <p className="mt-1 text-sm text-gray-500">
        See how your chatbot will respond. You can edit the prompt or regenerate it.
      </p>

      {/* Split view */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* LEFT: Prompt */}
        <div className="lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Your AI&apos;s personality</h3>
            <button
              onClick={onToggleEdit}
              className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 transition-colors"
            >
              {isEditing ? (
                <>
                  <Check className="h-3 w-3" />
                  Save
                </>
              ) : (
                <>
                  <Pencil className="h-3 w-3" />
                  Edit prompt
                </>
              )}
            </button>
          </div>
          <div className="flex-1 rounded-xl border border-gray-200 bg-gray-50 p-4 overflow-auto max-h-[400px]">
            {isEditing ? (
              <textarea
                value={editablePrompt}
                onChange={(e) => onEditablePromptChange(e.target.value)}
                className="h-full min-h-[300px] w-full rounded-lg border border-gray-300 bg-white p-3 font-mono text-xs text-gray-800 leading-relaxed focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-y"
              />
            ) : (
              <p className="font-mono text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">
                {prompt}
              </p>
            )}
          </div>
        </div>

        {/* RIGHT: Chat Preview */}
        <div className="lg:col-span-3 flex flex-col">
          <h3 className="text-sm font-medium text-gray-700 mb-2">See it in action</h3>
          <div className="flex flex-1 flex-col rounded-xl border border-gray-200 bg-white overflow-hidden max-h-[400px]">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-violet-600 text-white"
                        : "bg-gray-100 text-gray-900"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {chatLoading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl bg-gray-100 px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Chat input */}
            <div className="border-t border-gray-200 px-3 py-2">
              <form onSubmit={onChatSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => onChatInputChange(e.target.value)}
                  placeholder="Test your bot's personality…"
                  disabled={chatLoading}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:bg-gray-50"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || chatLoading}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white transition-colors hover:bg-violet-700 disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom actions */}
      <div className="mt-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <Button variant="ghost" onClick={onRegenerate}>
            <RefreshCw className="h-4 w-4" />
            Regenerate
          </Button>
        </div>
        <Button size="lg" onClick={onFinish}>
          Looks good — let&apos;s add your data
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
