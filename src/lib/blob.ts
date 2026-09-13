import { put } from "@vercel/blob";
import { hasBlob } from "@/lib/env";

export async function uploadRender(
  data: Uint8Array,
  contentType: string,
): Promise<string> {
  if (!hasBlob()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not configured. Add it to your environment to store renders.",
    );
  }

  const extension = contentType.split("/")[1] ?? "png";
  const filename = `renders/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const blob = await put(filename, Buffer.from(data), {
    access: "private",
    contentType,
    addRandomSuffix: false,
  });

  return blob.url;
}

export async function uploadUpload(
  data: Uint8Array,
  contentType: string,
  prefix: "room" | "style" | "floorplan",
): Promise<string> {
  if (!hasBlob()) {
    throw new Error(
      "BLOB_READ_WRITE_TOKEN is not configured. Add it to your environment to store uploads.",
    );
  }

  const extension = contentType.split("/")[1] ?? "jpg";
  const filename = `uploads/${prefix}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const blob = await put(filename, Buffer.from(data), {
    access: "private",
    contentType,
    addRandomSuffix: false,
  });

  return blob.url;
}
