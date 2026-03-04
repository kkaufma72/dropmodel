import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkBotAccess } from "@/lib/marketplace";

// GET /api/marketplace/[slug] — Full bot detail page

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const session = await auth();

    const bot = await prisma.publishedBot.findUnique({
      where: { slug },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            image: true,
            creatorProfile: {
              select: {
                displayName: true,
                bio: true,
                avatarUrl: true,
                websiteUrl: true,
                twitterHandle: true,
                githubHandle: true,
              },
            },
          },
        },
        reviews: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            rating: true,
            title: true,
            body: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                image: true,
              },
            },
          },
        },
        project: {
          select: {
            customization: true,
          },
        },
      },
    });

    if (!bot) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    }

    // Respect visibility
    if (bot.visibility === "PRIVATE" && bot.creatorId !== session?.user?.id) {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    }

    // Check if the current user has starred this bot
    let starred = false;
    if (session?.user?.id) {
      const star = await prisma.botStar.findUnique({
        where: {
          userId_publishedBotId: {
            userId: session.user.id,
            publishedBotId: bot.id,
          },
        },
      });
      starred = !!star;
    }

    // Check access for paid bots
    const access = await checkBotAccess(bot.id, session?.user?.id ?? null);

    return NextResponse.json({
      ...bot,
      project: undefined, // don't expose raw project data
      customization: bot.project?.customization ?? null,
      starred,
      access,
    });
  } catch (err) {
    console.error("[marketplace/slug] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load bot" },
      { status: 500 }
    );
  }
}
