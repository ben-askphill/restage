function extensionForMediaType(mediaType: string): string {
  const type = mediaType.toLowerCase().split(";")[0]?.trim() ?? "";
  switch (type) {
    case "image/jpeg":
    case "image/jpg":
    case "image/pjpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "jpg";
  }
}

export function downloadFilename(roomType: string, mediaType: string): string {
  const slug =
    roomType
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "room";
  return `restage-${slug}.${extensionForMediaType(mediaType)}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadUrl(url: string, filename: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Couldn't download the image");
  }
  const blob = await response.blob();
  downloadBlob(blob, filename);
}
