import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  generateSystemPrompt,
  generateFallbackPrompt,
} from "@/lib/prompt-generator";
import type { QuestionnaireAnswers } from "@/types/onboarding";

// ─── GET: return the ProjectConfig for this project ─────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;

  // Verify ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    select: { id: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const config = await prisma.projectConfig.findUnique({
    where: { projectId },
  });

  if (!config) {
    return NextResponse.json(null);
  }

  return NextResponse.json(config);
}

// ─── PUT: update ProjectConfig + regenerate prompt ──────

interface UpdateBody {
  answers: QuestionnaireAnswers;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;

  // Verify ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    select: { id: true, modelConfig: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let body: UpdateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { answers } = body;
  if (!answers) {
    return NextResponse.json({ error: "Missing answers" }, { status: 400 });
  }

  // Generate a new system prompt from the answers
  let generatedPrompt: string;
  try {
    generatedPrompt = await generateSystemPrompt(answers);
  } catch (err) {
    console.error("[config] PUT: OpenAI failed, using fallback:", err);
    generatedPrompt = generateFallbackPrompt(answers);
  }

  const currentModelConfig =
    (project.modelConfig as Record<string, unknown>) ?? {};

  try {
    await prisma.$transaction([
      prisma.projectConfig.upsert({
        where: { projectId },
        create: {
          projectId,
          useCase: answers.useCase,
          useCaseCustom: answers.useCaseCustom ?? null,
          companyName: answers.companyName ?? null,
          industry: answers.industry ?? null,
          tone: answers.tone,
          failureBehavior: answers.failureBehavior,
          contactInfo: answers.contactInfo ?? null,
          collectFields: answers.collectFields,
          restrictions: answers.restrictions ?? null,
          customRules: answers.customRules ?? null,
          language: answers.language,
          responseLength: answers.responseLength,
          generatedPrompt,
        },
        update: {
          useCase: answers.useCase,
          useCaseCustom: answers.useCaseCustom ?? null,
          companyName: answers.companyName ?? null,
          industry: answers.industry ?? null,
          tone: answers.tone,
          failureBehavior: answers.failureBehavior,
          contactInfo: answers.contactInfo ?? null,
          collectFields: answers.collectFields,
          restrictions: answers.restrictions ?? null,
          customRules: answers.customRules ?? null,
          language: answers.language,
          responseLength: answers.responseLength,
          generatedPrompt,
          promptVersion: { increment: 1 },
        },
      }),
      prisma.project.update({
        where: { id: projectId },
        data: {
          modelConfig: {
            ...currentModelConfig,
            systemPrompt: generatedPrompt,
          },
        },
      }),
    ]);

    const updatedConfig = await prisma.projectConfig.findUnique({
      where: { projectId },
    });

    return NextResponse.json(updatedConfig);
  } catch (err) {
    console.error("[config] PUT error:", err);
    return NextResponse.json(
      { error: "Failed to update configuration" },
      { status: 500 }
    );
  }
}
