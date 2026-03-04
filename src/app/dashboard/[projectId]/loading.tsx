export default function ProjectDetailLoading() {
  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col lg:h-[calc(100vh-2rem)]">
      {/* ── Top bar skeleton ─────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-gray-200 pb-4">
        <div className="h-8 w-8 animate-pulse rounded-md bg-gray-200" />
        <div className="h-6 w-48 animate-pulse rounded-lg bg-gray-200" />
        <div className="h-5 w-20 animate-pulse rounded-full bg-gray-100" />
      </div>

      {/* ── Tab navigation skeleton ──────────────────────── */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6 py-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-5 w-20 animate-pulse rounded bg-gray-100"
            />
          ))}
        </div>
      </div>

      {/* ── Content area skeleton ─────────────────────────── */}
      <div className="min-h-0 flex-1 p-4">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Message-like blocks */}
          <div className="flex justify-end">
            <div className="h-10 w-56 animate-pulse rounded-2xl bg-violet-100" />
          </div>
          <div className="flex justify-start">
            <div className="h-20 w-72 animate-pulse rounded-2xl bg-gray-100" />
          </div>
          <div className="flex justify-end">
            <div className="h-10 w-44 animate-pulse rounded-2xl bg-violet-100" />
          </div>
          <div className="flex justify-start">
            <div className="h-16 w-64 animate-pulse rounded-2xl bg-gray-100" />
          </div>
        </div>
      </div>

      {/* ── Input bar skeleton ────────────────────────────── */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <div className="h-10 flex-1 animate-pulse rounded-lg bg-gray-100" />
          <div className="h-10 w-10 animate-pulse rounded-lg bg-gray-200" />
        </div>
      </div>
    </div>
  );
}
