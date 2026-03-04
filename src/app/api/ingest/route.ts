import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { processDataSource } from "@/lib/ingest-pipeline";

export const maxDuration = 60;
import {
  uploadFile,
  MAX_FILE_SIZE,
  ALLOWED_TYPES,
} from "@/lib/storage";
import { getPlanConfig, formatStorage } from "@/lib/plans";
import type { Plan } from "@/generated/prisma/client";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const projectId = formData.get("projectId") as string | null;

  if (!file || !projectId) {
    return NextResponse.json(
      { error: "Missing file or projectId" },
      { status: 400 }
    );
  }

  // Verify project belongs to user
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // ── Plan limit: storage ─────────────────────────────────
  const plan = getPlanConfig(session.user.plan as Plan);
  const totalStorage = await prisma.dataSource.aggregate({
    where: { project: { userId: session.user.id } },
    _sum: { fileSize: true },
  });
  const currentUsage = totalStorage._sum.fileSize ?? 0;
  if (currentUsage + file.size > plan.storageLimitBytes) {
    return NextResponse.json(
      {
        error: `Storage limit reached (${formatStorage(plan.storageLimitBytes)} on ${plan.name} plan). Please upgrade.`,
        code: "STORAGE_LIMIT",
      },
      { status: 403 }
    );
  }

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}` },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File exceeds 50MB limit" },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = await uploadFile(buffer, file.name);

    const dataSource = await prisma.dataSource.create({
      data: {
        projectId,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        s3Key: storageKey,
        status: "UPLOADING",
      },
    });

    // Trigger processing pipeline (fire and forget)
    processDataSource(dataSource.id).catch(console.error);

    return NextResponse.json(dataSource, { status: 201 });
  } catch (err) {
    console.error("[ingest] POST error:", err);
    return NextResponse.json(
      { error: "Failed to upload file" },
      { status: 500 }
    );
  }
}
