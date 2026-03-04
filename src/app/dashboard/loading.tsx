export default function DashboardLoading() {
  return (
    <>
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-7 w-48 animate-pulse rounded-lg bg-gray-200" />
          <div className="mt-2 h-4 w-64 animate-pulse rounded bg-gray-100" />
        </div>
        <div className="h-10 w-36 animate-pulse rounded-lg bg-gray-200" />
      </div>

      {/* Project cards skeleton */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            {/* Title + badge */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
                <div className="mt-2 h-5 w-20 animate-pulse rounded-full bg-gray-100" />
              </div>
            </div>

            {/* Stats */}
            <div className="mt-4 flex items-center gap-4">
              <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-28 animate-pulse rounded bg-gray-100" />
            </div>

            {/* Usage bar */}
            <div className="mt-3 h-1.5 w-full animate-pulse rounded-full bg-gray-100" />

            {/* Date */}
            <div className="mt-3 h-3 w-32 animate-pulse rounded bg-gray-50" />
          </div>
        ))}
      </div>
    </>
  );
}
