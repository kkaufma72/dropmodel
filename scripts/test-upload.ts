/**
 * scripts/test-upload.ts
 *
 * End-to-end test for the file upload → ingest → index pipeline.
 *
 * Usage:
 *   npx tsx scripts/test-upload.ts
 *
 * Prerequisites:
 *   - DATABASE_URL set in .env
 *   - OPENAI_API_KEY set in .env
 *   - PINECONE_API_KEY and PINECONE_INDEX set in .env
 *   - Next.js dev server running on localhost:3000
 */

import { writeFileSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60; // 2 minutes max

// ─── Colors ────────────────────────────────────────────

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

// ─── Main ──────────────────────────────────────────────

async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║     DropModel Upload Pipeline Test       ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // 1. Create a test user + project directly in the DB
  console.log("1️⃣  Creating test user & project in DB...");

  const { PrismaClient } = await import("../src/generated/prisma/client");
  const { PrismaPg } = await import("@prisma/adapter-pg");

  // Load .env manually for scripts
  const { readFileSync } = await import("fs");
  const envPath = join(process.cwd(), ".env");
  try {
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx);
      let value = trimmed.slice(eqIdx + 1);
      // Strip surrounding quotes
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    console.log(dim("  (no .env file found, using existing env vars)"));
  }

  if (!process.env.DATABASE_URL) {
    console.error(red("✗ DATABASE_URL not set. Aborting."));
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  let testUserId: string;
  let testProjectId: string;
  let testApiKey: string;

  try {
    // Upsert test user
    const user = await prisma.user.upsert({
      where: { email: "test-upload@dropmodel.internal" },
      update: {},
      create: {
        email: "test-upload@dropmodel.internal",
        name: "Upload Test Bot",
        plan: "FREE",
      },
    });
    testUserId = user.id;
    console.log(green(`  ✓ User: ${user.email} (${user.id})`));

    // Create test project
    const project = await prisma.project.create({
      data: {
        userId: testUserId,
        name: `Upload Test ${new Date().toISOString().slice(0, 19)}`,
        status: "PROCESSING",
      },
    });
    testProjectId = project.id;
    testApiKey = project.apiKey;
    console.log(green(`  ✓ Project: ${project.name} (${project.id})`));
    console.log(dim(`    API key: ${testApiKey}`));
  } catch (err) {
    console.error(red(`✗ DB setup failed: ${err instanceof Error ? err.message : err}`));
    await prisma.$disconnect();
    process.exit(1);
  }

  // 2. Create a test text file
  console.log("\n2️⃣  Creating test file...");

  const testContent = `
The History of Artificial Intelligence

Artificial intelligence (AI) has a rich history spanning several decades. The field was formally 
founded in 1956 at a conference at Dartmouth College, where John McCarthy coined the term 
"artificial intelligence." Early researchers were optimistic that machines could be made to simulate 
every aspect of learning and intelligence within a generation. The initial years saw the development 
of programs that could play checkers, prove mathematical theorems, and process natural language at 
a basic level. These early successes fueled excitement but also set unrealistic expectations.

The period from the mid-1970s to the early 1990s is often referred to as the "AI winters," during 
which funding and interest in AI research declined significantly. The limitations of early AI 
approaches became apparent — systems were brittle, could not generalize beyond their training data, 
and required enormous amounts of hand-crafted rules. Expert systems, which encoded human knowledge 
as if-then rules, enjoyed a brief period of commercial success in the 1980s but ultimately proved 
too expensive to maintain and too narrow in their capabilities. Despite these setbacks, foundational 
work continued in areas like neural networks, probabilistic reasoning, and machine learning.

The modern era of AI began in the 2010s with breakthroughs in deep learning. Powered by massive 
datasets, GPU computing, and improved algorithms, neural networks achieved superhuman performance 
on tasks like image recognition, natural language processing, and game playing. The release of 
transformer-based models like GPT and BERT revolutionized how machines understand and generate 
human language. Today, AI is integrated into everyday products — from voice assistants and 
recommendation systems to autonomous vehicles and medical diagnostics. The rapid advancement has 
also raised important questions about ethics, bias, job displacement, and the long-term implications 
of creating increasingly capable artificial minds.
`.trim();

  const tmpDir = join(process.cwd(), "tmp");
  mkdirSync(tmpDir, { recursive: true });
  const testFilePath = join(tmpDir, "test-upload-sample.txt");
  writeFileSync(testFilePath, testContent, "utf-8");
  console.log(green(`  ✓ Created ${testFilePath} (${testContent.length} chars)`));

  // 3. Upload via the ingest API
  console.log("\n3️⃣  Uploading file to /api/ingest...");

  // We can't use the authenticated API directly from a script (no session cookie),
  // so we call processDataSource directly instead.
  let dataSourceId: string;

  try {
    // Simulate what the API route does:
    // a) Save file to uploads/
    const { uploadFile } = await import("../src/lib/storage");
    const fileBuffer = Buffer.from(testContent, "utf-8");
    const storageKey = await uploadFile(fileBuffer, "test-upload-sample.txt");
    console.log(green(`  ✓ File saved to uploads/${storageKey}`));

    // b) Create DataSource record
    const dataSource = await prisma.dataSource.create({
      data: {
        projectId: testProjectId,
        fileName: "test-upload-sample.txt",
        fileType: "text/plain",
        fileSize: fileBuffer.length,
        s3Key: storageKey,
        status: "UPLOADING",
      },
    });
    dataSourceId = dataSource.id;
    console.log(green(`  ✓ DataSource created: ${dataSource.id} (status: ${dataSource.status})`));

    // c) Trigger the pipeline
    console.log(dim("  → Triggering processDataSource (fire-and-forget)..."));
    const { processDataSource } = await import("../src/lib/ingest-pipeline");
    processDataSource(dataSourceId).catch((err: unknown) => {
      console.error(red(`  ✗ processDataSource crashed: ${err instanceof Error ? err.message : err}`));
    });
  } catch (err) {
    console.error(red(`✗ Upload setup failed: ${err instanceof Error ? err.message : err}`));
    await cleanup(prisma, testProjectId, testFilePath);
    process.exit(1);
  }

  // 4. Poll until indexed (or error)
  console.log("\n4️⃣  Polling for status updates...");

  let finalStatus = "UNKNOWN";
  let attempts = 0;
  let lastStatus = "";

  while (attempts < MAX_POLL_ATTEMPTS) {
    attempts++;
    await sleep(POLL_INTERVAL_MS);

    try {
      const ds = await prisma.dataSource.findUnique({
        where: { id: dataSourceId! },
        select: { status: true, chunkCount: true, errorMessage: true },
      });

      if (!ds) {
        console.error(red("  ✗ DataSource record vanished!"));
        break;
      }

      const statusStr = ds.status.toString();
      if (statusStr !== lastStatus) {
        lastStatus = statusStr;
        const icon =
          statusStr === "INDEXED" ? "✓" :
          statusStr === "ERROR" ? "✗" :
          "⏳";
        const color =
          statusStr === "INDEXED" ? green :
          statusStr === "ERROR" ? red :
          yellow;
        console.log(color(`  ${icon} Status: ${statusStr}`) +
          (ds.chunkCount ? dim(` (${ds.chunkCount} chunks)`) : "") +
          (ds.errorMessage ? red(` — ${ds.errorMessage}`) : ""));
      }

      if (statusStr === "INDEXED" || statusStr === "ERROR") {
        finalStatus = statusStr;
        break;
      }
    } catch (err) {
      console.log(dim(`  (poll error: ${err instanceof Error ? err.message : err})`));
    }
  }

  if (finalStatus === "UNKNOWN") {
    console.error(red("\n✗ Timed out waiting for indexing to complete."));
  }

  // 5. Verify project status
  console.log("\n5️⃣  Verifying project status...");

  const project = await prisma.project.findUnique({
    where: { id: testProjectId },
    select: { status: true },
  });

  if (project) {
    const projStatus = project.status.toString();
    if (projStatus === "READY") {
      console.log(green(`  ✓ Project status: ${projStatus}`));
    } else {
      console.log(red(`  ✗ Project status: ${projStatus} (expected READY)`));
    }
  }

  // 6. Summary
  console.log("\n" + "═".repeat(44));
  if (finalStatus === "INDEXED") {
    console.log(green("  ✅ UPLOAD PIPELINE TEST PASSED"));
  } else {
    console.log(red(`  ❌ UPLOAD PIPELINE TEST FAILED (status: ${finalStatus})`));
  }
  console.log("═".repeat(44) + "\n");

  // Cleanup
  await cleanup(prisma, testProjectId, testFilePath);
  process.exit(finalStatus === "INDEXED" ? 0 : 1);
}

// ─── Helpers ────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanup(prisma: any, projectId: string, testFilePath: string) {
  console.log(dim("  Cleaning up test data..."));
  try {
    // Delete data sources first (FK constraint)
    await prisma.dataSource.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    unlinkSync(testFilePath);
  } catch {
    // best-effort
  }
  await prisma.$disconnect();
}

// ─── Run ────────────────────────────────────────────────

main().catch((err) => {
  console.error(red(`\nUnhandled error: ${err instanceof Error ? err.message : err}`));
  if (err instanceof Error && err.stack) {
    console.error(dim(err.stack));
  }
  process.exit(1);
});
