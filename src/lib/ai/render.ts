import { generateText } from "ai";
import { getImageModel } from "./gateway";
import { toFilePart, type ImageInput } from "./images";
import { uploadRender } from "@/lib/blob";

export type RenderInput = {
  instruction: string;
  roomImage: ImageInput;
  styleReferences?: ImageInput[];
  /** When refining, pass the current render as the primary edit target */
  currentRender?: ImageInput;
};

export type RenderResult = {
  imageUrl: string;
  mediaType: string;
};

export type RenderOutput = RenderResult & {
  image: ImageInput;
};

export function toClientRenderResult(result: RenderOutput): RenderResult {
  return { imageUrl: result.imageUrl, mediaType: result.mediaType };
}

type PromptPart =
  | { type: "text"; text: string }
  | { type: "file"; data: Uint8Array; mediaType: string };

type GeneratedImageFile = {
  mediaType: string;
  uint8Array: Uint8Array;
};

function looksLikeImage(file: GeneratedImageFile): boolean {
  if (file.mediaType?.startsWith("image/") || file.mediaType === "image") {
    return true;
  }
  const bytes = file.uint8Array;
  if (!bytes || bytes.byteLength < 32) return false;
  return (
    (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) ||
    (bytes[0] === 0xff && bytes[1] === 0xd8) ||
    (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46)
  );
}

function extractImageFiles(result: {
  files: GeneratedImageFile[];
  content: Array<{ type: string; file?: GeneratedImageFile }>;
}): GeneratedImageFile[] {
  const fromFiles = result.files.filter(looksLikeImage);
  if (fromFiles.length > 0) return fromFiles;

  return result.content
    .flatMap((part) => (part.file ? [part.file] : []))
    .filter(looksLikeImage);
}

function imageFailureDetail(result: { finishReason?: string; text?: string }) {
  const text = result.text?.trim().replace(/\s+/g, " ").slice(0, 280);
  return [result.finishReason, text].filter(Boolean).join(" — ");
}

async function generateRoomImage(
  content: PromptPart[],
): Promise<GeneratedImageFile> {
  const result = await generateText({
    model: getImageModel(),
    messages: [{ role: "user", content }],
    providerOptions: {
      google: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    },
  });

  let images = extractImageFiles(result);
  if (images.length === 0) {
    const retryContent: PromptPart[] = [
      {
        type: "text",
        text: "Return one photorealistic photograph. Do not reply with text.",
      },
      ...content.filter((part) => part.type === "file"),
    ];
    const retry = await generateText({
      model: getImageModel(),
      messages: [{ role: "user", content: retryContent }],
      providerOptions: {
        google: {
          responseModalities: ["IMAGE"],
        },
      },
    });
    images = extractImageFiles(retry);
    if (images.length === 0) {
      const detail =
        imageFailureDetail(retry) || imageFailureDetail(result);
      throw new Error(
        detail
          ? `Image model did not return an image: ${detail}`
          : "Image model did not return an image. Check IMAGE_MODEL configuration.",
      );
    }
  }

  return images[0];
}

export async function renderRoom(input: RenderInput): Promise<RenderOutput> {
  const { instruction, roomImage, styleReferences = [], currentRender } =
    input;

  const content: PromptPart[] = [{ type: "text", text: instruction }];

  if (currentRender) {
    content.push({
      type: "text",
      text: "Current render to edit (preserve architecture and camera):",
    });
    content.push(toFilePart(currentRender));
  }

  content.push({
    type: "text",
    text: currentRender
      ? "Original room photo for architectural reference:"
      : "Room photo (FIRST input image — preserve architecture):",
  });
  content.push(toFilePart(roomImage));

  if (styleReferences.length > 0) {
    content.push({
      type: "text",
      text: "Style reference images (mood/materials only — do NOT copy layout):",
    });
    for (const ref of styleReferences) {
      content.push(toFilePart(ref));
    }
  }

  const imageFile = await generateRoomImage(content);
  const mediaType = imageFile.mediaType?.startsWith("image/")
    ? imageFile.mediaType
    : "image/png";
  const image: ImageInput = {
    data: imageFile.uint8Array,
    mediaType,
  };
  const imageUrl = await uploadRender(image.data, mediaType);

  return { imageUrl, mediaType, image };
}
