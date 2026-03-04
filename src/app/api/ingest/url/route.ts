import { NextResponse } from "next/server";
import { load } from "cheerio";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { processDataSource } from "@/lib/ingest-pipeline";

export const maxDuration = 60;
import { uploadFile } from "@/lib/storage";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { url, projectId } = body as { url?: string; projectId?: string };

  if (!url || !projectId) {
    return NextResponse.json(
      { error: "Missing url or projectId" },
      { status: 400 }
    );
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Verify project belongs to user
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Fetch the page
  let html: string;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "DropModel Bot/1.0" },
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch URL: ${response.status}` },
        { status: 400 }
      );
    }
    html = await response.text();
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch URL" },
      { status: 400 }
    );
  }

  // Extract text content with cheerio
  const $ = load(html);
  $("script, style, nav, footer, header, iframe, noscript").remove();

  const title = $("title").text().trim();
  const mainContent =
    $("article, main, [role='main']").text() || $("body").text();
  const text = [title, mainContent]
    .filter(Boolean)
    .join("\n\n")
    .replace(/\s+/g, " ")
    .trim();

  if (!text || text.length < 50) {
    return NextResponse.json(
      { error: "Could not extract meaningful content from URL" },
      { status: 400 }
    );
  }

  // Save extracted text as a file
  const fileName = `${parsedUrl.hostname}${parsedUrl.pathname.replace(/\//g, "_")}.txt`;
  const buffer = Buffer.from(text, "utf-8");
  const storageKey = await uploadFile(buffer, fileName);

  const dataSource = await prisma.dataSource.create({
    data: {
      projectId,
      fileName,
      fileType: "text/plain",
      fileSize: buffer.byteLength,
      s3Key: storageKey,
      status: "UPLOADING",
    },
  });

  // Trigger processing pipeline (fire and forget)
  processDataSource(dataSource.id).catch(console.error);

  return NextResponse.json(dataSource, { status: 201 });
}
