import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { submitReview } from "@/lib/marketplace";

// POST /api/marketplace/[slug]/review — Submit or update a review
// GET  /api/marketplace/[slug]/review — Get paginated reviews

export async function POST(
  req: Request,
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

    const body = await req.json().catch(() => null);
    if (!body || typeof body.rating !== "number") {
      return NextResponse.json(
        { error: "Rating is required" },
        { status: 400 }
      );
    }

    const result = await submitReview(bot.id, session.user.id, {
      rating: body.rating,
      title: body.title,
      body: body.body,
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json(result.review, { status: 201 });
  } catch (err) {
    console.error("[marketplace/review] POST error:", err);
    return NextResponse.json(
      { error: "Failed to submit review" },
      { status: 500 }
    );
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(url.searchParams.get("limit") ?? "10", 10))
    );

    // Resolve slug → publishedBotId
    const bot = await prisma.publishedBot.findUnique({
      where: { slug },
      select: { id: true, visibility: true },
    });

    if (!bot || bot.visibility === "PRIVATE") {
      return NextResponse.json({ error: "Bot not found" }, { status: 404 });
    }

    const [reviews, total] = await Promise.all([
      prisma.botReview.findMany({
        where: { publishedBotId: bot.id },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          rating: true,
          title: true,
          body: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      }),
      prisma.botReview.count({ where: { publishedBotId: bot.id } }),
    ]);

    return NextResponse.json({
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[marketplace/review] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load reviews" },
      { status: 500 }
    );
  }
}
