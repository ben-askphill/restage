import { get, put } from "@vercel/blob";
import { hasBlob } from "@/lib/env";

const ALLOWED_PREFIXES = ["renders/", "uploads/"] as const;

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

async function putPrivateBlob(
  pathname: string,
  data: Uint8Array,
  contentType: string,
): Promise<string> {
  if (!hasBlob()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not configured. Add it to your environment to store images.",
    );
  }

  const blob = await put(pathname, Buffer.from(data), {
    access: "private",
    contentType,
    addRandomSuffix: false,
  });

  return blobDisplayUrl(blob.pathname);
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
