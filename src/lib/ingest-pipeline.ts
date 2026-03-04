import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { prisma } from "@/lib/db";
import { openai } from "@/lib/openai";
import { getIndex } from "@/lib/pinecone";
import { downloadFile } from "@/lib/storage";
import { emitIngestStatus } from "@/lib/ingest-events";

const CHUNK_SIZE = 2000; // ~500 tokens (1 token ≈ 4 chars)
const CHUNK_OVERLAP = 200;
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_BATCH_SIZE = 100;

// ─── Main Pipeline ──────────────────────────────────────

export async function processDataSource(dataSourceId: string) {
  const dataSource = await prisma.dataSource.findUniqueOrThrow({
    where: { id: dataSourceId },
    include: { project: true },
  });

  const { project } = dataSource;

  try {
    // 1. PARSE
    console.log(`[ingest] Parsing ${dataSource.fileName} (${dataSource.fileType})`);
    await prisma.dataSource.update({
      where: { id: dataSourceId },
      data: { status: "PROCESSING" },
    });
    emitIngestStatus({ dataSourceId, status: "PROCESSING", message: "Extracting text…" });

    const fileBuffer = await downloadFile(dataSource.s3Key);
    const rawText = await extractText(fileBuffer, dataSource.fileType, dataSource.fileName);

    if (!rawText || rawText.trim().length === 0) {
      throw new Error("No text could be extracted from the file");
    }

    console.log(`[ingest] Extracted ${rawText.length} characters from ${dataSource.fileName}`);

    // 2. CHUNK
    const chunks = chunkText(rawText, dataSource.fileName);
    console.log(`[ingest] Split into ${chunks.length} chunks`);

    // 3. EMBED
    console.log(`[ingest] Embedding ${chunks.length} chunks...`);
    emitIngestStatus({ dataSourceId, status: "EMBEDDING", message: `Embedding ${chunks.length} chunks…`, chunkCount: chunks.length });
    const embeddings = await embedChunks(chunks);
    console.log(`[ingest] Generated ${embeddings.length} embeddings`);

    // 4. STORE in Pinecone
    console.log(`[ingest] Upserting to Pinecone (namespace: ${project.id})...`);
    emitIngestStatus({ dataSourceId, status: "INDEXING", message: "Storing vectors…" });
    await upsertToPinecone({
      dataSourceId,
      projectId: project.id,
      fileName: dataSource.fileName,
      chunks,
      embeddings,
    });

    // 5. FINALIZE
    await prisma.dataSource.update({
      where: { id: dataSourceId },
      data: { status: "INDEXED", chunkCount: chunks.length },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: { status: "READY" },
    });

    emitIngestStatus({ dataSourceId, status: "INDEXED", chunkCount: chunks.length });
    console.log(`[ingest] ✅ ${dataSource.fileName} indexed successfully (${chunks.length} chunks)`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[ingest] ❌ Failed to process ${dataSource.fileName}:`, message);

    await prisma.dataSource.update({
      where: { id: dataSourceId },
      data: { status: "ERROR", errorMessage: message },
    });

    await prisma.project.update({
      where: { id: project.id },
      data: { status: "ERROR" },
    });

    emitIngestStatus({ dataSourceId, status: "ERROR", errorMessage: message });
  }
}

// ─── Delete Vectors ─────────────────────────────────────

export async function deleteDataSourceVectors(
  dataSourceId: string,
  projectId: string
) {
  const index = getIndex();

  // List all vector IDs with this dataSource prefix
  const prefix = `${dataSourceId}-`;
  let paginationToken: string | undefined;

  const idsToDelete: string[] = [];

  do {
    const listResult = await index.listPaginated({
      prefix,
      namespace: projectId,
      paginationToken,
    });
    if (listResult.vectors) {
      idsToDelete.push(...listResult.vectors.map((v) => v.id).filter((id): id is string => !!id));
    }
    paginationToken = listResult.pagination?.next;
  } while (paginationToken);

  if (idsToDelete.length > 0) {
    // Delete in batches of 1000 (Pinecone limit)
    for (let i = 0; i < idsToDelete.length; i += 1000) {
      const batch = idsToDelete.slice(i, i + 1000);
      await index.deleteMany({ ids: batch, namespace: projectId });
    }
    console.log(`[ingest] Deleted ${idsToDelete.length} vectors for dataSource ${dataSourceId}`);
  }
}

// ─── Text Extraction ────────────────────────────────────

async function extractText(
  buffer: Buffer,
  fileType: string,
  fileName: string
): Promise<string> {
  if (buffer.length === 0) {
    throw new Error("File is empty (0 bytes)");
  }

  switch (fileType) {
    case "application/pdf": {
      try {
        const pdf = new PDFParse({ data: new Uint8Array(buffer) });
        const result = await pdf.getText();
        if (!result.text || result.text.trim().length === 0) {
          throw new Error("PDF appears to contain no extractable text (it may be a scanned image)");
        }
        return result.text;
      } catch (err) {
        if (err instanceof Error && err.message.includes("no extractable text")) {
          throw err;
        }
        throw new Error(`Failed to parse PDF "${fileName}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      try {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
      } catch (err) {
        throw new Error(`Failed to parse DOCX "${fileName}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    case "text/csv":
    case "text/tab-separated-values": {
      const text = buffer.toString("utf-8");
      return parseCsvToSentences(text, fileType === "text/tab-separated-values" ? "\t" : ",");
    }

    case "text/plain":
    case "text/markdown":
      return buffer.toString("utf-8");

    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }
}

function parseCsvToSentences(text: string, delimiter: string): string {
  const lines = text.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return text;

  const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ""));

  const sentences: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(delimiter).map((v) => v.trim().replace(/^"|"$/g, ""));
    const pairs = headers
      .map((header, idx) => {
        const val = values[idx];
        return val ? `${header} is ${val}` : null;
      })
      .filter(Boolean);

    if (pairs.length > 0) {
      sentences.push(`Row ${i}: ${pairs.join(", ")}.`);
    }
  }

  return sentences.join("\n");
}

// ─── Chunking ───────────────────────────────────────────

function chunkText(text: string, fileName: string): string[] {
  // First, try to split on paragraph boundaries
  const paragraphs = text.split(/\n\n+/);
  const rawChunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // If adding this paragraph exceeds chunk size, finalize current chunk
    if (currentChunk.length + paragraph.length > CHUNK_SIZE && currentChunk.length > 0) {
      rawChunks.push(currentChunk.trim());
      // Start new chunk with overlap from end of previous chunk
      const overlap = currentChunk.slice(-CHUNK_OVERLAP);
      currentChunk = overlap + paragraph;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    rawChunks.push(currentChunk.trim());
  }

  // If we only got one huge chunk, fall back to sentence-level splitting
  if (rawChunks.length === 1 && rawChunks[0].length > CHUNK_SIZE * 2) {
    return chunkBySentence(rawChunks[0], fileName);
  }

  // Prepend metadata to each chunk
  return rawChunks.map(
    (chunk, i) => `Source: ${fileName}, Chunk ${i + 1} of ${rawChunks.length}\n\n${chunk}`
  );
}

function chunkBySentence(text: string, fileName: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const sentence of sentences) {
    if (currentChunk.length + sentence.length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      const overlap = currentChunk.slice(-CHUNK_OVERLAP);
      currentChunk = overlap + sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.map(
    (chunk, i) => `Source: ${fileName}, Chunk ${i + 1} of ${chunks.length}\n\n${chunk}`
  );
}

// ─── Embedding ──────────────────────────────────────────

async function embedChunks(chunks: string[]): Promise<number[][]> {
  // Build batch descriptors
  const batches: { start: number; texts: string[] }[] = [];
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    batches.push({ start: i, texts: chunks.slice(i, i + EMBEDDING_BATCH_SIZE) });
  }

  // Run up to EMBED_CONCURRENCY batches in parallel
  const EMBED_CONCURRENCY = 5;
  const allEmbeddings: number[][] = new Array(chunks.length);

  for (let i = 0; i < batches.length; i += EMBED_CONCURRENCY) {
    const window = batches.slice(i, i + EMBED_CONCURRENCY);

    const results = await Promise.all(
      window.map(async (batch) => {
        const response = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: batch.texts,
        });
        return {
          start: batch.start,
          embeddings: response.data
            .sort((a, b) => a.index - b.index)
            .map((item) => item.embedding),
        };
      })
    );

    for (const result of results) {
      for (let j = 0; j < result.embeddings.length; j++) {
        allEmbeddings[result.start + j] = result.embeddings[j];
      }
    }
  }

  return allEmbeddings;
}

// ─── Pinecone Upsert ────────────────────────────────────

async function upsertToPinecone({
  dataSourceId,
  projectId,
  fileName,
  chunks,
  embeddings,
}: {
  dataSourceId: string;
  projectId: string;
  fileName: string;
  chunks: string[];
  embeddings: number[][];
}) {
  const index = getIndex();

  // Upsert in batches of 100
  for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
    const records = chunks.slice(i, i + EMBEDDING_BATCH_SIZE).map((chunk, j) => ({
      id: `${dataSourceId}-${i + j}`,
      values: embeddings[i + j],
      metadata: {
        projectId,
        dataSourceId,
        chunkIndex: i + j,
        text: chunk.slice(0, 40000), // Pinecone metadata limit ~40KB
        fileName,
      },
    }));

    await index.upsert({ records, namespace: projectId });
  }
}
