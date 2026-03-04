import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { QuestionnaireAnswers } from "@/types/onboarding";

interface SaveConfigBody {
  projectId: string;
  answers: QuestionnaireAnswers;
  generatedPrompt: string;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: SaveConfigBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId, answers, generatedPrompt } = body;

  if (!projectId || !answers || !generatedPrompt) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Verify ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    select: { id: true, modelConfig: true },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const currentModelConfig = (project.modelConfig as Record<string, unknown>) ?? {};

    await prisma.$transaction([
      // Create or update ProjectConfig
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
      // Update project's systemPrompt
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

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("[onboarding/config] POST error:", err);
    return NextResponse.json(
      { error: "Failed to save configuration" },
      { status: 500 }
    );
  }
}
