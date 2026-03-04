import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publishBot, type PublishBotInput } from "@/lib/marketplace";

// POST   /api/projects/[projectId]/publish — Publish bot to marketplace
// PATCH  /api/projects/[projectId]/publish — Update listing
// DELETE /api/projects/[projectId]/publish — Unpublish (set PRIVATE)

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { projectId } = await params;
    const body = (await req.json()) as PublishBotInput;

    if (!body.slug || !body.displayName || !body.shortDescription || !body.category) {
      return NextResponse.json(
        { error: "slug, displayName, shortDescription, and category are required" },
        { status: 400 }
      );
    }

    const result = await publishBot(projectId, session.user.id, body);

    if ("error" in result) {
      const status =
        result.code === "NOT_FOUND" ? 404 :
        result.code === "SLUG_TAKEN" ? 409 :
        400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result.bot, {
      status: result.created ? 201 : 200,
    });
  } catch (err) {
    console.error("[publish] POST error:", err);
    return NextResponse.json(
      { error: "Failed to publish bot" },
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

  try {
    const { projectId } = await params;

    // Verify ownership + existing listing
    const existing = await prisma.publishedBot.findUnique({
      where: { projectId },
      include: {
        project: { select: { userId: true } },
      },
    });

    if (!existing || existing.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();

    // Only allow updating certain fields
    const allowed: Record<string, unknown> = {};
    const updatable = [
      "displayName",
      "shortDescription",
      "longDescription",
      "category",
      "tags",
      "iconUrl",
      "coverImageUrl",
      "visibility",
      "accessType",
      "monthlyPrice",
      "trialQueries",
    ] as const;

    for (const key of updatable) {
      if (body[key] !== undefined) {
        allowed[key] = body[key];
      }
    }

    // If changing slug, validate it
    if (body.slug !== undefined && body.slug !== existing.slug) {
      const slugRegex = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;
      if (!slugRegex.test(body.slug)) {
        return NextResponse.json(
          { error: "Invalid slug format" },
          { status: 400 }
        );
      }
      const slugTaken = await prisma.publishedBot.findUnique({
        where: { slug: body.slug },
        select: { id: true },
      });
      if (slugTaken) {
        return NextResponse.json(
          { error: "Slug already taken" },
          { status: 409 }
        );
      }
      allowed.slug = body.slug;
    }

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    // If switching to PAID, validate price
    if (allowed.accessType === "PAID") {
      const price = allowed.monthlyPrice ?? existing.monthlyPrice;
      if (!price || (price as number) <= 0) {
        return NextResponse.json(
          { error: "Paid bots require a positive monthly price" },
          { status: 400 }
        );
      }
    }

    // If switching to FREE, clear price
    if (allowed.accessType === "FREE") {
      allowed.monthlyPrice = null;
    }

    const updated = await prisma.publishedBot.update({
      where: { projectId },
      data: allowed,
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("[publish] PATCH error:", err);
    return NextResponse.json(
      { error: "Failed to update listing" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { projectId } = await params;

    // Verify ownership
    const existing = await prisma.publishedBot.findUnique({
      where: { projectId },
      include: {
        project: { select: { userId: true } },
      },
    });

    if (!existing || existing.project.userId !== session.user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Soft-delete: set visibility to PRIVATE instead of deleting
    await prisma.publishedBot.update({
      where: { projectId },
      data: { visibility: "PRIVATE" },
    });

    return NextResponse.json({ success: true, message: "Bot unpublished" });
  } catch (err) {
    console.error("[publish] DELETE error:", err);
    return NextResponse.json(
      { error: "Failed to unpublish bot" },
      { status: 500 }
    );
  }
}
