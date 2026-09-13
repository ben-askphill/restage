import { NON_NEGOTIABLE_RULES } from "./constants";
import type { DesignBrief } from "./schemas";

export function assembleImageInstruction(brief: DesignBrief): string {
  const {
    architecture,
    fixedElements,
    cameraAngle,
    aspectRatio,
    constraintsFromUser,
    roomType,
    designStrategy,
    dimensions,
    lighting,
  } = brief;

  const architectureSummary = [
    architecture.walls,
    `windows: ${architecture.windows.map((w) => w.location).join("; ") || "none visible"}`,
    `doors: ${architecture.doors.map((d) => d.location).join("; ") || "none visible"}`,
    `ceiling ${architecture.ceilingHeightM}m`,
    `floor: ${architecture.floorMaterial}`,
    architecture.builtIns.length > 0
      ? `built-ins: ${architecture.builtIns.join(", ")}`
      : null,
  ]
    .filter(Boolean)
    .join("; ");

  const keepItems =
    constraintsFromUser.keepItems.length > 0
      ? constraintsFromUser.keepItems.join(", ")
      : "none";

  const naturalSources = lighting.naturalSources
    .map((s) => `${s.type} on ${s.wall} (${s.orientation})`)
    .join(", ");

  return `Re-decorate the room in the FIRST input image. This is a photo of a real room — keep it
architecturally identical and shot from the same camera position.

PRESERVE EXACTLY (do not alter): ${architectureSummary}; and these fixed elements: ${fixedElements.join(", ")}. Same camera angle
(${cameraAngle}), same aspect ratio (${aspectRatio}), same perspective and lens.

KEEP THESE ITEMS unchanged and in place: ${keepItems}.

REDESIGN in this direction: ${constraintsFromUser.style}, for a ${roomType} used for ${constraintsFromUser.function}.
Layout: ${designStrategy.layoutConcept}. Focal point: ${designStrategy.focalPoint}.
Palette: ${designStrategy.palette.join(", ")}. Materials: ${designStrategy.materials.join(", ")}.
Furniture should look like real, buyable ${constraintsFromUser.budgetTier}-tier pieces available in ${constraintsFromUser.region}.

SCALE: the room is ~${dimensions.roomWidthM}m x ${dimensions.roomDepthM}m, ceiling ${architecture.ceilingHeightM}m. Size all
furniture to real human proportions and keep walkways clear (≥75cm main paths). Nothing
oversized, undersized, or floating.

LIGHTING: preserve the real light — ${lighting.dominantDirection}, ${lighting.mood}.
Shadows must fall consistently away from ${naturalSources}. One time of day. Add tasteful
ambient/task/accent lighting only where plausibly placed and powered.

STYLE REFERENCES (remaining input images, if any): borrow ONLY their mood, color story,
materials and finish level. Do NOT copy their room, their layout, or their specific
furniture — the room and layout come from the first image and the brief above.

AVOID: changing or adding/removing windows or doors; moving walls; blocking radiators,
outlets or door swings; floating or clipping furniture; dollhouse or giant scale; warped
verticals or perspective; second light source or contradictory shadows; melted materials;
duplicated objects; text or logos; and generic AI-staging clichés (arched mirror,
fiddle-leaf fig, bouclé overload, pillow overload).

Photorealistic, same photographic quality as the input.

${NON_NEGOTIABLE_RULES}`;
}

export function assembleRefineInstruction(
  brief: DesignBrief,
  userInstruction: string,
): string {
  const base = assembleImageInstruction(brief);
  return `${base}

REFINEMENT REQUEST (edit the current render in place — same room, same architecture, same camera):
${userInstruction}

Change ONLY what the refinement request asks for. Keep everything else from the current render intact.`;
}
