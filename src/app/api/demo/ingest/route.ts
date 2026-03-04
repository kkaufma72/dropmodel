import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/db";
import { processDataSource } from "@/lib/ingest-pipeline";

export const maxDuration = 60;
import { uploadFile, MAX_FILE_SIZE, ALLOWED_TYPES } from "@/lib/storage";

const DEMO_USER_ID = "demo-user-internal";
const DEMO_FILE_SIZE_LIMIT = 2 * 1024 * 1024; // 2 MB for demos
const DEMO_COOKIE = "dm_demo_token";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  // Validate file type
  if (!ALLOWED_TYPES.includes(file.type as (typeof ALLOWED_TYPES)[number])) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}` },
      { status: 400 }
    );
  }

  // Stricter size limit for demos
  if (file.size > DEMO_FILE_SIZE_LIMIT) {
    return NextResponse.json(
      { error: "Demo files are limited to 2 MB. Sign up for more." },
      { status: 400 }
    );
  }

  // ── Get or create demo token ──────────────────────────
  const cookieStore = await cookies();
  let demoToken = cookieStore.get(DEMO_COOKIE)?.value;

  // If there's already a demo project for this token, reject (1 demo per session)
  if (demoToken) {
    const existing = await prisma.project.findUnique({
      where: { demoToken },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "You already have a demo project. Sign up to create more!" },
        { status: 409 }
      );
    }
  }

  // Generate fresh token
  demoToken = uuidv4();

  try {
    // ── Create demo project ─────────────────────────────
    const project = await prisma.project.create({
      data: {
        userId: DEMO_USER_ID,
        name: `Demo — ${file.name}`,
        demoToken,
        queryLimit: 5, // Very limited for demo
      },
    });

    // ── Upload & ingest ─────────────────────────────────
    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = await uploadFile(buffer, file.name);

    const dataSource = await prisma.dataSource.create({
      data: {
        projectId: project.id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        s3Key: storageKey,
        status: "UPLOADING",
      },
    });

    // Trigger processing pipeline (fire and forget)
    processDataSource(dataSource.id).catch(console.error);

    // ── Set cookie ──────────────────────────────────────
    const response = NextResponse.json(
      {
        projectId: project.id,
        dataSourceId: dataSource.id,
        apiKey: project.apiKey,
      },
      { status: 201 }
    );

    response.cookies.set(DEMO_COOKIE, demoToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("[demo/ingest] POST error:", err);
    return NextResponse.json(
      { error: "Failed to process demo file" },
      { status: 500 }
    );
  }
}
