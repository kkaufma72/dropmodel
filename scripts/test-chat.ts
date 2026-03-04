/**
 * scripts/test-chat.ts
 *
 * End-to-end test for the RAG chat pipeline.
 * Finds a READY project, sends a message via /api/v1/chat using the
 * project's apiKey, reads the SSE stream, and prints the response.
 *
 * Usage:
 *   npx tsx scripts/test-chat.ts
 *
 * Prerequisites:
 *   - DATABASE_URL set in .env
 *   - OPENAI_API_KEY set in .env
 *   - PINECONE_API_KEY and PINECONE_INDEX set in .env
 *   - Next.js dev server running on localhost:3000
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// ── Load .env manually (no dotenv dep needed) ───────────
const envPath = resolve(__dirname, "../.env");
try {
  const envFile = readFileSync(envPath, "utf-8");
  for (const line of envFile.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  console.warn("⚠️  Could not read .env file, using existing env vars");
}

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

// ── Colors ──────────────────────────────────────────────
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

async function main() {
  console.log(cyan("\n🧪 RAG Chat Pipeline Test\n"));

  // ── 1. Find a READY project with an apiKey ────────────
  console.log(dim("Looking for a READY project..."));

  // We need Prisma to find a project — import dynamically
  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("../src/generated/prisma/client");

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });

  const project = await prisma.project.findFirst({
    where: { status: "READY" },
    select: { id: true, name: true, apiKey: true },
  });

  if (!project) {
    console.log(red("❌ No READY project found. Upload and index data first."));
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(green(`  ✓ Found project: "${project.name}" (${project.id})`));
  console.log(dim(`    API Key: ${project.apiKey.slice(0, 8)}...`));
  await prisma.$disconnect();

  // ── 2. Send a chat message via /api/v1/chat ───────────
  const message = "What is this data about? Give me a brief summary.";
  console.log(dim(`\nSending message: "${message}"\n`));

  const startTime = Date.now();

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/v1/chat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${project.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });
  } catch (err) {
    console.log(
      red(
        `❌ Could not connect to ${BASE_URL}. Is the dev server running?\n   ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    process.exit(1);
  }

  if (!res.ok) {
    const body = await res.text();
    console.log(red(`❌ HTTP ${res.status}: ${body}`));
    process.exit(1);
  }

  const sessionId = res.headers.get("x-session-id");
  console.log(dim(`  Session ID: ${sessionId}`));
  console.log(dim(`  Content-Type: ${res.headers.get("content-type")}`));

  // ── 3. Read the SSE stream ────────────────────────────
  const reader = res.body?.getReader();
  if (!reader) {
    console.log(red("❌ No response body"));
    process.exit(1);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullResponse = "";
  let tokenCount = 0;
  let firstTokenTime: number | null = null;

  console.log(cyan("\n📨 Streaming response:\n"));
  process.stdout.write("  ");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      const data = trimmed.slice(6);

      if (data === "[DONE]") {
        process.stdout.write("\n");
        continue;
      }

      try {
        const parsed = JSON.parse(data);
        if (parsed.content) {
          if (firstTokenTime === null) {
            firstTokenTime = Date.now();
          }
          fullResponse += parsed.content;
          tokenCount++;
          process.stdout.write(parsed.content);
        }
        if (parsed.error) {
          console.log(red(`\n❌ Stream error: ${parsed.error}`));
          process.exit(1);
        }
      } catch {
        // skip malformed lines
      }
    }
  }

  const totalTime = Date.now() - startTime;
  const ttft = firstTokenTime ? firstTokenTime - startTime : totalTime;

  // ── 4. Results ────────────────────────────────────────
  console.log(cyan("\n\n📊 Results:\n"));
  console.log(`  Response length: ${fullResponse.length} chars`);
  console.log(`  SSE chunks:      ${tokenCount}`);
  console.log(`  TTFT:            ${ttft}ms`);
  console.log(`  Total time:      ${totalTime}ms`);
  console.log(`  Session ID:      ${sessionId}`);

  if (fullResponse.length > 0) {
    console.log(green("\n✅ RAG CHAT PIPELINE TEST PASSED\n"));
  } else {
    console.log(red("\n❌ RAG CHAT PIPELINE TEST FAILED — empty response\n"));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(red(`\n❌ Unexpected error: ${err.message}\n`));
  console.error(err);
  process.exit(1);
});
