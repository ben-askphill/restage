import type { StyleForClient, StyleSummary } from "@/lib/ai/schemas";

async function parseJson<T>(response: Response, fallback: string): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? fallback);
  }
  return data as T;
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
