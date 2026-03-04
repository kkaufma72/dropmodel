import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// ── In-memory rate limiter for /api/v1/* ────────────────
// Map<apiKey, { timestamps: number[] }>
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per window

function isRateLimited(apiKey: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(apiKey) ?? [];

  // Remove timestamps outside the window
  const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
  recent.push(now);
  rateLimitMap.set(apiKey, recent);

  return recent.length > RATE_LIMIT_MAX;
}

// Clean up stale entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitMap.entries()) {
    const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW);
    if (recent.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, recent);
    }
  }
}, 5 * 60_000);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Protect /dashboard/* routes ─────────────────────
  if (pathname.startsWith("/dashboard")) {
    const isSecure = request.url.startsWith("https://");
    const cookieName = isSecure
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";

    const token = await getToken({
      req: request,
      secret: process.env.AUTH_SECRET,
      secureCookie: isSecure,
      cookieName,
      salt: cookieName,
    });

    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ── 2. Rate-limit /api/v1/* routes ─────────────────────
  if (pathname.startsWith("/api/v1")) {
    const authHeader = request.headers.get("authorization");
    const apiKey = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : "anonymous";

    if (isRateLimited(apiKey)) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Max 60 requests per minute." },
        { status: 429, headers: { "Retry-After": "60" } }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/v1/:path*"],
};
