export const dynamic = "force-dynamic";

import { addSseListener } from "@/lib/bus";

export async function GET(req: Request) {
  const roomId = new URL(req.url).searchParams.get("room") ?? "default";
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("retry: 2000\n\n"));
      const push = (data: unknown) => {
        const tagged = data as { roomId?: unknown; msg?: unknown };
        if (tagged.roomId !== roomId) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(tagged.msg)}\n\n`));
        } catch {
          /* stream already closed */
        }
      };
      const unsubscribe = addSseListener(push);
      req.signal.addEventListener("abort", () => {
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
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
