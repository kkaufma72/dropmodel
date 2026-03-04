import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const DEMO_COOKIE = "dm_demo_token";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  const demoToken = cookieStore.get(DEMO_COOKIE)?.value;

  if (!demoToken) {
    return NextResponse.json({ error: "No demo project found" }, { status: 404 });
  }

  try {
    const project = await prisma.project.findUnique({
      where: { demoToken },
      select: { id: true, userId: true },
    });

    if (!project) {
      return NextResponse.json({ error: "Demo project not found" }, { status: 404 });
    }

    // Transfer ownership: set the real user, clear the demo token
    await prisma.project.update({
      where: { id: project.id },
      data: {
        userId: session.user.id,
        demoToken: null,
        queryLimit: 50, // Restore normal free-tier limit
      },
    });

    // Clear the demo cookie
    const response = NextResponse.json({
      projectId: project.id,
      message: "Demo project claimed successfully",
    });

    response.cookies.set(DEMO_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 0,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("[demo/claim] error:", err);
    return NextResponse.json(
      { error: "Failed to claim demo project" },
      { status: 500 }
    );
  }
}
