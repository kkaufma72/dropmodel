import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { openai } from "@/lib/openai";
import { getIndex } from "@/lib/pinecone";

// ─── POST: Create a correction ──────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    projectId?: string;
    originalQuestion?: string;
    originalAnswer?: string;
    correctedAnswer?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId, originalQuestion, originalAnswer, correctedAnswer } = body;

  if (!projectId || !originalQuestion || !originalAnswer || !correctedAnswer) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // Verify ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    // Embed the Q+A pair so it can be matched during retrieval
    const embeddingText = `Question: ${originalQuestion}\nAnswer: ${correctedAnswer}`;
    const embeddingRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: embeddingText,
    });
    const vector = embeddingRes.data[0].embedding;

    // Upsert to Pinecone with correction metadata
    const vectorId = `correction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const index = getIndex();

    await index.upsert({
      records: [
        {
          id: vectorId,
          values: vector,
          metadata: {
            text: correctedAnswer,
            type: "correction",
            question: originalQuestion,
            source: "correction",
          },
        },
      ],
      namespace: projectId,
    });

    // Save to DB
    const correction = await prisma.correction.create({
      data: {
        projectId,
        originalQuestion,
        originalAnswer,
        correctedAnswer,
        vectorId,
      },
    });

    return NextResponse.json(correction, { status: 201 });
  } catch (err) {
    console.error("[corrections] POST error:", err);
    return NextResponse.json(
      { error: "Failed to save correction" },
      { status: 500 }
    );
  }
}

// ─── GET: List corrections for a project ────────────────

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");

  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  // Verify ownership
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const corrections = await prisma.correction.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(corrections);
}

// ─── DELETE: Remove a correction ────────────────────────

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const correction = await prisma.correction.findUnique({
    where: { id },
    include: { project: { select: { userId: true, id: true } } },
  });

  if (!correction || correction.project.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    // Remove from Pinecone
    if (correction.vectorId) {
      const index = getIndex();
      await index
        .deleteMany({ ids: [correction.vectorId], namespace: correction.project.id })
        .catch(console.error);
    }

    // Remove from DB
    await prisma.correction.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[corrections] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to delete correction" },
      { status: 500 }
    );
  }
}
