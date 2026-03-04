import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // Test raw DB connection
    const userCount = await prisma.user.count();
    
    // Test NextAuth import
    let authStatus = 'unknown';
    try {
      const { auth } = await import("@/lib/auth");
      authStatus = typeof auth === 'function' ? 'loaded' : 'null';
    } catch (authErr: unknown) {
      authStatus = `FAILED: ${authErr instanceof Error ? authErr.message : String(authErr)}`;
    }

    // Check env vars (redacted)
    const envCheck = {
      DATABASE_URL: process.env.DATABASE_URL ? 
        process.env.DATABASE_URL.replace(/:[^@]+@/, ':***@').substring(0, 80) + '...' : 'MISSING',
      AUTH_SECRET: process.env.AUTH_SECRET ? 'SET' : 'MISSING',
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'MISSING',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'SET' : 'MISSING',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'MISSING',
    };

    return NextResponse.json({
      status: 'ok',
      dbConnected: true,
      userCount,
      authStatus,
      env: envCheck,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack?.split('\n').slice(0, 5) : [];
    return NextResponse.json({
      status: 'error',
      dbConnected: false,
      error: message,
      stack,
      env: {
        DATABASE_URL: process.env.DATABASE_URL ?
          process.env.DATABASE_URL.replace(/:[^@]+@/, ':***@').substring(0, 80) + '...' : 'MISSING',
        NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'MISSING',
      },
    }, { status: 500 });
  }
}
