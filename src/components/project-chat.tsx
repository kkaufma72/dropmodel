"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";
import { Send, Loader2, Lock, Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";

// ─── Types ──────────────────────────────────────────────

interface Message {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
}

interface ProjectChatProps {
  projectId: string;
  projectStatus: string;
}

// ─── Simple Markdown Renderer ───────────────────────────

function renderMarkdown(text: string): string {
  let html = text
    // Escape HTML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks: ```...```
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    '<pre class="my-2 rounded-lg bg-gray-900 p-3 text-sm text-gray-100 overflow-x-auto"><code>$2</code></pre>',
  );

  // Inline code: `...`
  html = html.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-gray-100 px-1.5 py-0.5 text-sm text-violet-700">$1</code>',
  );

  // Bold: **...**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic: *...*
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Unordered list items: - item or * item
  html = html.replace(/^[\-\*] (.+)$/gm, '<li class="ml-4 list-disc">$1</li>');

  // Ordered list items: 1. item
  html = html.replace(
    /^\d+\. (.+)$/gm,
    '<li class="ml-4 list-decimal">$1</li>',
  );

  // Wrap consecutive <li> in <ul>
  html = html.replace(
    /((?:<li[^>]*>.*<\/li>\n?)+)/g,
    '<ul class="my-1 space-y-0.5">$1</ul>',
  );

  // Paragraphs — split by double newlines
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim();
      if (
        !trimmed ||
        trimmed.startsWith("<pre") ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("<ol")
      ) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");

  return html;
}

// ─── SSE Stream Reader ─────────────────────────────────

async function readSSEStream(
  response: Response,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
) {
  const reader = response.body?.getReader();
  if (!reader) {
    onError("No response body");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split("\n");
      // Keep the last potentially incomplete line in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6); // Remove "data: "

        if (data === "[DONE]") {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            onError(parsed.error);
            return;
          }
          if (parsed.content) {
            onToken(parsed.content);
          }
        } catch {
          // Not valid JSON, skip
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data: ")) {
        const data = trimmed.slice(6);
        if (data !== "[DONE]") {
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              onToken(parsed.content);
            }
          } catch {
            // ignore
          }
        }
      }
    }

    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : "Stream read failed");
  }
}

// ─── Component ──────────────────────────────────────────

