import Link from "next/link";
import { Plus, FolderOpen, ArrowRight, Database } from "lucide-react";
import { getSession } from "@/lib/get-session";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const session = await getSession();

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    include: { _count: { select: { dataSources: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
            Your Projects
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your AI chatbot projects
          </p>
        </div>
        <Link href="/dashboard/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </Link>
      </div>

      {/* Content */}
      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              sourceCount={project._count.dataSources}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ProjectCard({
  project,
  sourceCount,
}: {
  project: {
    id: string;
    name: string;
    status: string;
    queryCount: number;
    queryLimit: number;
    createdAt: Date;
  };
  sourceCount: number;
}) {
  const usagePercent =
    project.queryLimit > 0
      ? Math.round((project.queryCount / project.queryLimit) * 100)
      : 0;

  return (
    <Link
      href={`/dashboard/${project.id}`}
      className="group relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
    >
      {/* Top row */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 group-hover:text-violet-700 transition-colors">
            {project.name}
          </h3>
          <div className="mt-1.5">
            <StatusBadge status={project.status} />
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-gray-300 transition-all group-hover:translate-x-0.5 group-hover:text-violet-500" />
      </div>

      {/* Stats */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <Database className="h-3.5 w-3.5" />
          {sourceCount} {sourceCount === 1 ? "source" : "sources"}
        </div>
        <div>
          {project.queryCount.toLocaleString()} / {project.queryLimit.toLocaleString()} queries
        </div>
      </div>

      {/* Usage bar */}
      <div className="mt-3">
        <div className="h-1.5 w-full rounded-full bg-gray-100">
          <div
            className={`h-1.5 rounded-full transition-all ${
              usagePercent >= 90
                ? "bg-red-500"
                : usagePercent >= 70
                  ? "bg-amber-500"
                  : "bg-violet-500"
            }`}
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Footer */}
      <p className="mt-3 text-xs text-gray-400">
        Created {project.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
      </p>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="mt-16 flex flex-col items-center text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-violet-50">
        <FolderOpen className="h-10 w-10 text-violet-400" />
      </div>
      <h2 className="mt-6 text-lg font-medium text-gray-900">No projects yet</h2>
      <p className="mt-2 max-w-sm text-sm text-gray-500">
        Drop your first files to create an AI chatbot trained on your data.
      </p>
      <Link href="/dashboard/new" className="mt-6">
        <Button size="lg">
          <Plus className="h-4 w-4" />
          Create your first project
        </Button>
      </Link>
    </div>
  );
}
