import { generateObject } from "ai";
import { DESIGNER_SYSTEM_PROMPT } from "./constants";
import { getDesignerModel } from "./gateway";
import { toFilePart, type ImageInput } from "./images";
import {
  roomInventorySchema,
  type RoomInventory,
  type UserBriefInput,
} from "./schemas";

export type AnalyzeInput = {
  roomImages: ImageInput[];
  floorPlan?: ImageInput;
  userBrief: UserBriefInput;
};

export async function analyzeRoom(input: AnalyzeInput): Promise<RoomInventory> {
  const { roomImages, floorPlan, userBrief } = input;

  const content: Array<
    | { type: "text"; text: string }
    | { type: "file"; data: Uint8Array; mediaType: string }
  > = [
    {
      type: "text",
      text: `Inventory this room photograph. Identify architecture, lighting, dimensions, and every visible movable object.

User context (for room type and constraints only — do not decide what to keep):
- Room type: ${userBrief.roomType}
- Style direction: ${userBrief.style}
- Budget tier: ${userBrief.budgetTier}
- Region: ${userBrief.region}
- How the room is used: ${userBrief.function}

${floorPlan ? "A floor plan image is also provided — prefer its dimensions and door/window positions over photo estimates." : "No floor plan provided — estimate dimensions from the photo using standard references (interior door ≈ 2.0m tall)."}

Rules:
- Be specific about camera angle and aspect ratio (later renders must match this photo exactly).
- Never invent architecture that is not visible.
- If dimensions are estimated, set confidence honestly and note the reference used.
- Copy style, budgetTier, region, and function into constraintsFromUser. Set keepItems to [].
- For existingFurniture, list every visible movable piece: sofas, sectionals, chairs, tables, rugs, lamps, TV, media units, curtains, plants, art, shelves, ottomans, etc.
- Name each piece specifically (shape, color, material) so a person can recognize it. Example: "grey L-shaped sectional along the right wall".
- Set keep=false for every furniture item. The user will choose what to keep next.
- Put a short visual note on each item (color, fabric, position).`,
    },
  ];

  for (const img of roomImages) {
    content.push(toFilePart(img));
  }

  if (floorPlan) {
    content.push({
      type: "text",
      text: "Floor plan image (use for dimensions and layout):",
    });
    content.push(toFilePart(floorPlan));
  }

  const result = await generateObject({
    model: getDesignerModel(),
    schema: roomInventorySchema,
    system: DESIGNER_SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  return {
    ...result.object,
    existingFurniture: result.object.existingFurniture.map((piece) => ({
      ...piece,
      keep: false,
    })),
    constraintsFromUser: {
      style: userBrief.style,
      budgetTier: userBrief.budgetTier,
      region: userBrief.region,
      function: userBrief.function,
      keepItems: [],
    },
  };
}