export function ProjectChat({ projectId, projectStatus }: ProjectChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState("");
  const [isSavingCorrection, setIsSavingCorrection] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Focus input on mount
  useEffect(() => {
    if (projectStatus === "READY") {
      inputRef.current?.focus();
    }
  }, [projectStatus]);

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || isLoading) return;

      // Abort any previous stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMsg: Message = {
        id: `user-${Date.now()}`,
        role: "USER",
        content: text,
      };

      const assistantId = `asst-${Date.now()}`;

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            projectId,
            sessionId,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          const errorMsg: Message = {
            id: `err-${Date.now()}`,
            role: "ASSISTANT",
            content: `⚠️ ${err.error || "Something went wrong."}`,
          };
          setMessages((prev) => [...prev, errorMsg]);
          return;
        }

        // Capture session ID from header
        const newSessionId = res.headers.get("x-session-id");
        if (newSessionId) {
          setSessionId(newSessionId);
        }

        // Add empty assistant message to fill with streaming tokens
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "ASSISTANT", content: "" },
        ]);

        // Read SSE stream
        await readSSEStream(
          res,
          // onToken — append each delta to the assistant message
          (token) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + token }
                  : m,
              ),
            );
          },
          // onDone
          () => {},
          // onError
          (error) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content:
                        m.content || `⚠️ ${error || "Something went wrong, try again."}`,
                    }
                  : m,
              ),
            );
          },
        );
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        const errorMsg: Message = {
          id: `err-${Date.now()}`,
          role: "ASSISTANT",
          content: "⚠️ Something went wrong, try again.",
        };
        setMessages((prev) => [...prev, errorMsg]);
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    },
    [input, isLoading, projectId, sessionId],
  );

  const handleEditResponse = useCallback(
    (msgId: string, content: string) => {
      setEditingId(msgId);
      setCorrectionText(content);
    },
    [],
  );

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setCorrectionText("");
  }, []);

  const handleSaveCorrection = useCallback(
    async (msgId: string) => {
      if (!correctionText.trim() || isSavingCorrection) return;

      // Find the user message that preceded this assistant message
      const msgIndex = messages.findIndex((m) => m.id === msgId);
      const assistantMsg = messages[msgIndex];
      let userQuestion = "";
      for (let i = msgIndex - 1; i >= 0; i--) {
        if (messages[i].role === "USER") {
          userQuestion = messages[i].content;
          break;
        }
      }

      if (!userQuestion) {
        toast("Could not find the original question", "error");
        return;
      }

      setIsSavingCorrection(true);
      try {
        const res = await fetch("/api/corrections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            originalQuestion: userQuestion,
            originalAnswer: assistantMsg.content,
            correctedAnswer: correctionText.trim(),
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed" }));
          throw new Error(err.error);
        }

        // Update the message in the UI
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msgId ? { ...m, content: correctionText.trim() } : m,
          ),
        );
        toast("Correction saved & trained!", "success");
        setEditingId(null);
        setCorrectionText("");
      } catch (err) {
        toast(
          err instanceof Error ? err.message : "Failed to save correction",
          "error",
        );
      } finally {
        setIsSavingCorrection(false);
      }
    },
    [correctionText, isSavingCorrection, messages, projectId, toast],
  );

  // ── Processing overlay ──────────────────────────────────
  if (projectStatus !== "READY") {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50">
          <Loader2 className="h-7 w-7 animate-spin text-amber-500" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          Still processing your data…
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Your chatbot will be ready once all files are indexed.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Messages ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-50">
              <Lock className="h-5 w-5 text-violet-500" />
            </div>
            <p className="mt-3 text-sm font-medium text-gray-900">
              Ask anything about your data
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Your AI assistant has been trained on your uploaded files.
            </p>
          </div>
        )}

        <div className="mx-auto max-w-2xl space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "USER" ? "justify-end" : "justify-start"}`}
            >
              <div className={`group relative max-w-[80%]`}>
                {editingId === msg.id ? (
                  <div className="rounded-2xl border-2 border-violet-300 bg-gray-50 p-3">
                    <textarea
                      value={correctionText}
                      onChange={(e) => setCorrectionText(e.target.value)}
                      className="w-full min-h-[100px] rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 resize-y"
                      placeholder="Enter corrected response..."
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        onClick={handleCancelEdit}
                        disabled={isSavingCorrection}
                        className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveCorrection(msg.id)}
                        disabled={isSavingCorrection || !correctionText.trim()}
                        className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                      >
                        {isSavingCorrection ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Save Correction
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div
                      className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                        msg.role === "USER"
                          ? "bg-violet-600 text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}
                    >
                      {msg.role === "ASSISTANT" ? (
                        <div
                          className="prose-sm [&_pre]:my-2 [&_code]:text-xs"
                          dangerouslySetInnerHTML={{
                            __html: renderMarkdown(msg.content),
                          }}
                        />
                      ) : (
                        <p>{msg.content}</p>
                      )}
                      {/* Blinking cursor while streaming */}
                      {isLoading &&
                        msg.role === "ASSISTANT" &&
                        msg.id === messages[messages.length - 1]?.id && (
                          <span className="inline-block w-2 h-4 ml-0.5 bg-violet-500 animate-pulse rounded-sm align-text-bottom" />
                        )}
                    </div>
                    {msg.role === "ASSISTANT" && !isLoading && (
                      <button
                        onClick={() => handleEditResponse(msg.id, msg.content)}
                        className="absolute -bottom-1 right-2 translate-y-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs text-gray-500 shadow-sm border border-gray-200 hover:text-violet-600 hover:border-violet-300"
                        title="Edit response to train the model"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}

          {/* Typing indicator — show only while waiting for first token */}
          {isLoading &&
            (messages.length === 0 ||
              messages[messages.length - 1]?.role === "USER") && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-gray-100 px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Input bar ──────────────────────────────────── */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-2xl items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question…"
            disabled={isLoading}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:bg-gray-50"
          />
          <Button
            type="submit"
            disabled={!input.trim() || isLoading}
            size="md"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
