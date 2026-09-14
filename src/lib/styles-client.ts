import type { StyleForClient, StyleSummary } from "@/lib/ai/schemas";
import { callApi, parseApiError } from "@/lib/client-api";
import { prepareImageForUpload } from "@/lib/prepare-image";

/** Stay under Vercel’s ~4.5MB serverless request body after JPEG compression. */
const MAX_BATCH_BYTES = 3.5 * 1024 * 1024;

async function parseJson<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(parseApiError(response.status, text, fallback));
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      response.ok ? fallback : parseApiError(response.status, text, fallback),
    );
  }
}

function batchFiles(files: File[]): File[][] {
  const batches: File[][] = [];
  let current: File[] = [];
  let bytes = 0;

  for (const file of files) {
    if (current.length > 0 && bytes + file.size > MAX_BATCH_BYTES) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(file);
    bytes += file.size;
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches;
}

/** GET /api/styles → summaries for the grid. */
export async function fetchStyleSummaries(): Promise<StyleSummary[]> {
  const response = await fetch("/api/styles");
  const data = await parseJson<{ styles: StyleSummary[] }>(
    response,
    "Failed to load styles",
  );
  return data.styles;
}

/** GET /api/styles/[id] → a full style (lazily regenerates a stale profile). */
export async function fetchStyle(id: string): Promise<StyleForClient> {
  const response = await fetch(`/api/styles/${id}`);
  const data = await parseJson<{ style: StyleForClient }>(
    response,
    "Failed to load style",
  );
  return data.style;
}

/** DELETE /api/styles/[id]. */
export async function deleteStyle(id: string): Promise<void> {
  const response = await fetch(`/api/styles/${id}`, { method: "DELETE" });
  await parseJson<{ ok: boolean }>(response, "Failed to delete style");
}

export type StyleImageUploadResult = {
  style: StyleForClient;
  warning?: string;
};

/** Resize/compress photos, then POST them as multipart files. */
export async function uploadStyleImages(
  id: string,
  files: File[],
  onStatus?: (status: string) => void,
): Promise<StyleImageUploadResult> {
  if (files.length === 0) {
    throw new Error("At least one image is required");
  }

  onStatus?.("Preparing images…");
  const prepared = await Promise.all(files.map(prepareImageForUpload));
  const batches = batchFiles(prepared);

  let last: StyleImageUploadResult | undefined;
  for (const [index, batch] of batches.entries()) {
    if (batches.length > 1) {
      onStatus?.(
        `Uploading images (${index + 1} of ${batches.length})…`,
      );
    }
    const form = new FormData();
    for (const file of batch) {
      form.append("images", file);
    }
    last = await callApi<StyleImageUploadResult>(
      `/api/styles/${id}/images`,
      form,
      onStatus,
    );
  }

  if (!last) {
    throw new Error("No images were uploaded");
  }
  return last;
}
