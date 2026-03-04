import { auth, signIn } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Chrome } from "lucide-react";

export default async function LoginPage() {
  // Wrap auth() in try-catch to prevent redirect loops from corrupted cookies
  try {
    const session = await auth();
    if (session?.user) {
      redirect("/dashboard");
    }
  } catch (e: unknown) {
    // Re-throw Next.js redirect (it uses a special error internally)
    if (e && typeof e === "object" && "digest" in e) throw e;
    // Swallow any other auth errors (corrupted cookies, etc.) — just show login
    console.error("[login] auth() error (ignored):", e);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm space-y-8 rounded-2xl bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Sign in to DropModel
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Build custom AI chatbots from your data
          </p>
        </div>

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            <Chrome className="h-5 w-5" />
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  );
}
