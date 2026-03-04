import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;

  try {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: session.user.id },
      include: {
        dataSources: {
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { chatMessages: true },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...project,
      messageCount: project._count.chatMessages,
      _count: undefined,
    });
  } catch (err) {
    console.error("[project] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load project" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { projectId } = await params;

  // Verify ownership
  const existing = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let body: {
    name?: string;
    modelConfig?: unknown;
    customization?: unknown;
    apiKey?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.modelConfig !== undefined) data.modelConfig = body.modelConfig;
  if (body.customization !== undefined) data.customization = body.customization;
  if (body.apiKey !== undefined) data.apiKey = body.apiKey;

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "No fields to update" },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.project.update({
      where: { id: projectId },
      data,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[project] PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}
