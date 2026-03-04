import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import path from "path";

// ─── Config ─────────────────────────────────────────────

const BUCKET = "datasources";

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const ALLOWED_TYPES = [
  "application/pdf",
  "text/csv",
  "text/plain",
  "text/markdown",
  "text/tab-separated-values",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

// ─── Supabase client (lazy singleton) ───────────────────

let _supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables"
    );
  }

  _supabase = createClient(url, key);
  return _supabase;
}

// ─── Upload ─────────────────────────────────────────────

export async function uploadFile(
  file: Buffer,
  fileName: string
): Promise<string> {
  const ext = path.extname(fileName);
  const key = `${uuidv4()}${ext}`;

  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(key, file, {
      contentType: guessMimeType(ext),
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase Storage upload failed: ${error.message}`);
  }

  return key;
}

// ─── Download ───────────────────────────────────────────

export async function downloadFile(key: string): Promise<Buffer> {
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(key);

  if (error || !data) {
    throw new Error(
      `Supabase Storage download failed: ${error?.message ?? "No data returned"}`
    );
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── Delete ─────────────────────────────────────────────

export async function deleteFile(key: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([key]);

  if (error) {
    // Log but don't throw — the file might already be gone
    console.error(`[storage] Failed to delete ${key}:`, error.message);
  }
}

// ─── Helpers ────────────────────────────────────────────

function guessMimeType(ext: string): string {
  const map: Record<string, string> = {
    ".pdf": "application/pdf",
    ".csv": "text/csv",
    ".tsv": "text/tab-separated-values",
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}

/**
 * @deprecated Use downloadFile() instead. Kept temporarily for migration.
 */
export function getFilePath(key: string): string {
  throw new Error(
    `getFilePath() is no longer supported. Files are stored in Supabase Storage. Use downloadFile("${key}") instead.`
  );
}
