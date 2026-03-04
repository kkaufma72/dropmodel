import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ingestEmitter, type IngestStatusEvent } from "@/lib/ingest-events";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sourceId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { sourceId } = await params;

  // Verify ownership
  const dataSource = await prisma.dataSource.findFirst({
    where: { id: sourceId, project: { userId: session.user.id } },
    select: { id: true, status: true, chunkCount: true, errorMessage: true },
  });

  if (!dataSource) {
    return new Response("Not found", { status: 404 });
  }

  // If already in a terminal state, send it immediately and close
  if (dataSource.status === "INDEXED" || dataSource.status === "ERROR") {
    const event: IngestStatusEvent = {
      dataSourceId: sourceId,
      status: dataSource.status,
      chunkCount: dataSource.chunkCount ?? undefined,
      errorMessage: dataSource.errorMessage ?? undefined,
    };

    const body = `data: ${JSON.stringify(event)}\n\n`;
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  // Stream live updates
  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send current status as the first event
      const initial: IngestStatusEvent = {
        dataSourceId: sourceId,
        status: dataSource.status as IngestStatusEvent["status"],
        chunkCount: dataSource.chunkCount ?? undefined,
      };
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(initial)}\n\n`)
      );

      // Listen for updates
      const handler = (event: IngestStatusEvent) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          );

          // Close after terminal states
          if (event.status === "INDEXED" || event.status === "ERROR") {
            closed = true;
            controller.close();
            ingestEmitter.removeListener(`status:${sourceId}`, handler);
          }
        } catch {
          // Stream already closed by client
          closed = true;
          ingestEmitter.removeListener(`status:${sourceId}`, handler);
        }
      };

      ingestEmitter.on(`status:${sourceId}`, handler);

      // Safety: close after 5 minutes to avoid leaked connections
      const timeout = setTimeout(() => {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
          ingestEmitter.removeListener(`status:${sourceId}`, handler);
        }
      }, 5 * 60 * 1000);

      // Cleanup when client disconnects
      controller.enqueue(encoder.encode(": keepalive\n\n"));

      // Store cleanup for cancel
      (stream as unknown as { _cleanup: () => void })._cleanup = () => {
        closed = true;
        clearTimeout(timeout);
        ingestEmitter.removeListener(`status:${sourceId}`, handler);
      };
    },
    cancel() {
      closed = true;
      // Trigger any stored cleanup
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
