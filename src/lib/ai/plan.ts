import { generateObject } from "ai";
import { DESIGNER_SYSTEM_PROMPT } from "./constants";
import { getDesignerModel } from "./gateway";
import { applyKeepItems, keptFurniture } from "./keep";
import { toFilePart, type ImageInput } from "./images";
import {
  designStrategySchema,
  type DesignBrief,
  type RoomInventory,
} from "./schemas";

export type PlanInput = {
  inventory: RoomInventory;
  keepItems: string[];
  roomImage: ImageInput;
  /** Text profile derived from a saved "My Styles" folder, if one was picked. */
  styleProfile?: string;
};

export async function planDesign(input: PlanInput): Promise<DesignBrief> {
  const inventory = applyKeepItems(input.inventory, input.keepItems);
  const keep = keptFurniture(inventory);
  const keepLines =
    keep.length > 0
      ? keep
          .map((piece) => `- ${piece.item}${piece.note ? ` (${piece.note})` : ""}`)
          .join("\n")
      : "none — all movable furniture may be replaced";

  const result = await generateObject({
    model: getDesignerModel(),
    schema: designStrategySchema,
    system: DESIGNER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Write a design strategy for re-decorating this room. The user has already chosen what stays.

HARD KEEP LIST (do not replace, restyle, reupholster, or relocate these):
${keepLines}

layoutConcept must design AROUND those pieces in their current positions. Never propose a new sofa/couch/sectional if a sofa is on the keep list.

Room inventory:
${JSON.stringify(inventory, null, 2)}

Style: ${inventory.constraintsFromUser.style}
Budget: ${inventory.constraintsFromUser.budgetTier}
Region: ${inventory.constraintsFromUser.region}
Use: ${inventory.constraintsFromUser.function}${
              input.styleProfile
                ? `

Saved style profile (from the user's inspiration folder — treat as the authoritative direction for palette, materials, mood and finish):
${input.styleProfile}`
                : ""
            }`,
          },
          toFilePart(input.roomImage),
        ],
      },
    ],
  });

  return {
    ...inventory,
    designStrategy: result.object,
  };
}
