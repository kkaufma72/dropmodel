import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteDataSourceVectors } from "@/lib/ingest-pipeline";
import { deleteFile } from "@/lib/storage";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sourceId } = await params;

  // Find the data source and verify ownership through project
  const dataSource = await prisma.dataSource.findUnique({
    where: { id: sourceId },
    include: { project: { select: { id: true, userId: true } } },
  });

  if (!dataSource || dataSource.project.userId !== session.user.id) {
    return NextResponse.json(
      { error: "Data source not found" },
      { status: 404 }
    );
  }

  // 1. Delete vectors from Pinecone
  try {
    await deleteDataSourceVectors(dataSource.id, dataSource.project.id);
  } catch (err) {
    console.error("[delete] Failed to delete vectors from Pinecone:", err);
    // Continue — still delete DB record & local file
  }

  // 2. Delete file from Supabase Storage
  await deleteFile(dataSource.s3Key);

  // 3. Delete DB record
  await prisma.dataSource.delete({ where: { id: sourceId } });

  // 4. Recompute project status if no sources left or all remaining are indexed
  const remaining = await prisma.dataSource.findMany({
    where: { projectId: dataSource.project.id },
  });

  if (remaining.length === 0) {
    await prisma.project.update({
      where: { id: dataSource.project.id },
      data: { status: "PROCESSING" },
    });
  } else {
    const allIndexed = remaining.every((s) => s.status === "INDEXED");
    if (allIndexed) {
      await prisma.project.update({
        where: { id: dataSource.project.id },
        data: { status: "READY" },
      });
    }
  }

  return NextResponse.json({ success: true });
}
