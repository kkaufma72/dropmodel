"use client";

import { useState, useCallback } from "react";
import { Eye, EyeOff, RefreshCw, Terminal, Code2, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/copy-button";
import { useToast } from "@/components/toast";

// ─── Types ──────────────────────────────────────────────

interface ProjectDeployProps {
  projectId: string;
  apiKey: string;
}

// ─── Component ──────────────────────────────────────────

export function ProjectDeploy({ projectId, apiKey }: ProjectDeployProps) {
  const [key, setKey] = useState(apiKey);
  const [showKey, setShowKey] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const { toast } = useToast();

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://yourdomain.com";

  const maskedKey = key.slice(0, 8) + "••••••••••••••••" + key.slice(-4);

  const curlExample = `curl -X POST ${baseUrl}/api/v1/chat \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"message": "What is your return policy?"}'`;

  const embedSnippet = `<script src="${baseUrl}/api/v1/embed/${projectId}.js"></script>`;

  const npmExample = `const response = await fetch("${baseUrl}/api/v1/chat", {
  method: "POST",
  headers: {
    "Authorization": "Bearer ${key}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    message: "What is your return policy?",
  }),
});

const data = await response.json();
console.log(data.response);`;

  const handleRegenerate = useCallback(async () => {
    if (
      !confirm(
        "Regenerate your API key? The old key will stop working immediately."
      )
    ) {
      return;
    }

    setIsRegenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: crypto.randomUUID() }),
      });

      if (res.ok) {
        const data = await res.json();
        setKey(data.apiKey);
        setShowKey(true);
        toast("API key regenerated successfully.", "success");
      } else {
        toast("Failed to regenerate API key.", "error");
      }
    } catch {
      toast("Network error. Please try again.", "error");
    } finally {
      setIsRegenerating(false);
    }
  }, [projectId]);

  return (
    <div className="mx-auto max-w-2xl space-y-8 overflow-y-auto p-4">
      {/* ── API Endpoint ───────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">API Endpoint</h3>
        </div>

        <div className="mt-3 space-y-3">
          {/* Endpoint URL */}
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-mono font-semibold text-emerald-700">
              POST
            </span>
            <code className="flex-1 text-sm text-gray-700">
              {baseUrl}/api/v1/chat
            </code>
            <CopyButton text={`${baseUrl}/api/v1/chat`} />
          </div>

          {/* API Key */}
          <div>
            <label className="block text-xs font-medium text-gray-500">
              API Key
            </label>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
              <code className="flex-1 truncate text-sm text-gray-700 font-mono">
                {showKey ? key : maskedKey}
              </code>
              <button
                onClick={() => setShowKey(!showKey)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title={showKey ? "Hide" : "Show"}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
              <CopyButton text={key} />
            </div>
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={handleRegenerate}
            disabled={isRegenerating}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isRegenerating ? "animate-spin" : ""}`}
            />
            {isRegenerating ? "Regenerating…" : "Regenerate Key"}
          </Button>
        </div>
      </section>

      {/* ── cURL Example ───────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">cURL Example</h3>
        </div>
        <CodeBlock code={curlExample} />
      </section>

      {/* ── Embed ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Embed on Your Website
          </h3>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Add this script tag to your HTML to embed the chatbot widget.
        </p>
        <CodeBlock code={embedSnippet} />
      </section>

      {/* ── npm / fetch ────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">npm Package</h3>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Use the API directly from your JavaScript or TypeScript application.
        </p>
        <CodeBlock code={npmExample} />
      </section>
    </div>
  );
}

// ─── Reusable Code Block ────────────────────────────────

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative mt-2 rounded-lg border border-gray-200 bg-gray-900">
      <div className="absolute right-2 top-2">
        <CopyButton
          text={code}
          className="text-gray-400 hover:bg-gray-800 hover:text-gray-200"
        />
      </div>
      <pre className="overflow-x-auto p-4 pr-10 text-sm leading-relaxed text-gray-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}
