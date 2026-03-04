"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  FileText,
  FileSpreadsheet,
  File,
  Trash2,
  Plus,
  X,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Dropzone, type UploadFile } from "@/components/dropzone";
import { useToast } from "@/components/toast";

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

interface ProjectDataProps {
  projectId: string;
  initialSources: DataSourceItem[];
}

// ─── Helpers ────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
  if (type === "text/csv" || type === "text/tab-separated-values")
    return <FileSpreadsheet className="h-5 w-5 text-emerald-500" />;
  if (
    type ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return <FileText className="h-5 w-5 text-blue-500" />;
  return <File className="h-5 w-5 text-gray-400" />;
}

// ─── Component ──────────────────────────────────────────

export function ProjectData({ projectId, initialSources }: ProjectDataProps) {
  const [sources, setSources] = useState<DataSourceItem[]>(initialSources);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const { toast } = useToast();
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());
  const pollIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Cleanup SSE connections and poll intervals on unmount
  useEffect(() => {
    return () => {
      for (const es of eventSourcesRef.current.values()) {
        es.close();
      }
      for (const interval of pollIntervalsRef.current.values()) {
        clearInterval(interval);
      }
    };
  }, []);

  // Subscribe to status updates for a data source via SSE, with polling fallback
  const subscribeToStatus = useCallback(
    (sourceId: string) => {
      // Don't double-subscribe
      if (eventSourcesRef.current.has(sourceId) || pollIntervalsRef.current.has(sourceId)) {
        return;
      }

      const updateStatus = (status: string, chunkCount?: number, errorMessage?: string) => {
        // Update the upload file row in the modal
        setUploadFiles((prev) =>
          prev.map((f) =>
            f.id === sourceId
              ? {
                  ...f,
                  status: status as UploadFile["status"],
                  errorMessage: errorMessage || f.errorMessage,
                }
              : f
          )
        );
        // Update the source list
        setSources((prev) =>
          prev.map((s) =>
            s.id === sourceId
              ? {
                  ...s,
                  status,
                  chunkCount: chunkCount ?? s.chunkCount,
                  errorMessage: errorMessage ?? s.errorMessage ?? null,
                }
              : s
          )
        );
      };

      // Try SSE first
      try {
        const es = new EventSource(`/api/ingest/${sourceId}/status`);
        eventSourcesRef.current.set(sourceId, es);

        es.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            updateStatus(data.status, data.chunkCount, data.errorMessage);

            // Close on terminal states
            if (data.status === "INDEXED" || data.status === "ERROR") {
              es.close();
              eventSourcesRef.current.delete(sourceId);
            }
          } catch {
            // Ignore parse errors (e.g. keepalive comments)
          }
        };

        es.onerror = () => {
          // SSE failed — fall back to polling
          es.close();
          eventSourcesRef.current.delete(sourceId);
          startPolling(sourceId, updateStatus);
        };
      } catch {
        // EventSource constructor failed — fall back to polling
        startPolling(sourceId, updateStatus);
      }
    },
    []
  );

  // Polling fallback: fetch status every 2 seconds
  const startPolling = useCallback(
    (
      sourceId: string,
      updateStatus: (status: string, chunkCount?: number, errorMessage?: string) => void
    ) => {
      if (pollIntervalsRef.current.has(sourceId)) return;

      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/datasources?projectId=${projectId}`);
          if (!res.ok) return;
          const { dataSources } = await res.json();
          const ds = (dataSources as DataSourceItem[]).find((d) => d.id === sourceId);
          if (!ds) return;

          updateStatus(ds.status, ds.chunkCount, ds.errorMessage ?? undefined);

          if (ds.status === "INDEXED" || ds.status === "ERROR") {
            clearInterval(interval);
            pollIntervalsRef.current.delete(sourceId);
          }
        } catch {
          // Ignore fetch errors, keep polling
        }
      }, 2000);

      pollIntervalsRef.current.set(sourceId, interval);
    },
    [projectId]
  );

  // On mount, subscribe to any non-terminal sources
  useEffect(() => {
    for (const source of initialSources) {
      if (source.status !== "INDEXED" && source.status !== "ERROR") {
        subscribeToStatus(source.id);
      }
    }
  }, [initialSources, subscribeToStatus]);

  // ── Delete handler ──────────────────────────────────────
  const handleDelete = useCallback(async (sourceId: string) => {
    if (!confirm("Delete this data source? Its vectors will also be removed.")) {
      return;
    }

    setDeletingId(sourceId);

    try {
      const res = await fetch(`/api/ingest/${sourceId}`, { method: "DELETE" });
      if (res.ok) {
        setSources((prev) => prev.filter((s) => s.id !== sourceId));
        toast("Data source deleted.", "success");
      } else {
        const err = await res.json().catch(() => ({ error: "Delete failed" }));
        toast(err.error || "Failed to delete data source.", "error");
      }
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setDeletingId(null);
    }
  }, [toast]);

  // ── Upload handler (modal) ──────────────────────────────
  const handleFilesAccepted = useCallback(
    async (files: globalThis.File[]) => {
      const newUploads: UploadFile[] = files.map((f) => ({
        id: `temp-${Date.now()}-${f.name}`,
        name: f.name,
        size: f.size,
        type: f.type,
        status: "uploading" as const,
        file: f,
      }));

      setUploadFiles((prev) => [...prev, ...newUploads]);

      for (const uf of newUploads) {
        try {
          const formData = new FormData();
          formData.append("file", uf.file!);
          formData.append("projectId", projectId);

          const res = await fetch("/api/ingest", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: "Upload failed" }));
            setUploadFiles((prev) =>
              prev.map((f) =>
                f.id === uf.id
                  ? { ...f, status: "ERROR" as const, errorMessage: err.error }
                  : f
              )
            );
            continue;
          }

          const ds = await res.json();

          // Add to sources list
          setSources((prev) => [
            {
              id: ds.id,
              fileName: ds.fileName,
              fileType: ds.fileType,
              fileSize: ds.fileSize,
              chunkCount: 0,
              status: ds.status,
              errorMessage: null,
              createdAt: ds.createdAt,
            },
            ...prev,
          ]);

          // Update upload file state
          setUploadFiles((prev) =>
            prev.map((f) =>
              f.id === uf.id ? { ...f, id: ds.id, status: ds.status } : f
            )
          );

          // Subscribe to live status updates for this data source
          subscribeToStatus(ds.id);
        } catch {
          setUploadFiles((prev) =>
            prev.map((f) =>
              f.id === uf.id
                ? { ...f, status: "ERROR" as const, errorMessage: "Network error" }
                : f
            )
          );
        }
      }
    },
    [projectId, subscribeToStatus]
  );

  const handleRetry = useCallback(
    (file: UploadFile) => {
      if (file.file) {
        setUploadFiles((prev) => prev.filter((f) => f.id !== file.id));
        handleFilesAccepted([file.file]);
      }
    },
    [handleFilesAccepted]
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-gray-900">Data Sources</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            {sources.length} file{sources.length !== 1 ? "s" : ""} uploaded
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setShowModal(true)}>
          <Plus className="h-3.5 w-3.5" />
          Add files
        </Button>
      </div>

      {/* ── Source list ───────────────────────────────────── */}
      {sources.length === 0 ? (
        <div className="mt-8 flex flex-col items-center text-center">
          <File className="h-10 w-10 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">No data sources yet.</p>
          <Button
            variant="primary"
            size="sm"
            className="mt-3"
            onClick={() => setShowModal(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            Upload files
          </Button>
        </div>
      ) : (
        <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {sources.map((source) => (
            <div
              key={source.id}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
            >
              {/* Icon */}
              <div className="flex-shrink-0">{fileIcon(source.fileType)}</div>

              {/* Name + meta */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {source.fileName}
                </p>
                <p className="text-xs text-gray-500">
                  {formatFileSize(source.fileSize)}
                  {source.chunkCount > 0 && (
                    <span className="ml-2">
                      · {source.chunkCount} chunk
                      {source.chunkCount !== 1 ? "s" : ""}
                    </span>
                  )}
                </p>
                {source.errorMessage && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" />
                    {source.errorMessage}
                  </p>
                )}
              </div>

              {/* Status */}
              <StatusBadge status={source.status} />

              {/* Delete */}
              <button
                onClick={() => handleDelete(source.id)}
                disabled={deletingId === source.id}
                className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                title="Delete"
              >
                {deletingId === source.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Add files modal ──────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setShowModal(false);
              setUploadFiles([]);
            }}
          />

          {/* Modal */}
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Add more files
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setUploadFiles([]);
                }}
                className="rounded-md p-1 text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4">
              <Dropzone
                onFilesAccepted={handleFilesAccepted}
                uploadFiles={uploadFiles}
                onRetry={handleRetry}
              />
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setShowModal(false);
                  setUploadFiles([]);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
