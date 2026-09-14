import {
  deleteStyle,
  loadManifest,
  regenerateIfStale,
  toClient,
} from "@/lib/ai/styles";
import { apiError, checkBlobConfig } from "@/lib/api";
import { hasAiGateway } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const blobError = checkBlobConfig();
  if (blobError) return blobError;

  try {
    const { id } = await params;
    let manifest = await loadManifest(id);
    if (!manifest) {
      return apiError("Style not found", 404);
    }

    // Lazy safety net: derive a stale/missing profile when opened (only if AI is configured).
    if (hasAiGateway()) {
      manifest = await regenerateIfStale(manifest);
    }

    return Response.json({ style: toClient(manifest) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load style";
    return apiError(message);
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const blobError = checkBlobConfig();
  if (blobError) return blobError;

  try {
    const { id } = await params;
    await deleteStyle(id);
    return Response.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete style";
    return apiError(message);
  }
}
