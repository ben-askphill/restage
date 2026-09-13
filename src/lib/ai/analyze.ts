import { generateObject } from "ai";
import { DESIGNER_SYSTEM_PROMPT } from "./constants";
import { getDesignerModel } from "./gateway";
import type { ImageInput } from "./images";
import {
  designBriefSchema,
  type DesignBrief,
  type UserBriefInput,
} from "./schemas";

export type AnalyzeInput = {
  roomImages: ImageInput[];
  floorPlan?: ImageInput;
  userBrief: UserBriefInput;
};

export async function analyzeRoom(input: AnalyzeInput): Promise<DesignBrief> {
  const { roomImages, floorPlan, userBrief } = input;

  const content: Array<
    | { type: "text"; text: string }
    | { type: "image"; image: Uint8Array; mediaType?: string }
  > = [
    {
      type: "text",
      text: `Analyze this room photograph and produce a structured Design Brief.

User-provided brief:
- Room type: ${userBrief.roomType}
- Style direction: ${userBrief.style}
- Budget tier: ${userBrief.budgetTier}
- Region: ${userBrief.region}
- Items to keep: ${userBrief.keepItems.length > 0 ? userBrief.keepItems.join(", ") : "none specified"}
- How the room is used: ${userBrief.function}

${floorPlan ? "A floor plan image is also provided — prefer its dimensions and door/window positions over photo estimates." : "No floor plan provided — estimate dimensions from the photo using standard references (interior door ≈ 2.0m tall)."}

Rules:
- Be specific about camera angle and aspect ratio (the render must match the input photo exactly).
- Never invent architecture that isn't visible in the photos.
- If dimensions are estimated, set confidence honestly and note the reference used.
- Populate constraintsFromUser from the user brief above.
- For existingFurniture, list visible pieces and whether they should be kept or replaced based on user input.`,
    },
  ];

  for (const img of roomImages) {
    content.push({
      type: "image",
      image: img.data,
      mediaType: img.mediaType,
    });
  }

  if (floorPlan) {
    content.push({
      type: "text",
      text: "Floor plan image (use for dimensions and layout):",
    });
    content.push({
      type: "image",
      image: floorPlan.data,
      mediaType: floorPlan.mediaType,
    });
  }

  const result = await generateObject({
    model: getDesignerModel(),
    schema: designBriefSchema,
    system: DESIGNER_SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  return result.object;
}
