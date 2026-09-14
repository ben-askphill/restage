import { addImages, toClient } from "@/lib/ai/styles";
import type { ImageInput } from "@/lib/ai/images";
import { apiError, checkBlobConfig, streamStatus } from "@/lib/api";
import { isHeicLike } from "@/lib/media-type";

export const runtime = "nodejs";
export const maxDuration = 300;

type Context = { params: Promise<{ id: string }> };

function isTruthy(value: FormDataEntryValue | null): boolean {
  return value === "true" || value === "1";
}

function isBlobFile(value: FormDataEntryValue): value is File {
  return value instanceof File && value.size > 0;
}

async function fileToImageInput(file: File): Promise<ImageInput> {
  if (isHeicLike(file)) {
    throw new Error(
      "HEIC photos aren't supported on the server. Convert to JPEG or PNG and try again.",
    );
  }
  const type = file.type.toLowerCase();
  if (type && !type.startsWith("image/")) {
    throw new Error(`"${file.name}" is not an image.`);
  }
  const data = new Uint8Array(await file.arrayBuffer());
  return { data, mediaType: type || "image/jpeg" };
}

export async function POST(request: Request, { params }: Context) {
  const blobError = checkBlobConfig();
  if (blobError) return blobError;

  try {
    const { id } = await params;
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return apiError(
        "Upload images as multipart form data (field name: images).",
        400,
      );
    }

    const form = await request.formData();
    const files = form.getAll("images").filter(isBlobFile);
    if (files.length === 0) {
      return apiError("At least one image is required", 400);
    }

    for (const file of files) {
      if (isHeicLike(file)) {
        return apiError(
          "HEIC photos aren't supported on the server. Convert to JPEG or PNG and try again.",
          400,
        );
      }
      const type = file.type.toLowerCase();
      if (type && !type.startsWith("image/")) {
        return apiError(`"${file.name}" is not an image.`, 400);
      }
    }

    const images = await Promise.all(files.map(fileToImageInput));
    const stream = isTruthy(form.get("stream"));

    const run = async (send?: (status: string) => void) => {
      const { manifest, profileError } = await addImages(id, images, send);
      send?.("Style saved");
      return {
        style: toClient(manifest),
        ...(profileError ? { warning: profileError } : {}),
      };
    };

    if (stream) {
      return streamStatus(async (send) => run(send));
    }

    return Response.json(await run());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to add images";
    return apiError(message);
  }
}
