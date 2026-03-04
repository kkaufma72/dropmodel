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
    // Verify ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: session.user.id },
      select: { id: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // ── Aggregate stats ─────────────────────────────────────
    const [totalResult, todayResult, avgLatency, totalCost] = await Promise.all([
      prisma.usageLog.count({
        where: { projectId },
      }),
      prisma.usageLog.count({
        where: { projectId, createdAt: { gte: todayStart } },
      }),
      prisma.chatMessage.aggregate({
        where: {
          projectId,
          role: "ASSISTANT",
          latencyMs: { gt: 0 },
        },
        _avg: { latencyMs: true },
      }),
      prisma.usageLog.aggregate({
        where: { projectId },
        _sum: { cost: true },
      }),
    ]);

    // ── Daily query counts (last 30 days) ───────────────────
    const dailyLogs = await prisma.usageLog.findMany({
      where: {
        projectId,
        createdAt: { gte: thirtyDaysAgo },
      },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" },
    });

    const dayCounts = new Map<string, number>();

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split("T")[0];
      dayCounts.set(key, 0);
    }

    for (const log of dailyLogs) {
      const key = log.createdAt.toISOString().split("T")[0];
      dayCounts.set(key, (dayCounts.get(key) ?? 0) + 1);
    }

    const dailyData = Array.from(dayCounts.entries()).map(([date, count]) => ({
      date,
      queries: count,
    }));

    return NextResponse.json({
      totalQueries: totalResult,
      queriesToday: todayResult,
      avgResponseMs: Math.round(avgLatency._avg.latencyMs ?? 0),
      estimatedCost: totalCost._sum.cost ?? 0,
      dailyData,
    });
  } catch (err) {
    console.error("[analytics] GET error:", err);
    return NextResponse.json(
      { error: "Failed to load analytics" },
      { status: 500 }
    );
  }
}
