import { EventEmitter } from "events";

// ── Status types ────────────────────────────────────────

export interface IngestStatusEvent {
  dataSourceId: string;
  status: "UPLOADING" | "PROCESSING" | "EMBEDDING" | "INDEXING" | "INDEXED" | "ERROR";
  message?: string;
  chunkCount?: number;
  errorMessage?: string;
}

// ── Global singleton emitter ────────────────────────────

// In Next.js dev mode, hot-reload creates new module instances.
// Attach to globalThis so the same emitter survives HMR.
const globalForEvents = globalThis as unknown as {
  __ingestEmitter?: EventEmitter;
};

if (!globalForEvents.__ingestEmitter) {
  globalForEvents.__ingestEmitter = new EventEmitter();
  globalForEvents.__ingestEmitter.setMaxListeners(200);
}

export const ingestEmitter = globalForEvents.__ingestEmitter;

// ── Helpers ─────────────────────────────────────────────

export function emitIngestStatus(event: IngestStatusEvent) {
  ingestEmitter.emit(`status:${event.dataSourceId}`, event);
}
