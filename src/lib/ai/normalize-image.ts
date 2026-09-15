import convertHeic from "heic-convert";
import sharp from "sharp";
import {
  mediaTypeForImageKind,
  sniffImageKind,
  type SniffedImageKind,
} from "@/lib/media-type";
import type { ImageInput } from "./images";

const PASSTHROUGH_KINDS = new Set<SniffedImageKind>(["jpeg", "png", "webp"]);

function toBuffer(data: Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data);
}

async function encodeJpeg(data: Uint8Array): Promise<ImageInput> {
  const out = await sharp(toBuffer(data), { failOn: "none", unlimited: true })
    .rotate()
    .removeAlpha()
    .jpeg({ quality: 85 })
    .toBuffer();
  return { data: new Uint8Array(out), mediaType: "image/jpeg" };
}

async function heicToJpeg(data: Uint8Array): Promise<ImageInput> {
  const out = await convertHeic({
    buffer: toBuffer(data),
    format: "JPEG",
    quality: 0.85,
  });
  return { data: new Uint8Array(out), mediaType: "image/jpeg" };
}

/**
 * Make photo bytes acceptable to OpenAI image models.
 * Prefer a JPEG re-encode; if that fails, pass through JPEG/PNG/WEBP as-is.
 */
export async function normalizeImageForGeneration(
  image: ImageInput,
): Promise<ImageInput> {
  if (image.data.length === 0) {
    throw new Error("An image was empty. Try uploading the photo again.");
  }

  const kind = sniffImageKind(image.data);

  if (kind === "heic") {
    try {
      return await encodeJpeg(image.data);
    } catch (sharpError) {
      console.warn("sharp could not decode HEIC, trying heic-convert", sharpError);
      try {
        return await heicToJpeg(image.data);
      } catch (heicError) {
        console.error("heic-convert failed", heicError);
        throw new Error(
          "This photo is HEIC and couldn't be converted. Export it as JPEG or PNG and try again.",
        );
      }
    }
  }

  try {
    return await encodeJpeg(image.data);
  } catch (error) {
    console.warn("sharp re-encode failed", kind, image.mediaType, error);
    if (kind && PASSTHROUGH_KINDS.has(kind)) {
      return { data: image.data, mediaType: mediaTypeForImageKind(kind) };
    }
    throw new Error(
      "That photo isn't a usable JPEG or PNG. Export it as JPEG or PNG and try again.",
    );
  }
}
