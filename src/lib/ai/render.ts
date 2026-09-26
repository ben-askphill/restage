import { generateText } from "ai";
import { getImageModel } from "./gateway";
import { toFilePart, type ImageInput } from "./images";
import { normalizeImageForGeneration } from "./normalize-image";
import { formatPieceLine, pieceConstraintBlock } from "./piece-meta";
import type { PieceWithImage } from "./pieces";
import { uploadRender } from "@/lib/blob";
import { DEFAULT_IMAGE_QUALITY, DEFAULT_IMAGE_SIZE } from "@/lib/env";

export type RenderInput = {
  instruction: string;
  roomImage: ImageInput;
  styleReferences?: ImageInput[];
  /** Object-level piece photos to copy into the room (replace or add). */
  pieceReferences?: PieceWithImage[];
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

type GeminiImageSize = "512" | "1K" | "2K";

function imageSizeForQuality(quality: string): GeminiImageSize {
  switch (quality) {
    case "low":
      return "512";
    case "high":
      return "2K";
    case "medium":
    case "auto":
      return "1K";
    default:
      return "1K";
  }
}

function aspectRatioForSize(size: string): "3:2" | "2:3" | "1:1" | undefined {
  switch (size) {
    case "1536x1024":
      return "3:2";
    case "1024x1536":
      return "2:3";
    case "1024x1024":
      return "1:1";
    default:
      return undefined;
  }
}

async function generateRoomImage(
  content: PromptPart[],
): Promise<GeneratedImageFile> {
  const parts: PromptPart[] = [];
  for (const part of content) {
    if (part.type === "text") {
      parts.push(part);
      continue;
    }
    const normalized = await normalizeImageForGeneration(part);
    parts.push({
      type: "file",
      data: normalized.data,
      mediaType: normalized.mediaType,
    });
  }

  const aspectRatio = aspectRatioForSize(DEFAULT_IMAGE_SIZE);
  const result = await generateText({
    model: getImageModel(),
    messages: [{ role: "user", content: parts }],
    providerOptions: {
      google: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          imageSize: imageSizeForQuality(DEFAULT_IMAGE_QUALITY),
          ...(aspectRatio ? { aspectRatio } : {}),
        },
      },
    },
  });

  const imageFile = result.files
    .filter((file) => file.mediaType?.startsWith("image/"))
    .at(-1);
  if (!imageFile) {
    throw new Error("The image model did not return an image.");
  }

  return { mediaType: imageFile.mediaType, uint8Array: imageFile.uint8Array };
}

export async function renderRoom(input: RenderInput): Promise<RenderOutput> {
  const {
    instruction,
    roomImage,
    styleReferences = [],
    pieceReferences = [],
    currentRender,
  } = input;

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
      text: "Style reference images (mood/materials only — do NOT copy layout or specific furniture):",
    });
    for (const ref of styleReferences) {
      content.push(toFilePart(ref));
    }
  }

  if (pieceReferences.length > 0) {
    content.push({
      type: "text",
      text: pieceConstraintBlock(pieceReferences.map((piece) => piece.meta)),
    });
    for (const [index, piece] of pieceReferences.entries()) {
      content.push({
        type: "text",
        text: formatPieceLine(piece.meta, index),
      });
      content.push(toFilePart(piece.image));
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
