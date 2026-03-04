import { type Plan } from "@/generated/prisma/client";
import { type DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      plan: Plan;
    } & DefaultSession["user"];
  }

  interface User {
    plan?: Plan;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    plan: Plan;
  }
}
