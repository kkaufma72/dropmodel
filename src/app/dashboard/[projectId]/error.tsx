"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";

export default function ProjectError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[project] Error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>

      <h2 className="mt-6 text-xl font-semibold text-gray-900">
        Failed to load project
      </h2>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        We couldn&apos;t load this project. It may have been deleted, or there
        was a temporary issue with our servers.
      </p>

      {error.digest && (
        <p className="mt-2 text-xs text-gray-400">Error ID: {error.digest}</p>
      )}

      <div className="mt-8 flex items-center gap-3">
        <button
          onClick={reset}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-5 text-sm font-medium text-white transition-colors hover:bg-violet-700"
        >
          <RotateCw className="h-4 w-4" />
          Try again
        </button>
        <button
          onClick={() => router.push("/dashboard")}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to projects
        </button>
      </div>
    </div>
  );
}
