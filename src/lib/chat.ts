import { v4 as uuidv4 } from "uuid";
import { openai } from "@/lib/openai";
import { getIndex } from "@/lib/pinecone";
import { prisma } from "@/lib/db";

// ─── Types ──────────────────────────────────────────────

export interface ModelConfig {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface ChatQueryInput {
  projectId: string;
  userId: string;
  message: string;
  sessionId?: string;
  modelConfig?: ModelConfig;
  endpoint?: string;
}

// ─── Constants ──────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful AI assistant. Answer questions based ONLY on the provided context. If the context does not contain enough information to answer the question, you MUST say so — do not guess or make up an answer. Always be concise and helpful.";

const NO_CONTEXT_RESPONSE =
  "I'm sorry, I don't have enough information in my knowledge base to answer that question. Could you try rephrasing, or ask something else related to the uploaded documents?";

const RELEVANCE_THRESHOLD = 0.75;
const CORRECTION_THRESHOLD = 0.85;

// ─── Main Shared Handler ────────────────────────────────

export async function handleChatQuery({
  projectId,
  userId,
  message,
  sessionId: incomingSessionId,
  modelConfig,
  endpoint = "/api/chat",
}: ChatQueryInput): Promise<ReadableStream> {
  const sessionId = incomingSessionId || uuidv4();
  const config = modelConfig ?? {};
  const startTime = Date.now();
  const encoder = new TextEncoder();

  // Helper to send an SSE frame
  function sseEncode(data: string): Uint8Array {
    return encoder.encode(`data: ${data}\n\n`);
  }

  // ── 1. Embed the user message ─────────────────────────
  const embeddingRes = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: message,
  });

  const queryVector = embeddingRes.data[0].embedding;

  // ── 2. Query Pinecone (chunks + corrections in parallel)
  const index = getIndex();

  const [queryResult, correctionResult] = await Promise.all([
    index.query({
      vector: queryVector,
      topK: 5,
      includeMetadata: true,
      includeValues: false,
      namespace: projectId,
      filter: { type: { $ne: "correction" } },
    }),
    index.query({
      vector: queryVector,
      topK: 3,
      includeMetadata: true,
      includeValues: false,
      namespace: projectId,
      filter: { type: { $eq: "correction" } },
    }),
  ]);

  // ── 3. Check for high-confidence correction match ─────
  const correctionMatch = (correctionResult.matches ?? []).find(
    (m) => m.metadata?.text && (m.score ?? 0) >= CORRECTION_THRESHOLD,
  );

  if (correctionMatch) {
    const correctedAnswer = correctionMatch.metadata!.text as string;

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(sseEncode(JSON.stringify({ content: correctedAnswer })));
        controller.enqueue(sseEncode("[DONE]"));
        controller.close();

        // Log async
        const latencyMs = Date.now() - startTime;
        logUsage({
          projectId,
          userId,
          sessionId,
          message,
          response: correctedAnswer,
          tokensIn: embeddingRes.usage?.total_tokens ?? 0,
          tokensOut: 0,
          latencyMs,
          endpoint,
        }).catch(console.error);
      },
    });

    return stream;
  }

  // ── 4. Filter relevant chunks ─────────────────────────
  const relevantMatches = (queryResult.matches ?? [])
    .filter((m) => m.metadata?.text && (m.score ?? 0) >= RELEVANCE_THRESHOLD)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0));

  const contextChunks = relevantMatches.map((m) => m.metadata!.text as string);

  // ── 4b. Fallback if no relevant context ───────────────
  if (contextChunks.length === 0) {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(sseEncode(JSON.stringify({ content: NO_CONTEXT_RESPONSE })));
        controller.enqueue(sseEncode("[DONE]"));
        controller.close();

        const latencyMs = Date.now() - startTime;
        logUsage({
          projectId,
          userId,
          sessionId,
          message,
          response: NO_CONTEXT_RESPONSE,
          tokensIn: embeddingRes.usage?.total_tokens ?? 0,
          tokensOut: 0,
          latencyMs,
          endpoint,
        }).catch(console.error);
      },
    });

    return stream;
  }

  // ── 5. Build prompt ───────────────────────────────────
  const systemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  const contextBlock = `Relevant context:\n\n---\n${contextChunks.join("\n---\n")}\n---`;

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: `${contextBlock}\n\nUser question: ${message}` },
  ];

  // ── 6. Call OpenAI with streaming ─────────────────────
  const completion = await openai.chat.completions.create({
    model: config.model || "gpt-4o-mini",
    temperature: config.temperature ?? 0.7,
    max_tokens: config.maxTokens ?? 500,
    messages,
    stream: true,
  });

  // ── 7. Return SSE ReadableStream ──────────────────────
  let fullResponse = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of completion) {
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) {
            fullResponse += delta;
            controller.enqueue(sseEncode(JSON.stringify({ content: delta })));
          }
        }
        controller.enqueue(sseEncode("[DONE]"));
        controller.close();
      } catch (err) {
        // Send error as SSE then close
        controller.enqueue(
          sseEncode(JSON.stringify({ error: "Stream interrupted" })),
        );
        controller.enqueue(sseEncode("[DONE]"));
        controller.close();
        console.error("[chat] streaming error:", err);
      }

      // ── 8. Log usage async (fire and forget) ────────────
      const latencyMs = Date.now() - startTime;
      const tokensIn = embeddingRes.usage?.total_tokens ?? 0;
      const tokensOut = Math.ceil(fullResponse.length / 4);

      logUsage({
        projectId,
        userId,
        sessionId,
        message,
        response: fullResponse,
        tokensIn,
        tokensOut,
        latencyMs,
        endpoint,
      }).catch(console.error);
    },
  });

  return stream;
}

// ─── SSE Response Helper ────────────────────────────────

export function sseResponse(
  stream: ReadableStream,
  sessionId: string,
): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Session-Id": sessionId,
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Expose-Headers": "X-Session-Id",
    },
  });
}

/** CORS headers for JSON error responses from v1 endpoints */
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers": "X-Session-Id",
} as const;

// ─── Async Logging ──────────────────────────────────────

async function logUsage({
  projectId,
  userId,
  sessionId,
  message,
  response,
  tokensIn,
  tokensOut,
  latencyMs,
  endpoint,
}: {
  projectId: string;
  userId: string;
  sessionId: string;
  message: string;
  response: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  endpoint: string;
}) {
  const cost = tokensIn * 0.00000015 + tokensOut * 0.0000006;

  await Promise.all([
    prisma.chatMessage.create({
      data: {
        projectId,
        sessionId,
        role: "USER",
        content: message,
        tokensUsed: tokensIn,
        latencyMs: 0,
      },
    }),
    prisma.chatMessage.create({
      data: {
        projectId,
        sessionId,
        role: "ASSISTANT",
        content: response,
        tokensUsed: tokensOut,
        latencyMs,
      },
    }),
    prisma.usageLog.create({
      data: {
        projectId,
        userId,
        endpoint,
        tokensIn,
        tokensOut,
        cost,
      },
    }),
    prisma.project.update({
      where: { id: projectId },
      data: { queryCount: { increment: 1 } },
    }),
  ]);
}
