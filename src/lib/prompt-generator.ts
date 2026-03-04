import { openai } from "@/lib/openai";
import { prisma } from "@/lib/db";
import type {
  QuestionnaireAnswers,
  UseCase,
  Tone,
  FailureBehavior,
  ResponseLength,
} from "@/types/onboarding";

// ─── Mappings ───────────────────────────────────────────

const USE_CASE_LABELS: Record<UseCase, string> = {
  customer_support: "Customer Support",
  knowledge_base: "Internal Knowledge Base",
  product_docs: "Product Documentation",
  sales: "Sales & Lead Generation",
  other: "General Purpose",
};

const TONE_DESCRIPTIONS: Record<Tone, string> = {
  professional:
    "Professional and formal. Use complete sentences, proper grammar, and business-appropriate language.",
  friendly:
    "Warm and conversational. Use natural language, contractions, and a helpful demeanor.",
  casual:
    "Relaxed and approachable. Use casual language, emoji where appropriate, and a lighthearted style.",
};

const FAILURE_DESCRIPTIONS: Record<FailureBehavior, string> = {
  admit_unknown:
    "Clearly state that you don't have enough information to answer and suggest the user rephrase their question.",
  suggest_contact:
    "Acknowledge the limitation and direct the user to the provided contact for further assistance.",
  general_knowledge:
    "Attempt a helpful answer using general knowledge, but clearly note when the answer isn't from the knowledge base.",
  collect_info:
    "Let the user know you can't answer yet, and offer to collect their details so a human can follow up.",
};

const TONE_RULES: Record<Tone, string> = {
  professional:
    "Maintain a polished, business-appropriate tone at all times. Use complete sentences and proper grammar.",
  friendly:
    "Be warm and approachable. Use contractions naturally and convey genuine helpfulness.",
  casual:
    "Keep things light and easy-going. Emoji are welcome and a conversational style is preferred.",
};

const RESPONSE_LENGTH_DESCRIPTIONS: Record<ResponseLength, string> = {
  concise: "short and to-the-point (1-2 sentences when possible)",
  balanced: "moderately detailed (a short paragraph)",
  detailed: "thorough and comprehensive (multiple paragraphs when appropriate)",
};

const TEST_QUESTIONS: Record<UseCase, string> = {
  customer_support: "How do I return an item?",
  knowledge_base: "Where can I find the company travel policy?",
  product_docs: "How do I install the software?",
  sales: "What pricing plans do you offer?",
  other: "Can you help me with something?",
};

// ─── Meta-Prompt Builder ────────────────────────────────

function buildMetaPrompt(answers: QuestionnaireAnswers): string {
  const useCaseLabel = USE_CASE_LABELS[answers.useCase];
  const useCaseExtra = answers.useCaseCustom
    ? ` (${answers.useCaseCustom})`
    : "";
  const collectFieldsStr =
    answers.collectFields.length > 0
      ? answers.collectFields.join(", ")
      : "None";

  return `You are an expert prompt engineer. Given the following configuration for an AI chatbot, generate a complete system prompt that will make the chatbot behave exactly as specified.

The system prompt you generate should:
- Be written in second person ("You are...")
- Be specific and actionable, not vague
- Include concrete behavioral rules, not just suggestions
- Feel natural, not robotic or overly templated
- Be 150-300 words (concise but comprehensive)

Configuration:
- Purpose: ${useCaseLabel}${useCaseExtra}
- Company/Brand: ${answers.companyName || "Not specified"}
- Industry: ${answers.industry || "Not specified"}
- Tone: ${TONE_DESCRIPTIONS[answers.tone]}
- When the answer is unknown: ${FAILURE_DESCRIPTIONS[answers.failureBehavior]}
- Contact for escalation: ${answers.contactInfo || "None provided"}
- Information to collect from users: ${collectFieldsStr}
- Topics to avoid: ${answers.restrictions || "None specified"}
- Additional rules: ${answers.customRules || "None"}
- Primary language: ${answers.language}
- Response length preference: ${answers.responseLength}

Generate ONLY the system prompt text. No explanations, no markdown formatting, no quotes around it.`;
}

// ─── 1. Main Generation Function ────────────────────────

export async function generateSystemPrompt(
  answers: QuestionnaireAnswers
): Promise<string> {
  const metaPrompt = buildMetaPrompt(answers);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    max_tokens: 600,
    messages: [{ role: "user", content: metaPrompt }],
  });

  const prompt = completion.choices[0]?.message?.content?.trim();

  if (!prompt) {
    // Fall back to deterministic generation if OpenAI returns nothing
    return generateFallbackPrompt(answers);
  }

  return prompt;
}

// ─── 2. Deterministic Fallback ──────────────────────────

