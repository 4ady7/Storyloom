import { humanizeError } from "./humanize";
import { ProjectNotFound } from "./store";

export function jsonError(error: unknown): Response {
  const status = error instanceof ProjectNotFound ? 404 : error instanceof Error && error.message.startsWith("storyloom:") ? 400 : 500;
  if (!(error instanceof Error && error.message.startsWith("storyloom:"))) {
    console.error(error);
  }
  return Response.json({ error: humanizeError(error) }, { status });
}

export function ndjson(run: (send: (event: Record<string, unknown>) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      try {
        await run(send);
      } catch (error) {
        if (!(error instanceof Error && error.message.startsWith("storyloom:"))) console.error(error);
        send({ type: "error", message: humanizeError(error) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
