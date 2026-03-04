"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import {
  ArrowRight,
  CheckCircle2,
  Link2,
  Plus,
  Sparkles,
  TestTubes,
  Settings2,
  Upload,
  MessageSquare,
  Check,
} from "lucide-react";
import { Dropzone, type UploadFile } from "@/components/dropzone";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";
import { OnboardingQuestionnaire } from "@/components/onboarding-questionnaire";
import type { QuestionnaireAnswers } from "@/types/onboarding";

type Phase = "questionnaire" | "idle" | "uploading" | "ready";

// ── Step indicator component ────────────────────────────

const STEPS = [
  { key: "questionnaire", label: "Configure", icon: Settings2 },
  { key: "upload", label: "Upload Data", icon: Upload },
  { key: "chat", label: "Chat", icon: MessageSquare },
] as const;

function StepIndicator({ currentPhase }: { currentPhase: Phase }) {
  const stepIndex =
    currentPhase === "questionnaire"
      ? 0
      : currentPhase === "ready"
        ? 2
        : 1;

  return (
    <nav className="mb-8 flex items-center justify-center gap-2">
      {STEPS.map((step, i) => {
        const isCompleted = i < stepIndex;
        const isCurrent = i === stepIndex;
        const Icon = isCompleted ? Check : step.icon;

        return (
          <div key={step.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-px w-8 transition-colors sm:w-12 ${
                  i <= stepIndex ? "bg-violet-400" : "bg-gray-200"
                }`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                  isCompleted
                    ? "bg-violet-600 text-white"
                    : isCurrent
                      ? "bg-violet-100 text-violet-700 ring-2 ring-violet-600"
                      : "bg-gray-100 text-gray-400"
                }`}
              >
                <Icon className="h-3 w-3" />
              </div>
              <span
                className={`hidden text-xs font-medium sm:inline ${
                  isCurrent
                    ? "text-violet-700"
                    : isCompleted
                      ? "text-violet-600"
                      : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

// ── Sample documents for instant demo ───────────────────
const SAMPLE_DOCS: Array<{ name: string; content: string }> = [
  {
    name: "FAQ.txt",
    content: `Frequently Asked Questions

Q: What is DropModel?
A: DropModel is a SaaS platform that lets you create custom AI chatbots trained on your own documents. Upload PDFs, CSVs, text files, or paste a URL and get an embeddable chatbot in minutes.

Q: What file types are supported?
A: We support PDF, CSV, TXT, Markdown, TSV, and DOCX files up to 50 MB each.

Q: How does the AI answer questions?
A: When a user asks a question, we search your uploaded documents for the most relevant passages, then use GPT to generate an accurate answer grounded in your data.

Q: Can I embed the chatbot on my website?
A: Yes! Each project comes with an embed snippet you can copy and paste into any website. The chatbot appears as a floating widget in the bottom-right corner.

Q: Is there a free plan?
A: Yes. The free plan includes 1 project, 10 MB of storage, and 100 queries per day. Upgrade to Pro or Team for more capacity.

Q: How do I delete my data?
A: Go to your project settings and click "Delete Project." This permanently removes all uploaded files, embeddings, and chat history.`,
  },
  {
    name: "Product-Description.txt",
    content: `DropModel Pro — Product Description

DropModel Pro is our most popular plan for professionals and small teams who need a powerful, customizable AI assistant.

Key Features:
- Upload up to 500 MB of documents across 10 projects
- Support for PDF, DOCX, CSV, TXT, Markdown, and TSV files
- 1,000 queries per day per project
- Custom branding — change chatbot colors and welcome messages
- Embed on unlimited websites with a single code snippet
- Priority processing for faster document indexing
- Full analytics dashboard with query logs and usage stats

Pricing:
$29/month billed monthly, or $24/month billed annually (save 17%).

Technical Specifications:
- Embedding model: text-embedding-3-small (1536 dimensions)
- Chat model: GPT-4o-mini for fast, accurate responses
- Vector database: Pinecone for sub-100ms semantic search
- 99.9% uptime SLA for Pro and Team plans

Getting Started:
1. Create a new project from the dashboard
2. Upload your files or paste URLs
3. Wait for indexing to complete (usually under 60 seconds)
4. Copy the embed code and paste it into your website
5. Your visitors can now chat with your AI assistant`,
  },
  {
    name: "Return-Policy.txt",
    content: `DropModel Return & Refund Policy

Last updated: January 15, 2026

Subscription Cancellation:
You may cancel your subscription at any time from your account settings. When you cancel, you will retain access to paid features until the end of your current billing period. No partial refunds are issued for unused time within a billing cycle.

Refund Eligibility:
- If you are charged after cancellation due to a billing error, we will issue a full refund within 5 business days.
- If you experience a service outage lasting more than 24 consecutive hours, you are eligible for a prorated credit.
- Refunds are not available for annual plans after the first 14 days.

14-Day Money-Back Guarantee:
New subscribers to any paid plan (Pro or Team) are covered by a 14-day money-back guarantee. If you're not satisfied, contact support@dropmodel.com within 14 days of your first payment for a full refund.

Plan Downgrades:
When downgrading from a paid plan to the free plan, any projects or storage exceeding free-tier limits will be archived. You will have 30 days to export your data before archived projects are permanently deleted.

How to Request a Refund:
Email support@dropmodel.com with your account email and reason for the refund. We aim to respond within 1 business day.

Contact:
Email: support@dropmodel.com
Hours: Monday–Friday, 9 AM – 6 PM EST`,
  },
];

export default function NewProjectPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [projectName, setProjectName] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [phase, setPhase] = useState<Phase>("questionnaire");
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const projectIdRef = useRef<string | null>(null);
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());

  // Keep ref in sync
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  // Cleanup all EventSources on unmount
  useEffect(() => {
    return () => {
      eventSourcesRef.current.forEach((es) => es.close());
      eventSourcesRef.current.clear();
    };
  }, []);

  // ── Subscribe to SSE for a single data source ────────
  const subscribeToStatus = useCallback(
    (dataSourceId: string) => {
      // Don't double-subscribe
      if (eventSourcesRef.current.has(dataSourceId)) return;

      const es = new EventSource(
        `/api/ingest/${dataSourceId}/status`
      );

      eventSourcesRef.current.set(dataSourceId, es);

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            dataSourceId: string;
            status: UploadFile["status"];
            chunkCount?: number;
            errorMessage?: string;
          };

          setFiles((prev) =>
            prev.map((f) =>
              f.id === data.dataSourceId
                ? {
                    ...f,
                    status: data.status,
                    errorMessage: data.errorMessage ?? f.errorMessage,
                  }
                : f
            )
          );

          // Terminal states — close the connection
          if (data.status === "INDEXED" || data.status === "ERROR") {
            es.close();
            eventSourcesRef.current.delete(dataSourceId);

            // Check if all files are done
            setFiles((current) => {
              const allDone = current.every(
                (f) => f.status === "INDEXED" || f.status === "ERROR"
              );
              if (allDone && current.some((f) => f.status === "INDEXED")) {
                // Use setTimeout to avoid state update during render
                setTimeout(() => setPhase("ready"), 0);
              }
              return current;
            });
          }
        } catch {
          // Ignore malformed events
        }
      };

      es.onerror = () => {
        // EventSource will auto-reconnect on transient errors.
        // If the connection is permanently broken, close it.
        if (es.readyState === EventSource.CLOSED) {
          eventSourcesRef.current.delete(dataSourceId);
        }
      };
    },
    []
  );

  // ── Create project if needed ──────────────────────────
  const ensureProject = useCallback(async (): Promise<string> => {
    if (projectIdRef.current) return projectIdRef.current;

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: projectName.trim() || "Untitled Project" }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Failed to create project" }));
      throw new Error(body.error || "Failed to create project");
    }
    const project = await res.json();
    setProjectId(project.id);
    projectIdRef.current = project.id;
    return project.id;
  }, [projectName]);

  // ── Handle file drops ─────────────────────────────────
  const handleFilesAccepted = useCallback(
    async (acceptedFiles: File[]) => {
      setPhase("uploading");

      let pid: string;
      try {
        pid = await ensureProject();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to create project", "error");
        setPhase("idle");
        return;
      }

      // Add files to state with uploading status
      const newFiles: UploadFile[] = acceptedFiles.map((file) => ({
        id: uuidv4(),
        name: file.name,
        size: file.size,
        type: file.type,
        status: "uploading" as const,
        file,
      }));

      setFiles((prev) => [...prev, ...newFiles]);

      // Upload all files in parallel
      await Promise.all(
        newFiles.map(async (uf) => {
          try {
            const formData = new FormData();
            formData.append("file", uf.file!);
            formData.append("projectId", pid);

            const res = await fetch("/api/ingest", {
              method: "POST",
              body: formData,
            });

            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: "Upload failed" }));
              setFiles((prev) =>
                prev.map((f) =>
                  f.id === uf.id
                    ? { ...f, status: "ERROR" as const, errorMessage: err.error }
                    : f
                )
              );
              return;
            }

            const dataSource = await res.json();

            // Replace temp ID with real DataSource ID and subscribe to SSE
            setFiles((prev) =>
              prev.map((f) =>
                f.id === uf.id
                  ? { ...f, id: dataSource.id, status: dataSource.status }
                  : f
              )
            );

            // Subscribe to live status updates for this data source
            subscribeToStatus(dataSource.id);
          } catch {
            setFiles((prev) =>
              prev.map((f) =>
              f.id === uf.id
                ? { ...f, status: "ERROR" as const, errorMessage: "Network error" }
                : f
            )
          );
        }
      })
      );
    },
    [ensureProject, subscribeToStatus]
  );

  // ── Handle URL import ─────────────────────────────────
  const handleUrlImport = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) return;

    setUrlLoading(true);
    setPhase("uploading");

    try {
      let pid: string;
      try {
        pid = await ensureProject();
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to create project", "error");
        setPhase("idle");
        setUrlLoading(false);
        return;
      }

      const tempId = uuidv4();
      setFiles((prev) => [
        ...prev,
        {
          id: tempId,
          name: url,
          size: 0,
          type: "text/plain",
          status: "uploading" as const,
        },
      ]);

      const res = await fetch("/api/ingest/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, projectId: pid }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Import failed" }));
        setFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? { ...f, status: "ERROR" as const, errorMessage: err.error }
              : f
          )
        );
      } else {
        const dataSource = await res.json();
        setFiles((prev) =>
          prev.map((f) =>
            f.id === tempId
              ? {
                  ...f,
                  id: dataSource.id,
                  name: dataSource.fileName,
                  size: dataSource.fileSize,
                  status: dataSource.status,
                }
              : f
          )
        );

        // Subscribe to live status updates
        subscribeToStatus(dataSource.id);
      }

      setUrlInput("");
    } catch {
      // handled above
    } finally {
      setUrlLoading(false);
    }
  }, [urlInput, ensureProject, subscribeToStatus]);

  // ── Retry handler ─────────────────────────────────────
  const handleRetry = useCallback(
    (file: UploadFile) => {
      if (file.file) {
        // Re-upload the original file
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
        handleFilesAccepted([file.file]);
      }
    },
    [handleFilesAccepted]
  );

  // ── Sample data handler ───────────────────────────────
  const [sampleLoading, setSampleLoading] = useState(false);

  const handleSampleData = useCallback(async () => {
    setSampleLoading(true);
    if (!projectName.trim()) {
      setProjectName("Sample Demo Project");
    }

    const sampleFiles = SAMPLE_DOCS.map(
      (doc) =>
        new File([doc.content], doc.name, { type: "text/plain" })
    );

    await handleFilesAccepted(sampleFiles);
    setSampleLoading(false);
  }, [projectName, handleFilesAccepted]);

  // ── Handle questionnaire completion ───────────────────
  const handleQuestionnaireComplete = useCallback(
    async (data: {
      answers: QuestionnaireAnswers;
      generatedPrompt: string;
      projectName: string;
    }) => {
      const name = data.projectName || "Untitled Project";
      setProjectName(name);

      // Create the project with config in one API call
      try {
        const res = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, config: data.answers }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: "Failed to create project" }));
          toast(body.error || "Failed to create project", "error");
          return;
        }

        const project = await res.json();
        setProjectId(project.id);
        projectIdRef.current = project.id;
        setPhase("idle");
        toast("Project created! Now upload your data.", "success");
      } catch {
        toast("Network error creating project.", "error");
      }
    },
    [toast]
  );

  // ── Questionnaire phase ───────────────────────────────
  if (phase === "questionnaire") {
    return (
      <div className="mx-auto max-w-3xl">
        <StepIndicator currentPhase={phase} />
        <OnboardingQuestionnaire onComplete={handleQuestionnaireComplete} />
      </div>
    );
  }

  // ── Ready state ───────────────────────────────────────
  if (phase === "ready" && projectId) {
    return (
      <div className="mx-auto max-w-2xl">
        <StepIndicator currentPhase={phase} />
        <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
        <div className="relative">
          <div className="absolute -inset-4 animate-ping rounded-full bg-emerald-100 opacity-30" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
        </div>

        <div className="mt-8 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" />
          <h2 className="text-2xl font-semibold text-gray-900">
            Your AI is ready!
          </h2>
          <Sparkles className="h-5 w-5 text-amber-500" />
        </div>

        <p className="mt-3 max-w-md text-sm text-gray-500">
          Your knowledge base has been indexed. You can now start chatting with
          your data or embed the chatbot on your website.
        </p>

        <Button
          size="lg"
          className="mt-8"
          onClick={() => router.push(`/dashboard/${projectId}`)}
        >
          Start chatting
          <ArrowRight className="h-4 w-4" />
        </Button>

        <button
          onClick={() => {
            setPhase("uploading");
          }}
          className="mt-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          + Add more files
        </button>
      </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────
  return (
    <div className="mx-auto max-w-2xl">
      <StepIndicator currentPhase={phase} />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          {projectId ? "Upload your data" : "Create a new project"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {projectId
            ? `Add files to train "${projectName}" on your data.`
            : "Upload your files and we'll build a custom AI chatbot from your data."}
        </p>
      </div>

      {/* Project name */}
      <div className="mt-6">
        <label
          htmlFor="projectName"
          className="block text-sm font-medium text-gray-700"
        >
          Project name
        </label>
        <input
          id="projectName"
          type="text"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          placeholder="Untitled Project"
          disabled={!!projectId}
          className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:bg-gray-50 disabled:text-gray-500"
        />
      </div>

      {/* Dropzone */}
      <div className="mt-6">
        <Dropzone
          onFilesAccepted={handleFilesAccepted}
          uploadFiles={files}
          onRetry={handleRetry}
        />
      </div>

      {/* URL import */}
      <div className="mt-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleUrlImport();
              }}
              placeholder="Paste a URL to import"
              disabled={urlLoading}
              className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:bg-gray-50"
            />
          </div>
          <Button
            variant="secondary"
            onClick={handleUrlImport}
            disabled={!urlInput.trim() || urlLoading}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      {/* Sample data shortcut */}
      {files.length === 0 && (
        <div className="mt-6">
          <div className="relative flex items-center">
            <div className="flex-grow border-t border-gray-200" />
            <span className="mx-3 flex-shrink-0 text-xs text-gray-400">
              or try it out instantly
            </span>
            <div className="flex-grow border-t border-gray-200" />
          </div>
          <button
            onClick={handleSampleData}
            disabled={sampleLoading}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-violet-300 bg-violet-50/50 px-4 py-3 text-sm font-medium text-violet-700 transition-colors hover:border-violet-400 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <TestTubes className="h-4 w-4" />
            {sampleLoading ? "Loading sample data…" : "Test with sample data"}
          </button>
          <p className="mt-1.5 text-center text-xs text-gray-400">
            Loads a sample FAQ, product description, and return policy
          </p>
        </div>
      )}

      {/* Indexing progress indicator */}
      {phase === "uploading" && files.length > 0 && (
        <div className="mt-6 rounded-xl border border-violet-100 bg-violet-50/50 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-violet-500" />
            <p className="text-sm font-medium text-violet-700">
              {getProgressText(files)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function getProgressText(files: UploadFile[]): string {
  const total = files.length;
  const indexed = files.filter((f) => f.status === "INDEXED").length;
  const embedding = files.filter((f) => f.status === "EMBEDDING").length;
  const indexing = files.filter((f) => f.status === "INDEXING").length;
  const processing = files.filter(
    (f) =>
      f.status === "PROCESSING" ||
      f.status === "UPLOADING" ||
      f.status === "uploading"
  ).length;
  const errors = files.filter((f) => f.status === "ERROR").length;
  const inProgress = processing + embedding + indexing;

  if (embedding > 0) {
    return `Embedding chunks… ${indexed} of ${total} files indexed`;
  }
  if (indexing > 0) {
    return `Storing vectors… ${indexed} of ${total} files indexed`;
  }
  if (inProgress > 0) {
    return `Processing your files… ${indexed} of ${total} indexed`;
  }
  if (errors > 0 && indexed > 0) {
    return `${indexed} indexed, ${errors} failed`;
  }
  return `${indexed} of ${total} files indexed`;
}
