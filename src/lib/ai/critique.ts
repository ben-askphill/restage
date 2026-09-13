import { generateObject } from "ai";
import { DESIGNER_SYSTEM_PROMPT, NON_NEGOTIABLE_RULES } from "./constants";
import { getDesignerModel } from "./gateway";
import type { ImageInput } from "./images";
import {
  critiqueResultSchema,
  type CritiqueResult,
  type DesignBrief,
} from "./schemas";

export type CritiqueInput = {
  brief: DesignBrief;
  renderImage: ImageInput;
  roomImage: ImageInput;
};

export async function critiqueRender(
  input: CritiqueInput,
): Promise<CritiqueResult> {
  const { brief, renderImage, roomImage } = input;

  const result = await generateObject({
    model: getDesignerModel(),
    schema: critiqueResultSchema,
    system: DESIGNER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Critique this rendered room design against the Non-Negotiable Design Rules and the Design Brief.

Check:
- Does the architecture match the original room (walls, windows, doors, camera angle)?
- Any blocked radiator/outlet/door swing?
- Scale plausible vs the door/ceiling?
- Lighting consistent with the original?
- Style-ref mood present without copying layout?
- Keep-list items intact?
- Any AI-staging clichés or material honesty issues?

Design Brief:
${JSON.stringify(brief, null, 2)}

${NON_NEGOTIABLE_RULES}

If the render fails any critical rule, set passed to false and provide a short correctiveInstruction for re-rendering (one focused fix, not a full redesign). If it passes, set passed to true with an empty issues array.`,
          },
          {
            type: "text",
            text: "Original room photo:",
          },
          {
            type: "image",
            image: roomImage.data,
            mediaType: roomImage.mediaType,
          },
          {
            type: "text",
            text: "Rendered design to critique:",
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
