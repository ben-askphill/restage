export function isHeicLike(file: { type: string; name: string }): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return (
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif")
  );
}

export type SniffedImageKind = "jpeg" | "png" | "webp" | "gif" | "heic";

const KIND_TO_MEDIA_TYPE: Record<SniffedImageKind, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
};

export function mediaTypeForImageKind(kind: SniffedImageKind): string {
  return KIND_TO_MEDIA_TYPE[kind];
}

/** Identify image bytes from magic numbers, ignoring declared MIME types. */
export function sniffImageKind(data: Uint8Array): SniffedImageKind | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "jpeg";
  }
  if (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47
  ) {
    return "png";
  }
  if (
    data.length >= 12 &&
    data[0] === 0x52 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x46 &&
    data[8] === 0x57 &&
    data[9] === 0x45 &&
    data[10] === 0x42 &&
    data[11] === 0x50
  ) {
    return "webp";
  }
  if (
    data.length >= 6 &&
    data[0] === 0x47 &&
    data[1] === 0x49 &&
    data[2] === 0x46 &&
    data[3] === 0x38
  ) {
    return "gif";
  }
  if (data.length >= 12) {
    const brand = String.fromCharCode(data[4], data[5], data[6], data[7]);
    if (brand === "ftyp") {
      const ftyp = String.fromCharCode(data[8], data[9], data[10], data[11]).toLowerCase();
      if (
        ftyp === "heic" ||
        ftyp === "heix" ||
        ftyp === "heif" ||
        ftyp === "mif1" ||
        ftyp === "msf1"
      ) {
        return "heic";
      }
    }
  }
  return null;
}
