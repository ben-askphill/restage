import { generateText } from "ai";
import { getImageModel } from "./gateway";
import type { ImageInput } from "./images";
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

export async function renderRoom(input: RenderInput): Promise<RenderResult> {
  const { instruction, roomImage, styleReferences = [], currentRender } =
    input;

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array; mediaType?: string }
  > = [{ type: "text", text: instruction }];

  if (currentRender) {
    content.push({
      type: "text",
      text: "Current render to edit (preserve architecture and camera):",
    });
    content.push({
      type: "image",
      image: currentRender.data,
      mediaType: currentRender.mediaType,
    });
  }

  content.push({
    type: "text",
    text: currentRender
      ? "Original room photo for architectural reference:"
      : "Room photo (FIRST input image — preserve architecture):",
  });
  content.push({
    type: "image",
    image: roomImage.data,
    mediaType: roomImage.mediaType,
  });

  if (styleReferences.length > 0) {
    content.push({
      type: "text",
      text: "Style reference images (mood/materials only — do NOT copy layout):",
    });
    for (const ref of styleReferences) {
      content.push({
        type: "image",
        image: ref.data,
        mediaType: ref.mediaType,
      });
    }
  }

  const result = await generateText({
    model: getImageModel(),
    messages: [{ role: "user", content }],
    providerOptions: {
      google: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    },
  });

  const imageFiles = result.files.filter((f) =>
    f.mediaType?.startsWith("image/"),
  );

  if (imageFiles.length === 0) {
    throw new Error(
      "Image model did not return an image. Check IMAGE_MODEL configuration.",
    );
  }

  const imageFile = imageFiles[0];
  const mediaType = imageFile.mediaType ?? "image/png";
  const imageUrl = await uploadRender(imageFile.uint8Array, mediaType);

  return { imageUrl, mediaType };
}
