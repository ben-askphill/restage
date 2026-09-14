import { createHash } from "node:crypto";
import { generateObject } from "ai";
import { DESIGNER_SYSTEM_PROMPT } from "./constants";
import { getDesignerModel } from "./gateway";
import { toFilePart, type ImageInput } from "./images";
import { styleProfileSchema, type StyleProfile } from "./schemas";

export type StyleProfileInput = {
  images: ImageInput[];
};

export async function analyzeStyleImages(
  input: StyleProfileInput,
): Promise<StyleProfile> {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "file"; data: Uint8Array; mediaType: string }
  > = [
    {
      type: "text",
      text: `These are interior-design inspiration images that together define one coherent style.
Distill them into a reusable style profile.

Extract ONLY mood, color story, materials, and finish level. Do NOT describe the specific
rooms, their layouts, or individual pieces of furniture — this profile will be reused across
many different rooms, so anything room-specific is noise.

- summary: 1-2 sentences a designer could read to internalise the style.
- palette: the recurring colors (names or hex).
- materials: recurring materials and finishes (e.g. oak, brushed brass, linen, matte black).
- mood: the overall feeling in a few words.
- finishLevel: budget, mid, or premium — how expensive the pieces read.
- keywords: short tags that capture the aesthetic.`,
    },
  ];

  for (const img of input.images) {
    content.push(toFilePart(img));
  }

  const result = await generateObject({
    model: getDesignerModel(),
    schema: styleProfileSchema,
    system: DESIGNER_SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  return result.object;
}

/** One-line, prompt-ready rendering of a derived style profile. */
export function styleProfileToText(profile: StyleProfile): string {
  const parts = [
    profile.summary,
    profile.palette.length ? `Palette: ${profile.palette.join(", ")}` : null,
    profile.materials.length
      ? `Materials: ${profile.materials.join(", ")}`
      : null,
    `Mood: ${profile.mood}`,
    `Finish level: ${profile.finishLevel}`,
  ].filter(Boolean);
  return parts.join(". ");
}

/**
 * Deterministic signature of a style's image set. Image pathnames already carry a
 * timestamp + uuid, so pathname identity is a sufficient content proxy — no byte hashing.
 */
export function computeStyleSignature(pathnames: string[]): string {
  const joined = [...pathnames].sort().join("\n");
  return createHash("sha256").update(joined).digest("hex");
}
