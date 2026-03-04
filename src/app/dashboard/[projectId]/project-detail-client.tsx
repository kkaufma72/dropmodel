"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  MessageSquare,
  Database,
  Settings,
  Code2,
  BarChart3,
  Pencil,
  Sparkles,
} from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { ProjectChat } from "@/components/project-chat";
import { ProjectData } from "@/components/project-data";
import { ProjectSettings } from "@/components/project-settings";
import { ProjectDeploy } from "@/components/project-deploy";
import { ProjectAnalytics } from "@/components/project-analytics";

// ─── Types ──────────────────────────────────────────────

interface DataSourceItem {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  chunkCount: number;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
}

interface ProjectConfigData {
  useCase: string;
  useCaseCustom: string | null;
  companyName: string | null;
  industry: string | null;
  tone: string;
  failureBehavior: string;
  contactInfo: string | null;
  collectFields: string[];
  restrictions: string | null;
  customRules: string | null;
  language: string;
  responseLength: string;
  generatedPrompt: string | null;
  promptVersion: number;
}

interface SerializedProject {
  id: string;
  name: string;
  status: string;
  apiKey: string;
  queryCount: number;
  queryLimit: number;
  modelConfig: Record<string, unknown>;
  customization: Record<string, unknown>;
  messageCount: number;
  correctionCount: number;
  createdAt: string;
  dataSources: DataSourceItem[];
  config: ProjectConfigData | null;
}

type Tab = "chat" | "data" | "settings" | "deploy" | "analytics";

const TABS: { key: Tab; label: string; icon: typeof MessageSquare }[] = [
  { key: "chat", label: "Chat", icon: MessageSquare },
  { key: "data", label: "Data", icon: Database },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "deploy", label: "Deploy", icon: Code2 },
  { key: "analytics", label: "Analytics", icon: BarChart3 },
];

// ─── Component ──────────────────────────────────────────

export function ProjectDetailClient({
  project,
}: {
  project: SerializedProject;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [name, setName] = useState(project.name);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus the name input when editing starts
  useEffect(() => {
    if (isEditing) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditing]);

  const saveName = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === project.name) {
      setName(project.name);
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (res.ok) {
        project.name = trimmed;
      } else {
        setName(project.name);
      }
    } catch {
      setName(project.name);
    } finally {
      setIsSaving(false);
      setIsEditing(false);
    }
  }, [name, project]);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col lg:h-[calc(100vh-2rem)]">
      {/* ── Top bar ──────────────────────────────────────── */}
      <div className="flex items-center gap-3 border-b border-gray-200 pb-4">
        <button
          onClick={() => router.push("/dashboard")}
          className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          title="Back to dashboard"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {/* Editable name */}
        {isEditing ? (
          <div className="flex items-center gap-2">
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setName(project.name);
                  setIsEditing(false);
                }
              }}
              onBlur={saveName}
              disabled={isSaving}
              className="rounded-md border border-gray-300 px-2 py-1 text-lg font-semibold text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
            />
            <button
              onClick={saveName}
              className="rounded-md p-1 text-violet-600 hover:bg-violet-50"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditing(true)}
            className="group flex items-center gap-2"
          >
            <h1 className="text-lg font-semibold text-gray-900">{name}</h1>
            <Pencil className="h-3.5 w-3.5 text-gray-400 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        )}

        <StatusBadge status={project.status} />

        {project.correctionCount > 0 && (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
            <Sparkles className="h-3 w-3" />
            Trained on {project.correctionCount} correction{project.correctionCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* ── Tab navigation ───────────────────────────────── */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6" aria-label="Tabs">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 border-b-2 px-1 pb-3 pt-3 text-sm font-medium transition-colors ${
                activeTab === key
                  ? "border-violet-600 text-violet-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Tab content ──────────────────────────────────── */}
      <div className="min-h-0 flex-1">
        {activeTab === "chat" && (
          <ProjectChat
            projectId={project.id}
            projectStatus={project.status}
          />
        )}

        {activeTab === "data" && (
          <div className="overflow-y-auto p-4">
            <ProjectData
              projectId={project.id}
              initialSources={project.dataSources}
            />
          </div>
        )}

        {activeTab === "settings" && (
          <ProjectSettings
            projectId={project.id}
            initialModelConfig={project.modelConfig}
            initialCustomization={project.customization}
            initialConfig={project.config}
          />
        )}

        {activeTab === "deploy" && (
          <ProjectDeploy
            projectId={project.id}
            apiKey={project.apiKey}
          />
        )}

        {activeTab === "analytics" && (
          <ProjectAnalytics projectId={project.id} />
        )}
      </div>
    </div>
  );
}
