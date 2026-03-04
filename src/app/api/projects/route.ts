import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPlanConfig } from "@/lib/plans";
import {
  generateSystemPrompt,
  generateFallbackPrompt,
} from "@/lib/prompt-generator";
import type { Plan } from "@/generated/prisma/client";
import type { QuestionnaireAnswers } from "@/types/onboarding";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // ── Plan limit: project count ───────────────────────────
    const plan = getPlanConfig(session.user.plan as Plan);
    if (plan.projectLimit !== -1) {
      const projectCount = await prisma.project.count({
        where: { userId: session.user.id },
      });
      if (projectCount >= plan.projectLimit) {
        return NextResponse.json(
          {
            error: `Project limit reached (${plan.projectLimit} on ${plan.name} plan). Please upgrade.`,
            code: "PROJECT_LIMIT",
          },
          { status: 403 }
        );
      }
    }

    const body = await req.json().catch(() => ({}));
    const { name, config } = body as {
      name?: string;
      config?: QuestionnaireAnswers;
    };

    const projectName = name?.trim() || "Untitled Project";

    // If config is provided, generate system prompt and create everything together
    if (config) {
      let generatedPrompt: string;
      try {
        generatedPrompt = await generateSystemPrompt(config);
      } catch (err) {
        console.error("[projects] POST: OpenAI prompt gen failed, using fallback:", err);
        generatedPrompt = generateFallbackPrompt(config);
      }

      const project = await prisma.project.create({
        data: {
          userId: session.user.id,
          name: projectName,
          queryLimit: plan.queryLimit,
          modelConfig: {
            temperature: 0.7,
            systemPrompt: generatedPrompt,
            maxTokens: 500,
            model: "gpt-4o-mini",
          },
          config: {
            create: {
              useCase: config.useCase,
              useCaseCustom: config.useCaseCustom ?? null,
              companyName: config.companyName ?? null,
              industry: config.industry ?? null,
              tone: config.tone,
              failureBehavior: config.failureBehavior,
              contactInfo: config.contactInfo ?? null,
              collectFields: config.collectFields,
              restrictions: config.restrictions ?? null,
              customRules: config.customRules ?? null,
              language: config.language,
              responseLength: config.responseLength,
              generatedPrompt,
            },
          },
        },
      });

      return NextResponse.json(project, { status: 201 });
    }

    // No config — backward-compatible simple creation
    const project = await prisma.project.create({
      data: {
        userId: session.user.id,
        name: projectName,
        queryLimit: plan.queryLimit,
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    console.error("[projects] POST error:", err);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const projects = await prisma.project.findMany({
      where: { userId: session.user.id },
      include: { _count: { select: { dataSources: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(projects);
  } catch (err) {
    console.error("[projects] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load projects" },
      { status: 500 }
    );
  }
}
