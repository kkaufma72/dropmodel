"use client";

import { useEffect, useRef } from "react";

/**
 * Invisible component that auto-claims any demo project
 * linked to the visitor's cookie when they sign in.
 * Renders nothing — just fires the claim request once.
 */
export function DemoClaimAgent() {
  const claimed = useRef(false);

  useEffect(() => {
    if (claimed.current) return;
    claimed.current = true;

    // Check if the demo cookie exists (we can't read httpOnly cookies,
    // so just fire the claim request — it's a no-op if there's no cookie)
    fetch("/api/demo/claim", { method: "POST" })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          console.log("[demo] Claimed project:", data.projectId);
          // Reload to show the claimed project in the list
          window.location.reload();
        }
        // 404 = no demo project, which is the common case — ignore
      })
      .catch(() => {
        // Silently ignore claim errors
      });
  }, []);

  return null;
}
