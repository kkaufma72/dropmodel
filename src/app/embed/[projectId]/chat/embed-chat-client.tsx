"use client";

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type FormEvent,
} from "react";

// ─── Types ──────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface EmbedChatClientProps {
  projectId: string;
  projectName: string;
  projectStatus: string;
  apiKey: string;
  accentColor: string;
  welcomeMessage: string;
}

// ─── Simple Markdown ────────────────────────────────────

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks
  html = html.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    '<pre style="background:#1f2937;color:#f3f4f6;padding:12px;border-radius:8px;overflow-x:auto;font-size:13px;margin:8px 0"><code>$2</code></pre>',
  );

  // Inline code
  html = html.replace(
    /`([^`]+)`/g,
    '<code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:13px">$1</code>',
  );

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // List items
  html = html.replace(
    /^[\-\*] (.+)$/gm,
    '<li style="margin-left:16px;list-style:disc">$1</li>',
  );
  html = html.replace(
    /^\d+\. (.+)$/gm,
    '<li style="margin-left:16px;list-style:decimal">$1</li>',
  );

  // Wrap consecutive <li> in <ul>
  html = html.replace(
    /((?:<li[^>]*>.*<\/li>\n?)+)/g,
    '<ul style="margin:4px 0">$1</ul>',
  );

  // Paragraphs
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
      return `<p style="margin:4px 0">${trimmed.replace(/\n/g, "<br/>")}</p>`;
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

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const data = trimmed.slice(6);

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
          // skip
        }
      }
    }

    // Process remaining buffer
    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data: ")) {
        const data = trimmed.slice(6);
        if (data !== "[DONE]") {
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) onToken(parsed.content);
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

export function EmbedChatClient({
  projectId,
  projectName,
  projectStatus,
  apiKey,
  accentColor,
  welcomeMessage,
}: EmbedChatClientProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  useEffect(() => {
    if (projectStatus === "READY") {
      inputRef.current?.focus();
    }
  }, [projectStatus]);

  // Notify parent to close
  const handleClose = useCallback(() => {
    window.parent.postMessage(
      { type: "dropmodel", action: "close" },
      "*",
    );
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || isLoading) return;

      const userMsg: Message = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
      };

      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setIsLoading(true);

      try {
        const res = await fetch("/api/v1/chat", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: text,
            sessionId: sessionId ?? undefined,
          }),
        });

        // Grab session ID from header
        const newSessionId = res.headers.get("x-session-id");
        if (newSessionId) setSessionId(newSessionId);

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Request failed" }));
          setMessages((prev) => [
            ...prev,
            {
              id: `e-${Date.now()}`,
              role: "assistant",
              content: `⚠️ ${err.error || "Something went wrong."}`,
            },
          ]);
          return;
        }

        // Stream the SSE response
        const assistantId = `a-${Date.now()}`;

        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "" },
        ]);

        await readSSEStream(
          res,
          (token) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: m.content + token }
                  : m,
              ),
            );
          },
          () => {},
          (error) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content:
                        m.content || `⚠️ ${error || "Something went wrong."}`,
                    }
                  : m,
              ),
            );
          },
        );
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            content: "⚠️ Something went wrong, try again.",
          },
        ]);
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    },
    [input, isLoading, apiKey, sessionId],
  );

  const isReady = projectStatus === "READY";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: "#111827",
        background: "#ffffff",
      }}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          background: accentColor,
          color: "#ffffff",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span
            style={{
              fontWeight: 600,
              fontSize: "14px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "260px",
            }}
          >
            {projectName}
          </span>
        </div>
        <button
          onClick={handleClose}
          style={{
            background: "none",
            border: "none",
            color: "#ffffff",
            cursor: "pointer",
            padding: "4px",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.8,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
          aria-label="Minimize"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        </button>
      </div>

      {/* ── Messages area ──────────────────────────────── */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {/* Not ready overlay */}
        {!isReady && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              textAlign: "center",
              padding: "24px",
            }}
          >
            <div
              style={{
                width: "40px",
                height: "40px",
                border: `3px solid ${accentColor}20`,
                borderTopColor: accentColor,
                borderRadius: "50%",
                animation: "dm-spin 0.8s linear infinite",
              }}
            />
            <style>{`@keyframes dm-spin{to{transform:rotate(360deg)}}`}</style>
            <p
              style={{
                marginTop: "16px",
                fontSize: "14px",
                color: "#6b7280",
                fontWeight: 500,
              }}
            >
              Still processing your data…
            </p>
          </div>
        )}

        {/* Welcome message */}
        {isReady && messages.length === 0 && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius: "16px 16px 16px 4px",
                background: "#f3f4f6",
                fontSize: "14px",
                lineHeight: "1.5",
              }}
            >
              {welcomeMessage}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: "flex",
              justifyContent:
                msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "85%",
                padding: "10px 14px",
                borderRadius:
                  msg.role === "user"
                    ? "16px 16px 4px 16px"
                    : "16px 16px 16px 4px",
                background: msg.role === "user" ? accentColor : "#f3f4f6",
                color: msg.role === "user" ? "#ffffff" : "#111827",
                fontSize: "14px",
                lineHeight: "1.5",
                wordBreak: "break-word",
              }}
            >
              {msg.role === "assistant" ? (
                <>
                  <div
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(msg.content),
                    }}
                  />
                  {/* Blinking cursor while streaming */}
                  {isLoading &&
                    msg.id === messages[messages.length - 1]?.id && (
                      <span
                        style={{
                          display: "inline-block",
                          width: "8px",
                          height: "16px",
                          marginLeft: "2px",
                          background: accentColor,
                          borderRadius: "2px",
                          verticalAlign: "text-bottom",
                          animation: "dm-blink 1s step-end infinite",
                        }}
                      />
                    )}
                </>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator — show only while waiting for first token */}
        {isLoading &&
          (messages.length === 0 ||
            messages[messages.length - 1]?.role === "user") && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: "16px 16px 16px 4px",
                  background: "#f3f4f6",
                  display: "flex",
                  gap: "4px",
                  alignItems: "center",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: "7px",
                      height: "7px",
                      borderRadius: "50%",
                      background: "#9ca3af",
                      display: "inline-block",
                      animation: `dm-bounce 1.2s ease-in-out ${i * 0.15}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ──────────────────────────────────────── */}
      <div
        style={{
          borderTop: "1px solid #e5e7eb",
          padding: "12px 16px",
          flexShrink: 0,
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", gap: "8px", alignItems: "center" }}
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isReady ? "Type a message…" : "Processing…"}
            disabled={!isReady || isLoading}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: "24px",
              border: "1px solid #d1d5db",
              fontSize: "14px",
              outline: "none",
              background: isReady ? "#ffffff" : "#f9fafb",
              color: "#111827",
              transition: "border-color 0.15s",
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = accentColor)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#d1d5db")}
          />
          <button
            type="submit"
            disabled={!input.trim() || !isReady || isLoading}
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              border: "none",
              background:
                !input.trim() || !isReady || isLoading
                  ? "#e5e7eb"
                  : accentColor,
              color: "#ffffff",
              cursor:
                !input.trim() || !isReady || isLoading
                  ? "not-allowed"
                  : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              transition: "background 0.15s",
            }}
            aria-label="Send"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
      </div>

      {/* ── Footer ─────────────────────────────────────── */}
      <div
        style={{
          textAlign: "center",
          padding: "6px 0 10px",
          flexShrink: 0,
        }}
      >
        <a
          href={`https://dropmodel.com?ref=${projectId}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: "11px",
            color: "#9ca3af",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#6b7280")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#9ca3af")}
        >
          Powered by DropModel
        </a>
      </div>

      {/* ── Animations ─────────────────────────────────── */}
      <style>{`
        @keyframes dm-spin { to { transform: rotate(360deg) } }
        @keyframes dm-bounce { 0%,80%,100% { transform: translateY(0) } 40% { transform: translateY(-6px) } }
        @keyframes dm-blink { 50% { opacity: 0 } }
      `}</style>
    </div>
  );
}
