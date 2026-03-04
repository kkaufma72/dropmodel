import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { BotCategory } from "@/generated/prisma/client";

// GET /api/marketplace — Browse & search published bots
// Query params: category, search, sort, page, limit

const VALID_SORTS = ["popular", "newest", "top_rated", "trending"] as const;
type SortOption = (typeof VALID_SORTS)[number];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const category = url.searchParams.get("category") as BotCategory | null;
    const search = url.searchParams.get("search")?.trim() ?? "";
    const sort = (url.searchParams.get("sort") ?? "popular") as SortOption;
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(
      50,
      Math.max(1, parseInt(url.searchParams.get("limit") ?? "20", 10))
    );

    // Build where clause — only PUBLIC bots
    const where: Record<string, unknown> = {
      visibility: "PUBLIC",
    };

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: "insensitive" } },
        { shortDescription: { contains: search, mode: "insensitive" } },
        { tags: { has: search.toLowerCase() } },
      ];
    }

    // Build orderBy
    let orderBy: Record<string, string>;
    switch (sort) {
      case "newest":
        orderBy = { publishedAt: "desc" };
        break;
      case "top_rated":
        orderBy = { avgRating: "desc" };
        break;
      case "trending":
        orderBy = { weeklyQueries: "desc" };
        break;
      case "popular":
      default:
        orderBy = { starCount: "desc" };
        break;
    }

    const [bots, total] = await Promise.all([
      prisma.publishedBot.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          slug: true,
          displayName: true,
          shortDescription: true,
          category: true,
          tags: true,
          iconUrl: true,
          accessType: true,
          monthlyPrice: true,
          starCount: true,
          forkCount: true,
          avgRating: true,
          ratingCount: true,
          featured: true,
          verified: true,
          publishedAt: true,
          creator: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
      }),
      prisma.publishedBot.count({ where }),
    ]);

    return NextResponse.json({
      bots,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[marketplace] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load marketplace" },
      { status: 500 }
    );
  }
}
