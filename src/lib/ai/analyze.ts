import { generateObject } from "ai";
import { aspectRatioForRoomPhoto } from "./aspect-ratio";
import { promoteCeilingFixtures } from "./ceiling-fixtures";
import { DESIGNER_SYSTEM_PROMPT } from "./constants";
import { getDesignerModel } from "./gateway";
import { toFilePart, type ImageInput } from "./images";
import { buildAnalyzeInventoryPrompt } from "./inventory-prompt";
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
  const roomPhoto = roomImages[0];
  if (!roomPhoto) {
    throw new Error("At least one room image is required");
  }

  const content: Array<
    | { type: "text"; text: string }
    | { type: "file"; data: Uint8Array; mediaType: string }
  > = [
    {
      type: "text",
      text: buildAnalyzeInventoryPrompt({
        userBrief,
        hasFloorPlan: Boolean(floorPlan),
      }),
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

  const [result, aspectRatio] = await Promise.all([
    generateObject({
      model: getDesignerModel(),
      schema: roomInventorySchema,
      system: DESIGNER_SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    }),
    aspectRatioForRoomPhoto(roomPhoto),
  ]);

  return promoteCeilingFixtures({
    ...result.object,
    aspectRatio,
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
  });
}
