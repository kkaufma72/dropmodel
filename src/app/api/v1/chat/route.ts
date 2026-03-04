import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/db";

export const maxDuration = 30;
import {
  handleChatQuery,
  sseResponse,
  corsHeaders,
  type ModelConfig,
} from "@/lib/chat";

// ── CORS preflight ─────────────────────────────────────
export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

function corsJson(data: Record<string, unknown>, status: number) {
  return NextResponse.json(data, { status, headers: corsHeaders });
}

export async function POST(req: Request) {
  // ── Auth (API-key based) ──────────────────────────────
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return corsJson({ error: "Missing API key" }, 401);
  }

  const apiKey = authHeader.slice(7);

  let body: { message?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return corsJson({ error: "Invalid JSON body" }, 400);
  }

  const { message, sessionId: incomingSessionId } = body;

  if (!message || typeof message !== "string") {
    return corsJson({ error: "Missing message" }, 400);
  }

  const sessionId = incomingSessionId || uuidv4();

  // ── Look up project by apiKey ─────────────────────────
  let project;
  try {
    project = await prisma.project.findUnique({ where: { apiKey } });
  } catch (err) {
    console.error("[v1/chat] DB error:", err);
    return corsJson({ error: "Internal server error" }, 500);
  }

  if (!project) {
    return corsJson({ error: "Invalid API key" }, 401);
  }

  if (project.status !== "READY") {
    return corsJson({ error: "Model is still processing." }, 503);
  }

  // ── Daily query count reset ───────────────────────────
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  if (project.updatedAt < todayStart) {
    await prisma.project
      .update({
        where: { id: project.id },
        data: { queryCount: 0 },
      })
      .catch(console.error);
    project.queryCount = 0;
  }

  // ── Check limits ──────────────────────────────────────
  if (project.queryCount >= project.queryLimit) {
    return corsJson(
      { error: "Query limit reached. Please upgrade your plan.", code: "QUERY_LIMIT" },
      429,
    );
  }

  const config = project.modelConfig as ModelConfig;

  try {
    // ── Stream via shared handler ─────────────────────────
    const stream = await handleChatQuery({
      projectId: project.id,
      userId: project.userId,
      message,
      sessionId,
      modelConfig: config,
      endpoint: "/api/v1/chat",
    });

    return sseResponse(stream, sessionId);
  } catch (err) {
    console.error("[v1/chat] POST error:", err);
    return corsJson({ error: "Failed to generate response" }, 500);
  }
}
