import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/db";
import type { Plan } from "@/generated/prisma/client";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!profile?.email) {
        console.error("[auth] signIn: no email in profile");
        return false;
      }
      try {
        // Upsert user in DB on every sign-in
        const dbUser = await prisma.user.upsert({
          where: { email: profile.email },
          update: {
            name: profile.name ?? user.name ?? null,
            image: (profile as Record<string, unknown>).picture as string ?? user.image ?? null,
          },
          create: {
            email: profile.email,
            name: profile.name ?? user.name ?? null,
            image: (profile as Record<string, unknown>).picture as string ?? user.image ?? null,
          },
        });
        console.log("[auth] signIn: user upserted", dbUser.id);

        // Upsert the linked account
        if (account) {
          await prisma.account.upsert({
            where: {
              provider_providerAccountId: {
                provider: account.provider,
                providerAccountId: account.providerAccountId,
              },
            },
            update: {
              access_token: account.access_token ?? null,
              refresh_token: account.refresh_token ?? null,
              expires_at: account.expires_at ?? null,
              id_token: account.id_token ?? null,
            },
            create: {
              userId: dbUser.id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              access_token: account.access_token ?? null,
              refresh_token: account.refresh_token ?? null,
              expires_at: account.expires_at ?? null,
              token_type: account.token_type ?? null,
              scope: account.scope ?? null,
              id_token: account.id_token ?? null,
            },
          });
          console.log("[auth] signIn: account upserted");
        }

        // Attach DB user id to the user object for the jwt callback
        user.id = dbUser.id;
        (user as Record<string, unknown>).plan = dbUser.plan;
        return true;
      } catch (e) {
        console.error("[auth] signIn error:", e);
        return true; // Still allow sign-in even if DB fails
      }
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.plan = ((user as Record<string, unknown>).plan as Plan) ?? "FREE";
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.plan = token.plan;
      return session;
    },
  },
});
