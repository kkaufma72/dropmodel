import Link from "next/link";
import { FileQuestion, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gray-100">
        <FileQuestion className="h-10 w-10 text-gray-400" />
      </div>

      <h1 className="mt-8 text-3xl font-bold tracking-tight text-gray-900">
        Page not found
      </h1>
      <p className="mt-3 max-w-md text-base text-gray-500">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>

      <div className="mt-8 flex items-center gap-3">
        <Link
          href="/"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-violet-600 px-5 text-sm font-medium text-white transition-colors hover:bg-violet-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Go home
        </Link>
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Dashboard
        </Link>
      </div>
    </div>
  );
}
