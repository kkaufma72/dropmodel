import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleChatQuery, sseResponse, type ModelConfig } from "@/lib/chat";

export const maxDuration = 30;

export async function POST(req: Request) {
  // ── Auth (session-based) ──────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { message?: string; sessionId?: string; projectId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { message, projectId, sessionId: incomingSessionId } = body;

  if (!message || !projectId) {
    return NextResponse.json(
      { error: "Missing message or projectId" },
      { status: 400 },
    );
  }

  const sessionId = incomingSessionId || uuidv4();

  try {
    // ── Verify project ownership ──────────────────────────
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: session.user.id },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (project.status !== "READY") {
      return NextResponse.json(
        { error: "Model is still processing." },
        { status: 503 },
      );
    }

    // ── Daily query count reset ───────────────────────────
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (project.updatedAt < todayStart) {
      await prisma.project.update({
        where: { id: projectId },
        data: { queryCount: 0 },
      });
      project.queryCount = 0;
    }

    // ── Check query limit ─────────────────────────────────
    if (project.queryCount >= project.queryLimit) {
      return NextResponse.json(
        {
          error: "Query limit reached. Please upgrade your plan.",
          code: "QUERY_LIMIT",
        },
        { status: 429 },
      );
    }

    const config = project.modelConfig as ModelConfig;

    // ── Stream via shared handler ─────────────────────────
    const stream = await handleChatQuery({
      projectId: project.id,
      userId: session.user.id,
      message,
      sessionId,
      modelConfig: config,
      endpoint: "/api/chat",
    });

    return sseResponse(stream, sessionId);
  } catch (err) {
    console.error("[chat] POST error:", err);
    return NextResponse.json(
      { error: "Failed to generate response" },
      { status: 500 },
    );
  }
}
