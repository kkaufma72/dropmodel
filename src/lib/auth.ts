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
      checks: ["state"],
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!profile?.email) return false;
      try {
        // Upsert user in DB on every sign-in
        const dbUser = await prisma.user.upsert({
          where: { email: profile.email },
          update: {
            name: profile.name ?? user.name,
            image: profile.picture as string ?? user.image,
          },
          create: {
            email: profile.email,
            name: profile.name ?? user.name,
            image: profile.picture as string ?? user.image,
          },
        });

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
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              expires_at: account.expires_at,
              id_token: account.id_token,
            },
            create: {
              userId: dbUser.id,
              type: account.type,
              provider: account.provider,
              providerAccountId: account.providerAccountId,
              access_token: account.access_token,
              refresh_token: account.refresh_token,
              expires_at: account.expires_at,
              token_type: account.token_type,
              scope: account.scope,
              id_token: account.id_token,
            },
          });
        }

        // Attach DB user id to the user object for the jwt callback
        user.id = dbUser.id;
        (user as Record<string, unknown>).plan = dbUser.plan;
        return true;
      } catch (e) {
        console.error("[auth] signIn error:", e);
        return false;
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
