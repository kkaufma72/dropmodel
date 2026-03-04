import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { ingestEmitter, type IngestStatusEvent } from "@/lib/ingest-events";

export const dynamic = "force-dynamic";

const DEMO_COOKIE = "dm_demo_token";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ dataSourceId: string }> }
) {
  const { dataSourceId } = await params;
  const cookieStore = await cookies();
  const demoToken = cookieStore.get(DEMO_COOKIE)?.value;

  if (!demoToken) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Verify this data source belongs to the demo project
  const dataSource = await prisma.dataSource.findFirst({
    where: { id: dataSourceId, project: { demoToken } },
    select: { id: true, status: true, chunkCount: true, errorMessage: true },
  });

  if (!dataSource) {
    return new Response("Not found", { status: 404 });
  }

  // If already in a terminal state, send it immediately
  if (dataSource.status === "INDEXED" || dataSource.status === "ERROR") {
    const event: IngestStatusEvent = {
      dataSourceId,
      status: dataSource.status,
      chunkCount: dataSource.chunkCount ?? undefined,
      errorMessage: dataSource.errorMessage ?? undefined,
    };
    return new Response(`data: ${JSON.stringify(event)}\n\n`, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  // Stream live updates
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      const initial: IngestStatusEvent = {
        dataSourceId,
        status: dataSource.status as IngestStatusEvent["status"],
        chunkCount: dataSource.chunkCount ?? undefined,
      };
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initial)}\n\n`));

      const handler = (event: IngestStatusEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          if (event.status === "INDEXED" || event.status === "ERROR") {
            closed = true;
            controller.close();
            ingestEmitter.removeListener(`status:${dataSourceId}`, handler);
          }
        } catch {
          closed = true;
          ingestEmitter.removeListener(`status:${dataSourceId}`, handler);
        }
      };

      ingestEmitter.on(`status:${dataSourceId}`, handler);

      // Safety timeout
      const timeout = setTimeout(() => {
        if (!closed) {
          closed = true;
          try { controller.close(); } catch { /* already closed */ }
          ingestEmitter.removeListener(`status:${dataSourceId}`, handler);
        }
      }, 3 * 60 * 1000);

      // Cleanup
      (stream as unknown as { _cleanup: () => void })._cleanup = () => {
        closed = true;
        clearTimeout(timeout);
        ingestEmitter.removeListener(`status:${dataSourceId}`, handler);
      };
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
