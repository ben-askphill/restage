import { isHeicLike } from "@/lib/media-type";

const MAX_EDGE_PX = 2048;
const JPEG_QUALITY = 0.85;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

function closeBitmap(source: ImageBitmap | HTMLImageElement) {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
  }
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          isHeicLike(file)
            ? "This photo is HEIC and couldn't be converted in this browser. Export it as JPEG or PNG and try again."
            : "Couldn't read that image. Try JPEG or PNG.",
        ),
      );
    };
    image.src = url;
  });
}

async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Safari can often still decode HEIC via HTMLImageElement.
    }
  }

  return loadHtmlImage(file);
}

/**
 * Resize and re-encode a photo for upload: max 2048px edge, JPEG ~0.85.
 * Converts HEIC when the browser can decode it; otherwise throws a clear error.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decodeImage(file);
  } catch (error) {
    if (isHeicLike(file)) {
      throw new Error(
        "This photo is HEIC and couldn't be converted in this browser. Export it as JPEG or PNG and try again.",
      );
    }
    throw error instanceof Error
      ? error
      : new Error("Couldn't read that image. Try JPEG or PNG.");
  }

  const width = source.width;
  const height = source.height;
  if (!width || !height) {
    closeBitmap(source);
    throw new Error("Couldn't read that image. Try JPEG or PNG.");
  }

  const scale = Math.min(1, MAX_EDGE_PX / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    closeBitmap(source);
    throw new Error("Couldn't prepare that image for upload.");
  }
  ctx.drawImage(source, 0, 0, targetW, targetH);
  closeBitmap(source);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error("Couldn't compress that image. Try JPEG or PNG."));
      },
      "image/jpeg",
      JPEG_QUALITY,
    );
  });

  if (blob.size > MAX_OUTPUT_BYTES) {
    throw new Error(
      "That photo is still too large after compression. Try a smaller crop or fewer images.",
    );
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "style-image";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}
