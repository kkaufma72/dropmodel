"use client";

import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  File,
  CheckCircle2,
  AlertCircle,
  RotateCw,
  Loader2,
} from "lucide-react";

const ACCEPTED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
  "text/markdown": [".md"],
  "text/tab-separated-values": [".tsv"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
};

const MAX_SIZE = 50 * 1024 * 1024;

interface UploadFile {
  id: string;
  name: string;
  size: number;
  type: string;
  status: "uploading" | "UPLOADING" | "PROCESSING" | "EMBEDDING" | "INDEXING" | "INDEXED" | "ERROR";
  errorMessage?: string;
  file?: globalThis.File;
}

interface DropzoneProps {
  onFilesAccepted: (files: globalThis.File[]) => void;
  uploadFiles: UploadFile[];
  onRetry: (file: UploadFile) => void;
  disabled?: boolean;
}

export function Dropzone({
  onFilesAccepted,
  uploadFiles,
  onRetry,
  disabled,
}: DropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: globalThis.File[]) => {
      if (acceptedFiles.length > 0) {
        onFilesAccepted(acceptedFiles);
      }
    },
    [onFilesAccepted]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    disabled,
    multiple: true,
  });

  const hasFiles = uploadFiles.length > 0;

  return (
    <div className="space-y-4">
      {/* Dropzone area */}
      <div
        {...getRootProps()}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 ${
          hasFiles ? "min-h-[200px]" : "min-h-[400px]"
        } ${
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-60"
            : isDragActive
              ? "border-violet-500 bg-violet-50/50 scale-[1.01] shadow-lg shadow-violet-100"
              : "border-gray-300 bg-white hover:border-violet-400 hover:bg-violet-50/30"
        }`}
      >
        <input {...getInputProps()} />

        {/* Animated background pulse on drag */}
        {isDragActive && (
          <div className="absolute inset-0 animate-pulse rounded-2xl bg-violet-100/40" />
        )}

        <div className="relative z-10 flex flex-col items-center gap-4 px-6 text-center">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300 ${
              isDragActive
                ? "bg-violet-200 scale-110"
                : "bg-gray-100"
            }`}
          >
            <UploadCloud
              className={`h-8 w-8 transition-colors duration-300 ${
                isDragActive ? "text-violet-600" : "text-gray-400"
              }`}
            />
          </div>
          <div>
            <p
              className={`text-base font-medium transition-colors ${
                isDragActive ? "text-violet-700" : "text-gray-700"
              }`}
            >
              {isDragActive
                ? "Drop your files here..."
                : "Drag & drop your files here"}
            </p>
            <p className="mt-1 text-sm text-gray-500">or click to browse</p>
          </div>
          <p className="text-xs text-gray-400">
            PDF, DOCX, CSV, TSV, TXT, MD — up to 50MB each
          </p>
        </div>
      </div>

      {/* File list */}
      {hasFiles && (
        <div className="space-y-2">
          {uploadFiles.map((file) => (
            <FileRow key={file.id} file={file} onRetry={onRetry} />
          ))}
        </div>
      )}
    </div>
  );
}

function FileRow({
  file,
  onRetry,
}: {
  file: UploadFile;
  onRetry: (f: UploadFile) => void;
}) {
  const status = file.status;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      {/* File icon */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50">
        <FileIcon type={file.type} />
      </div>

      {/* Name + size */}
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{file.name}</p>
        <p className="text-xs text-gray-400">{formatSize(file.size)}</p>
      </div>

      {/* Status */}
      <div className="flex shrink-0 items-center gap-2">
        {(status === "uploading" || status === "UPLOADING") && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-xs font-medium text-blue-600">Uploading</span>
          </>
        )}
        {status === "PROCESSING" && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
            <span className="text-xs font-medium text-amber-600">
              Extracting text
            </span>
          </>
        )}
        {status === "EMBEDDING" && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-violet-500" />
            <span className="text-xs font-medium text-violet-600">
              Embedding
            </span>
          </>
        )}
        {status === "INDEXING" && (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-cyan-500" />
            <span className="text-xs font-medium text-cyan-600">
              Indexing
            </span>
          </>
        )}
        {status === "INDEXED" && (
          <>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-600">Indexed</span>
          </>
        )}
        {status === "ERROR" && (
          <>
            <AlertCircle className="h-4 w-4 text-red-500" />
            <span
              className="text-xs font-medium text-red-600 max-w-[120px] truncate"
              title={file.errorMessage}
            >
              {file.errorMessage || "Error"}
            </span>
            <button
              onClick={() => onRetry(file)}
              className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Retry"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function FileIcon({ type }: { type: string }) {
  if (type === "application/pdf") {
    return <FileText className="h-4 w-4 text-red-500" />;
  }
  if (type === "text/csv" || type === "text/tab-separated-values") {
    return <FileSpreadsheet className="h-4 w-4 text-emerald-500" />;
  }
  if (
    type ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return <FileText className="h-4 w-4 text-blue-500" />;
  }
  return <File className="h-4 w-4 text-gray-400" />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type { UploadFile };
