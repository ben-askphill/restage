import { generateObject } from "ai";
import { DESIGNER_SYSTEM_PROMPT } from "./constants";
import { getDesignerModel } from "./gateway";
import type { ImageInput } from "./images";
import {
  shoppingListSchema,
  type DesignBrief,
  type ShoppingList,
} from "./schemas";

export type ShoppingInput = {
  brief: DesignBrief;
  renderImage: ImageInput;
};

export async function generateShoppingList(
  input: ShoppingInput,
): Promise<ShoppingList> {
  const { brief, renderImage } = input;

  const result = await generateObject({
    model: getDesignerModel(),
    schema: shoppingListSchema,
    system: DESIGNER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Based on this rendered room design and the Design Brief below, produce a shopping list of real furniture and decor the user can buy in ${brief.constraintsFromUser.region} at ${brief.constraintsFromUser.budgetTier} budget tier.

Design Brief:
${JSON.stringify(brief, null, 2)}

Rules:
- Suggest pieces genuinely sold in the user's region at the stated budget tier, matching what's shown in the render.
- Give retailer names + a search query the user can run. Do NOT fabricate product URLs or claim live prices/stock.
- Present prices as estimates in local currency.
- Match approximate dimensions to the scale used in the render.
- Do NOT include keep-list items. The user is keeping: ${brief.constraintsFromUser.keepItems.join(", ") || "nothing specified"}.
- Include a notes field explaining prices are estimates.`,
          },
          {
            type: "image",
            image: renderImage.data,
            mediaType: renderImage.mediaType,
          },
        ],
      },
    ],
  });

  return result.object;
}
