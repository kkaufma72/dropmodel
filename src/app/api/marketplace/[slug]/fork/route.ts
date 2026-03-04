import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { forkBot } from "@/lib/marketplace";

// POST /api/marketplace/[slug]/fork — Fork a bot

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { slug } = await params;

    // Resolve slug → publishedBotId
    const bot = await prisma.publishedBot.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!bot) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    }

    const result = await forkBot(bot.id, session.user.id);

    if ("error" in result) {
      const status =
        result.code === "NOT_FOUND" ? 404 :
        result.code === "PRIVATE" ? 403 :
        400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(
      {
        forkId: result.fork.id,
        projectId: result.project.id,
        projectName: result.project.name,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[marketplace/fork] POST error:", err);
    return NextResponse.json(
      { error: "Failed to fork bot" },
      { status: 500 }
    );
  }
}
