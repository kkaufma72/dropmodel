import { getSession } from "@/lib/get-session";

export default async function SettingsPage() {
  const session = await getSession();

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>

      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-500">Name</label>
          <p className="text-gray-900">{session.user.name || "—"}</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-500">Email</label>
          <p className="text-gray-900">{session.user.email || "—"}</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-500">Plan</label>
          <p className="text-gray-900">{session.user.plan || "FREE"}</p>
        </div>
      </div>
    </div>
  );
}
