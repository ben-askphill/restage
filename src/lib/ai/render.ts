import { generateImage } from "ai";
import { getImageModel } from "./gateway";
import { imageInputToDataUrl, toFilePart, type ImageInput } from "./images";
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

async function generateRoomImage(
  content: PromptPart[],
): Promise<GeneratedImageFile> {
  const images = await Promise.all(
    content
      .filter((part) => part.type === "file")
      .map(async (part) =>
        imageInputToDataUrl(
          await normalizeImageForGeneration({
            data: part.data,
            mediaType: part.mediaType,
          }),
        ),
      ),
  );
  const text = content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n\n");

  const { image } = await generateImage({
    model: getImageModel(),
    prompt: { images, text },
    size: DEFAULT_IMAGE_SIZE as `${number}x${number}`,
    providerOptions: { openai: { quality: DEFAULT_IMAGE_QUALITY } },
  });

  return { mediaType: image.mediaType, uint8Array: image.uint8Array };
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
