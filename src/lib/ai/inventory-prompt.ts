import type { UserBriefInput } from "./schemas";

export function buildAnalyzeInventoryPrompt(input: {
  userBrief: UserBriefInput;
  hasFloorPlan: boolean;
}): string {
  const { userBrief, hasFloorPlan } = input;

  return `Inventory this room photograph. Identify architecture, lighting, dimensions, and every visible object the user could keep, replace, or source.

User context (for room type and constraints only — do not decide what to keep):
- Room type: ${userBrief.roomType}
- Style direction: ${userBrief.style.trim() || "not specified yet"}
- Budget tier: ${userBrief.budgetTier}
- Region: ${userBrief.region}
- How the room is used: ${userBrief.function.trim() || "not specified yet"}

${hasFloorPlan ? "A floor plan image is also provided — prefer its dimensions and door/window positions over photo estimates." : "No floor plan provided — estimate dimensions from the photo using standard references (interior door ≈ 2.0m tall)."}

Rules:
- Be specific about camera angle and aspect ratio (later renders must match this photo exactly).
- Never invent architecture that is not visible.
- If dimensions are estimated, set confidence honestly and note the reference used.
- Copy style, budgetTier, region, and function into constraintsFromUser. Set keepItems to [].
- For existingFurniture, list every visible object the user could keep, replace, or buy: sofas, sectionals, chairs, tables, rugs, table and floor lamps, TV, media units, curtains, plants, art, shelves, ottomans, and ceiling lighting.
- Ceiling lighting is required. Include every visible chandelier, flush mount, semi-flush mount, pendant, and similar ceiling fixture (multi-arm fixtures, exposed-bulb globes, canopy lights, track lights, ceiling fans with lights). Name finish, form, and where it hangs. Example: "brass semi-flush mount with a frosted glass shade, centered on the ceiling".
- Put each ceiling fixture in existingFurniture even when you also describe it under lighting.existingArtificial. Do not file ceiling fixtures only in fixedElements, builtIns, or lighting — those fields are not the keep, replace, or source list.
- Decorative ceiling lights are not permanent architecture. Walls, windows, doors, the ceiling plane, radiators, and outlets stay fixed; the fixture itself is replaceable.
- Still list portable lamps (table lamps, floor lamps) separately when they are visible. A ceiling fixture does not replace a table lamp, and a table lamp does not count as the ceiling light.
- Name each piece specifically (shape, color, material) so a person can recognize it. Example: "grey L-shaped sectional along the right wall".
- Set keep=false for every furniture item. The user will choose what to keep next.
- Put a short visual note on each item (color, fabric or finish, position).`;
}
