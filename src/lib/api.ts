import { NextResponse } from "next/server";
import { hasAiGateway, hasBlob } from "@/lib/env";

export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export function checkAiConfig() {
  if (!hasAiGateway()) {
    return apiError(
      "AI_GATEWAY_API_KEY is not configured. Add it to enable AI features.",
      503,
    );
  }
  return null;
}

export function checkBlobConfig() {
  if (!hasBlob()) {
    return apiError(
      "BLOB_READ_WRITE_TOKEN is not configured. Add it to store images.",
      503,
    );
  }
  return null;
}

export function streamStatus(
  handler: (send: (status: string) => void) => Promise<unknown>,
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (status: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ status })}\n\n`),
        );
      };

      try {
        const result = await handler(send);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, result })}\n\n`),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "An unexpected error occurred";
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
