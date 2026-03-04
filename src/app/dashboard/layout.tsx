import { Suspense } from "react";
import { getSession } from "@/lib/get-session";
import { Sidebar } from "@/components/dashboard/sidebar";
import { DemoClaimAgent } from "@/components/demo-claim-agent";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        user={{
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        }}
      />

      {/* Auto-claim any demo project from landing page */}
      <DemoClaimAgent />

      {/* Main content */}
      <main className="lg:pl-64">
        <div className="mx-auto max-w-6xl px-6 py-8 pt-16 lg:pt-8">
          <Suspense>{children}</Suspense>
        </div>
      </main>
    </div>
  );
}
