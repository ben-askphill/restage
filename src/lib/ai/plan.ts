import { generateObject } from "ai";
import { DESIGNER_SYSTEM_PROMPT } from "./constants";
import { getDesignerModel } from "./gateway";
import { applyKeepItems, keptFurniture } from "./keep";
import { toFilePart, type ImageInput } from "./images";
import { formatPieceLines, pieceConstraintBlock, stripReplacedKeepItems } from "./piece-meta";
import { metasFromPieces, type PieceWithImage } from "./pieces";
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
  /** Object-level piece photos (sofa, lamp, rug, …) — not style folders. */
  pieceReferences?: PieceWithImage[];
};

export async function planDesign(input: PlanInput): Promise<DesignBrief> {
  const pieceRefs = input.pieceReferences ?? [];
  const pieceMetas = metasFromPieces(pieceRefs);
  const keepItems = stripReplacedKeepItems(input.keepItems, pieceMetas);
  const inventory = applyKeepItems(input.inventory, keepItems);
  const keep = keptFurniture(inventory);
  const keepLines =
    keep.length > 0
      ? keep
          .map((piece) => `- ${piece.item}${piece.note ? ` (${piece.note})` : ""}`)
          .join("\n")
      : "none — all movable furniture may be replaced";

  const pieceBlock =
    pieceMetas.length > 0
      ? `

${pieceConstraintBlock(pieceMetas)}

layoutConcept MUST include every ADD piece and MUST replace every REPLACE target with the provided object. Never keep a REPLACE target. Do not treat these photos as style inspiration.`
      : "";

  const content: Array<
    | { type: "text"; text: string }
    | { type: "file"; data: Uint8Array; mediaType: string }
  > = [
    {
      type: "text",
      text: `Write a design strategy for re-decorating this room. The user has already chosen what stays.

HARD KEEP LIST (do not replace, restyle, reupholster, or relocate these):
${keepLines}

layoutConcept must design AROUND those pieces in their current positions. Never propose a new sofa/couch/sectional if a sofa is on the keep list.
${pieceBlock}

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
  ];

  if (pieceRefs.length > 0) {
    content.push({
      type: "text",
      text: `Piece photos follow, in this order:\n${formatPieceLines(pieceMetas)}`,
    });
    for (const piece of pieceRefs) {
      content.push(toFilePart(piece.image));
    }
  }

  const result = await generateObject({
    model: getDesignerModel(),
    schema: designStrategySchema,
    system: DESIGNER_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content,
      },
    ],
  });

  return {
    ...inventory,
    designStrategy: result.object,
    pieceReferences: pieceMetas,
  };
}
