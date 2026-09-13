export type ImageInput = {
  data: Uint8Array;
  mediaType: string;
};

export function dataUrlToImageInput(dataUrl: string): ImageInput {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid data URL format");
  }

  const mediaType = match[1];
  const base64 = match[2];
  const binary = Buffer.from(base64, "base64");
  return { data: new Uint8Array(binary), mediaType };
}

export async function urlToImageInput(url: string): Promise<ImageInput> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }

  const mediaType =
    response.headers.get("content-type") ?? "image/jpeg";
  const buffer = await response.arrayBuffer();
  return { data: new Uint8Array(buffer), mediaType };
}

export function imageInputToDataUrl(image: ImageInput): string {
  const base64 = Buffer.from(image.data).toString("base64");
  return `data:${image.mediaType};base64,${base64}`;
}
