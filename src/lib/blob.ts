import { del, get, list, put } from "@vercel/blob";
import { hasBlob } from "@/lib/env";

/** Private Blob prefixes the `/api/blob` proxy may serve. Style photos live under `uploads/style/`. */
const ALLOWED_PREFIXES = ["renders/", "uploads/"] as const;

export function styleManifestPath(id: string): string {
  return `styles/${id}/style.json`;
}

export function styleImagePrefix(id: string): string {
  return `uploads/style/${id}/`;
}

export function isAllowedBlobPathname(pathname: string): boolean {
  const normalized = pathname.replace(/^\//, "");
  if (!normalized || normalized.includes("..")) {
    return false;
  }
  return ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function blobDisplayUrl(pathname: string): string {
  return `/api/blob?pathname=${encodeURIComponent(pathname)}`;
}

export function extractBlobPathname(url: string): string | null {
  try {
    const parsed = new URL(url, "http://localhost");
    if (parsed.pathname === "/api/blob") {
      return parsed.searchParams.get("pathname");
    }
    if (parsed.hostname.endsWith(".blob.vercel-storage.com")) {
      const pathname = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
      return pathname || null;
    }
  } catch {
    return null;
  }
  return null;
}

function assertBlobConfigured() {
  if (!hasBlob()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not configured. Add it to your environment to store images.",
    );
  }
}

async function putRaw(
  pathname: string,
  data: string | Uint8Array,
  contentType: string,
): Promise<string> {
  assertBlobConfigured();
  const body = typeof data === "string" ? data : Buffer.from(data);
  const blob = await put(pathname, body, {
    access: "private",
    contentType,
    addRandomSuffix: false,
  });
  return blob.pathname;
}

async function putPrivateBlob(
  pathname: string,
  data: Uint8Array,
  contentType: string,
): Promise<string> {
  const stored = await putRaw(pathname, data, contentType);
  return blobDisplayUrl(stored);
}

export async function putJsonBlob<T>(
  pathname: string,
  value: T,
): Promise<void> {
  await putRaw(pathname, JSON.stringify(value), "application/json");
}

export async function getJsonBlob<T>(pathname: string): Promise<T | null> {
  assertBlobConfigured();
  try {
    const result = await get(pathname.replace(/^\//, ""), {
      access: "private",
      useCache: false,
    });
    if (result?.statusCode !== 200) {
      return null;
    }
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function listByPrefix(
  prefix: string,
): Promise<{ pathname: string }[]> {
  assertBlobConfigured();
  const { blobs } = await list({ prefix });
  return blobs.map((blob) => ({ pathname: blob.pathname }));
}

export async function deleteBlobs(pathnames: string[]): Promise<void> {
  if (pathnames.length === 0) return;
  assertBlobConfigured();
  await del(pathnames);
}

export async function uploadRender(
  data: Uint8Array,
  contentType: string,
): Promise<string> {
  const extension = contentType.split("/")[1] ?? "png";
  const filename = `renders/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  return putPrivateBlob(filename, data, contentType);
}

export async function uploadUpload(
  data: Uint8Array,
  contentType: string,
  prefix: "room" | "style" | "floorplan",
): Promise<string> {
  const extension = contentType.split("/")[1] ?? "jpg";
  const filename = `uploads/${prefix}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  return putPrivateBlob(filename, data, contentType);
}

export async function uploadStyleImage(
  styleId: string,
  data: Uint8Array,
  contentType: string,
): Promise<{ pathname: string; contentType: string }> {
  const extension = contentType.split("/")[1] ?? "jpg";
  const filename = `${styleImagePrefix(styleId)}${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const pathname = await putRaw(filename, data, contentType);
  return { pathname, contentType };
}

export async function downloadPrivateBlob(urlOrPathname: string): Promise<{
  data: Uint8Array;
  mediaType: string;
}> {
  if (!hasBlob()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not configured. Add it to your environment to read images.",
    );
  }

  const result = await get(urlOrPathname.replace(/^\//, ""), {
    access: "private",
    useCache: false,
  });

  if (result?.statusCode !== 200) {
    throw new Error("Failed to fetch image: blob not found");
  }

  const data = new Uint8Array(await new Response(result.stream).arrayBuffer());
  return {
    data,
    mediaType: result.blob.contentType || "image/jpeg",
  };
}
