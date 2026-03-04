"use client";

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  type FormEvent,
} from "react";
import {
  UploadCloud,
  Send,
  Loader2,
  CheckCircle2,
  X,
  Sparkles,
  ArrowRight,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────

type DemoPhase = "idle" | "uploading" | "processing" | "ready" | "signup";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const STATUS_LABELS: Record<string, string> = {
  UPLOADING: "Uploading file…",
  PROCESSING: "Extracting text…",
  EMBEDDING: "Creating embeddings…",
  INDEXING: "Building search index…",
  INDEXED: "Ready!",
  ERROR: "Something went wrong",
};

// ─── Component ──────────────────────────────────────────

export function HeroDemo() {
  const [phase, setPhase] = useState<DemoPhase>("idle");
  const [statusLabel, setStatusLabel] = useState("");
  const [fileName, setFileName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [messageCount, setMessageCount] = useState(0);
  const [showSignup, setShowSignup] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  // Focus input when ready
  useEffect(() => {
    if (phase === "ready") inputRef.current?.focus();
  }, [phase]);

  // ── File upload handler ───────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      setError("Demo files are limited to 2 MB. Sign up for more!");
      return;
    }

    setError("");
    setFileName(file.name);
    setPhase("uploading");
    setStatusLabel("Uploading…");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/demo/ingest", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        setError(err.error || "Upload failed");
        setPhase("idle");
        return;
      }

      const data = await res.json();
      setApiKey(data.apiKey);
      setPhase("processing");
      setStatusLabel("Processing…");

      // Subscribe to SSE for status updates
      const es = new EventSource(`/api/demo/status/${data.dataSourceId}`);

      es.onmessage = (event) => {
        try {
          const status = JSON.parse(event.data);
          setStatusLabel(STATUS_LABELS[status.status] || status.status);

          if (status.status === "INDEXED") {
            es.close();
            setPhase("ready");
          } else if (status.status === "ERROR") {
            es.close();
            setError(status.errorMessage || "Processing failed");
            setPhase("idle");
          }
        } catch {
          // ignore
        }
      };

      es.onerror = () => {
        if (es.readyState === EventSource.CLOSED) {
          // Connection closed normally
        }
      };
    } catch {
      setError("Network error. Please try again.");
      setPhase("idle");
    }
  }, []);

  // ── Drop handler ──────────────────────────────────────
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  }, []);

  // ── Chat handler ──────────────────────────────────────
  const handleSend = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || isStreaming || !apiKey) return;

      // Check message count BEFORE adding this one
      const newCount = messageCount + 1;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsStreaming(true);
      setMessageCount(newCount);

      try {
        const res = await fetch("/api/v1/chat", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: text }),
        });

        if (!res.ok) {
          const err = await res
            .json()
            .catch(() => ({ error: "Request failed" }));
          setMessages((prev) => [
            ...prev,
            {
              id: `e-${Date.now()}`,
              role: "assistant",
              content: `⚠️ ${err.error || "Something went wrong."}`,
            },
          ]);
          setIsStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error("No stream");

        const decoder = new TextDecoder();
        const assistantId = `a-${Date.now()}`;
        let accumulated = "";

        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "" },
        ]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          accumulated += decoder.decode(value, { stream: true });
          const snapshot = accumulated;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: snapshot } : m
            )
          );
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            content: "⚠️ Network error.",
          },
        ]);
      } finally {
        setIsStreaming(false);
      }

      // After 3rd message, show signup modal
      if (newCount >= 3) {
        setTimeout(() => setShowSignup(true), 1500);
      }
    },
    [input, isStreaming, apiKey, messageCount]
  );

  // ── Render: Idle / Dropzone ───────────────────────────
  if (phase === "idle") {
    return (
      <div className="relative mx-auto mt-16 max-w-3xl">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`group cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300 ${
            dragActive
              ? "border-indigo-500 bg-indigo-50/80 scale-[1.02] shadow-xl shadow-indigo-200/50"
              : "border-gray-300/80 bg-white/60 backdrop-blur-sm hover:border-indigo-400 hover:bg-indigo-50/30 hover:shadow-lg"
          }`}
        >
          <div className="flex flex-col items-center gap-4 px-8 py-16 text-center sm:py-20">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300 ${
                dragActive
                  ? "bg-indigo-200 scale-110"
                  : "bg-gray-100 group-hover:bg-indigo-100"
              }`}
            >
              <UploadCloud
                className={`h-8 w-8 transition-colors duration-300 ${
                  dragActive
                    ? "text-indigo-600"
                    : "text-gray-400 group-hover:text-indigo-500"
                }`}
              />
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-700">
                {dragActive ? "Drop it!" : "Try it now — drop a file here"}
              </p>
              <p className="mt-1 text-sm text-gray-400">
                PDF, TXT, CSV, DOCX, or MD — up to 2 MB • No signup needed
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.txt,.csv,.md,.docx,.tsv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>

        {error && (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm text-red-600">
            <X className="h-4 w-4" />
            {error}
          </div>
        )}

        <div className="pointer-events-none absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 blur-2xl" />
      </div>
    );
  }

  // ── Render: Processing ────────────────────────────────
  if (phase === "uploading" || phase === "processing") {
    return (
      <div className="relative mx-auto mt-16 max-w-3xl">
        <div className="rounded-2xl border border-gray-200 bg-white p-px shadow-2xl">
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl bg-white py-20">
            <div className="relative">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-gray-900">{fileName}</p>
              <p className="mt-1 text-sm text-indigo-600 font-medium">
                {statusLabel}
              </p>
            </div>
          </div>
        </div>
        <div className="pointer-events-none absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 blur-2xl" />
      </div>
    );
  }

  // ── Render: Chat (ready / signup) ─────────────────────
  return (
    <div className="relative mx-auto mt-16 max-w-3xl">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {/* Chat header */}
        <div className="flex items-center gap-2 border-b border-gray-100 bg-indigo-600 px-4 py-3 text-white">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-semibold truncate">
            Chat with {fileName}
          </span>
          <CheckCircle2 className="ml-auto h-4 w-4 text-emerald-300" />
          <span className="text-xs text-indigo-200">Live</span>
        </div>

        {/* Messages */}
        <div className="h-72 overflow-y-auto px-4 py-4 sm:h-80">
          {messages.length === 0 && (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-gray-400">
                Ask anything about your document…
              </p>
            </div>
          )}

          <div className="flex flex-col gap-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "rounded-br-md bg-indigo-600 text-white"
                      : "rounded-bl-md bg-gray-100 text-gray-800"
                  }`}
                >
                  {msg.content || (
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  )}
                </div>
              </div>
            ))}

            {isStreaming &&
              messages[messages.length - 1]?.role !== "assistant" && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md bg-gray-100 px-4 py-2.5">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                  </div>
                </div>
              )}
          </div>

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 px-4 py-3">
          <form onSubmit={handleSend} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question…"
              disabled={isStreaming || showSignup}
              className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!input.trim() || isStreaming || showSignup}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white transition-colors hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <p className="mt-2 text-center text-xs text-gray-400">
            {messageCount >= 3
              ? "Demo limit reached"
              : `${3 - messageCount} free message${3 - messageCount !== 1 ? "s" : ""} remaining`}
          </p>
        </div>
      </div>

      {/* ── Signup Modal Overlay ──────────────────────────── */}
      {showSignup && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/80 backdrop-blur-sm">
          <div className="mx-4 max-w-sm rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100">
              <Sparkles className="h-7 w-7 text-indigo-600" />
            </div>
            <h3 className="mt-4 text-xl font-bold text-gray-900">
              Your AI is working!
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-500">
              Sign up to keep it, deploy it, and share it.
              <br />
              Your data is already indexed — nothing to redo.
            </p>
            <a
              href="/login"
              className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all hover:bg-indigo-700"
            >
              Sign up free
              <ArrowRight className="h-4 w-4" />
            </a>
            <button
              onClick={() => setShowSignup(false)}
              className="mt-3 text-xs text-gray-400 transition-colors hover:text-gray-600"
            >
              Keep chatting (limited)
            </button>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 blur-2xl" />
    </div>
  );
}