export function generateFallbackPrompt(
  answers: QuestionnaireAnswers
): string {
  const useCaseLabel = USE_CASE_LABELS[answers.useCase].toLowerCase();
  const useCaseExtra = answers.useCaseCustom
    ? `, specifically ${answers.useCaseCustom}`
    : "";

  const companyClause = answers.companyName
    ? ` for ${answers.companyName}`
    : "";

  const toneAdj =
    answers.tone === "professional"
      ? "professional"
      : answers.tone === "friendly"
        ? "friendly and helpful"
        : "casual and approachable";

  // Failure behavior
  let failureRule: string;
  switch (answers.failureBehavior) {
    case "admit_unknown":
      failureRule =
        "If you don't know the answer, clearly say so and suggest the user rephrase their question.";
      break;
    case "suggest_contact":
      failureRule = answers.contactInfo
        ? `If you don't know the answer, direct the user to ${answers.contactInfo} for further help.`
        : "If you don't know the answer, suggest the user contact support for further help.";
      break;
    case "general_knowledge":
      failureRule =
        "If the answer isn't in your knowledge base, you may use general knowledge but clearly indicate the information is not from official sources.";
      break;
    case "collect_info":
      failureRule =
        "If you can't answer a question, offer to collect the user's contact details so a human can follow up.";
      break;
  }

  // Collection rules
  let collectionRule = "";
  if (answers.collectFields.length > 0) {
    collectionRule = ` When appropriate, collect the following from users: ${answers.collectFields.join(", ")}.`;
  }

  // Restriction rules
  let restrictionRule = "";
  if (answers.restrictions) {
    restrictionRule = ` Never discuss or provide information about: ${answers.restrictions}.`;
  }

  // Custom rules
  let customRule = "";
  if (answers.customRules) {
    customRule = ` ${answers.customRules}`;
  }

  const lengthDesc = RESPONSE_LENGTH_DESCRIPTIONS[answers.responseLength];

  const parts = [
    `You are a ${toneAdj} AI assistant${companyClause} that helps users with ${useCaseLabel}${useCaseExtra}.`,
    TONE_RULES[answers.tone] + ".",
    failureRule,
    collectionRule,
    restrictionRule,
    customRule,
    `Always respond in ${answers.language === "en" ? "English" : answers.language}.`,
    `Keep responses ${lengthDesc}.`,
  ];

  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" ");
}

// ─── 3. Regeneration (fetches config, saves back) ───────

interface ModelConfig {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export async function regenerateSystemPrompt(
  projectId: string
): Promise<string> {
  const config = await prisma.projectConfig.findUnique({
    where: { projectId },
  });

  if (!config) {
    throw new Error("ProjectConfig not found for this project");
  }

  const answers: QuestionnaireAnswers = {
    useCase: config.useCase as QuestionnaireAnswers["useCase"],
    useCaseCustom: config.useCaseCustom ?? undefined,
    companyName: config.companyName ?? undefined,
    industry: config.industry ?? undefined,
    tone: config.tone as QuestionnaireAnswers["tone"],
    failureBehavior:
      config.failureBehavior as QuestionnaireAnswers["failureBehavior"],
    contactInfo: config.contactInfo ?? undefined,
    collectFields:
      config.collectFields as QuestionnaireAnswers["collectFields"],
    restrictions: config.restrictions ?? undefined,
    customRules: config.customRules ?? undefined,
    language: config.language,
    responseLength:
      config.responseLength as QuestionnaireAnswers["responseLength"],
  };

  let prompt: string;
  try {
    prompt = await generateSystemPrompt(answers);
  } catch (err) {
    console.error("[prompt-generator] OpenAI failed, using fallback:", err);
    prompt = generateFallbackPrompt(answers);
  }

  // Fetch current modelConfig so we preserve other fields
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { modelConfig: true },
  });

  const currentModelConfig = (project?.modelConfig as ModelConfig) ?? {};

  // Update ProjectConfig and Project.modelConfig in a transaction
  await prisma.$transaction([
    prisma.projectConfig.update({
      where: { projectId },
      data: {
        generatedPrompt: prompt,
        promptVersion: { increment: 1 },
      },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: {
        modelConfig: {
          ...currentModelConfig,
          systemPrompt: prompt,
        },
      },
    }),
  ]);

  return prompt;
}

// ─── 4. Preview (generates prompt + sample response) ────

export async function previewPromptWithAnswers(
  answers: QuestionnaireAnswers
): Promise<{ prompt: string; sampleResponse: string }> {
  let prompt: string;
  try {
    prompt = await generateSystemPrompt(answers);
  } catch (err) {
    console.error("[prompt-generator] Preview: OpenAI failed, using fallback:", err);
    prompt = generateFallbackPrompt(answers);
  }

  const testQuestion = TEST_QUESTIONS[answers.useCase];

  // Run a sample query through the generated prompt
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    max_tokens: 300,
    messages: [
      { role: "system", content: prompt },
      {
        role: "user",
        content: `${testQuestion}\n\n(Note: You don't have any knowledge base context yet, so respond as you naturally would given your system instructions.)`,
      },
    ],
  });

  const sampleResponse =
    completion.choices[0]?.message?.content?.trim() ??
    "Unable to generate sample response.";

  return { prompt, sampleResponse };
}
