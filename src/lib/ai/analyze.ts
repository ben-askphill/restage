import { generateObject } from "ai";
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

  const result = await generateObject({
    model: getDesignerModel(),
    schema: roomInventorySchema,
    system: DESIGNER_SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  return promoteCeilingFixtures({
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
  });
}
