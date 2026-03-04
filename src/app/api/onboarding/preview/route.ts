import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { previewPromptWithAnswers } from "@/lib/prompt-generator";
import type { QuestionnaireAnswers } from "@/types/onboarding";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: QuestionnaireAnswers;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.useCase || !body.tone || !body.failureBehavior) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const result = await previewPromptWithAnswers(body);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[onboarding/preview] error:", err);
    return NextResponse.json(
      { error: "Failed to generate preview" },
      { status: 500 }
    );
  }
}
