import { z } from "zod";

export const budgetTierSchema = z.enum(["budget", "mid", "premium"]);

export const userBriefInputSchema = z.object({
  roomType: z.string().min(1),
  /** Optional. A saved style folder can stand in for a written direction. */
  style: z.string(),
  budgetTier: budgetTierSchema,
  region: z.string().min(1),
  keepItems: z.array(z.string()).default([]),
  /** Optional description of how the room is used. */
  function: z.string(),
});

export type UserBriefInput = z.infer<typeof userBriefInputSchema>;

/** Object-level reference: a photo of a specific sofa, lamp, rug, etc. */
export const pieceIntentSchema = z.enum(["replace", "add"]);

export type PieceIntent = z.infer<typeof pieceIntentSchema>;

export const pieceReferenceSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  intent: pieceIntentSchema,
  /** Existing furniture item this photo should replace. Required in the product when intent is "replace". */
  replaces: z.string().optional(),
});

export type PieceReference = z.infer<typeof pieceReferenceSchema>;

/** Client → plan/render/refine: metadata plus a prepared image data URL. */
export const pieceReferencePayloadSchema = pieceReferenceSchema.extend({
  image: z.string().min(1),
});

export type PieceReferencePayload = z.infer<typeof pieceReferencePayloadSchema>;

const windowDoorSchema = z.object({
  location: z.string(),
  keep: z.boolean(),
});

export const existingFurnitureItemSchema = z.object({
  item: z
    .string()
    .describe(
      "Specific name with shape, color, material, and position. Ceiling lights must name the fixture type and finish, for example a brass flush mount or a black multi-arm chandelier.",
    ),
  keep: z.boolean(),
  note: z.string(),
});

export type ExistingFurnitureItem = z.infer<typeof existingFurnitureItemSchema>;

export const constraintsFromUserSchema = z.object({
  style: z.string(),
  budgetTier: budgetTierSchema,
  region: z.string(),
  keepItems: z.array(z.string()),
  function: z.string(),
});

export const designStrategySchema = z.object({
  focalPoint: z.string(),
  layoutConcept: z.string(),
  palette: z.array(z.string()),
  materials: z.array(z.string()),
  reasoning: z.string(),
});

export const roomInventorySchema = z.object({
  roomType: z.string(),
  cameraAngle: z.string(),
  aspectRatio: z.string(),
  architecture: z.object({
    walls: z.string(),
    windows: z.array(windowDoorSchema),
    doors: z.array(windowDoorSchema),
    ceilingHeightM: z.number(),
    floorMaterial: z.string(),
    builtIns: z
      .array(z.string())
      .describe(
        "Built-in millwork and architectural storage only. Ceiling light fixtures are not built-ins.",
      ),
  }),
  fixedElements: z
    .array(z.string())
    .describe(
      "Immovable architecture and building services only: radiators, outlets, switches, vents, columns, beams. Do not list chandeliers, flush mounts, pendants, or other ceiling light fixtures here.",
    ),
  lighting: z.object({
    naturalSources: z.array(
      z.object({
        type: z.string(),
        wall: z.string(),
        orientation: z.string(),
      }),
    ),
    existingArtificial: z
      .array(z.string())
      .describe(
        "Artificial light sources for lighting physics, including each ceiling fixture. Every chandelier, flush mount, pendant, or similar ceiling fixture listed here must also be an existingFurniture item.",
      ),
    dominantDirection: z.string(),
    mood: z.string(),
  }),
  dimensions: z.object({
    source: z.enum(["floor-plan", "estimated-from-photo"]),
    roomWidthM: z.number(),
    roomDepthM: z.number(),
    confidence: z.enum(["high", "medium", "low"]),
    referenceUsed: z.string(),
  }),
  existingFurniture: z
    .array(existingFurnitureItemSchema)
    .describe(
      "Every visible movable object and every ceiling lighting fixture the user can keep, replace, or source: chandeliers, flush mounts, semi-flush mounts, pendants, and similar ceiling lights, plus furniture, rugs, portable lamps, art, and decor. Omit nothing from this list just because it is mounted on the ceiling.",
    ),
  constraintsFromUser: constraintsFromUserSchema,
});

export type RoomInventory = z.infer<typeof roomInventorySchema>;

export const designBriefSchema = roomInventorySchema.extend({
  designStrategy: designStrategySchema,
  /** Specific objects the user supplied photos of (not style-folder inspiration). */
  pieceReferences: z.array(pieceReferenceSchema).default([]),
});

export type DesignBrief = z.infer<typeof designBriefSchema>;

export const shoppingListSchema = z.object({
  currency: z.string(),
  items: z.array(
    z.object({
      name: z.string(),
      category: z.string(),
      why: z.string(),
      estPriceRange: z.string(),
      approxDimensions: z.string(),
      retailers: z.array(z.string()),
      searchQuery: z.string(),
    }),
  ),
  notes: z.string(),
});

export type ShoppingList = z.infer<typeof shoppingListSchema>;

export const styleProfileSchema = z.object({
  summary: z.string(),
  palette: z.array(z.string()),
  materials: z.array(z.string()),
  mood: z.string(),
  finishLevel: budgetTierSchema,
  keywords: z.array(z.string()),
});

export type StyleProfile = z.infer<typeof styleProfileSchema>;

export const styleImageSchema = z.object({
  pathname: z.string(),
  contentType: z.string(),
  addedAt: z.string(),
});

export type StyleImage = z.infer<typeof styleImageSchema>;

export const styleManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  images: z.array(styleImageSchema),
  profile: styleProfileSchema.nullable(),
  signature: z.string().nullable(),
});

export type StyleManifest = z.infer<typeof styleManifestSchema>;

/** A style folder as sent to the client: image pathnames replaced by proxy URLs. */
export type StyleForClient = Omit<StyleManifest, "images"> & {
  images: Array<{ url: string; contentType: string; addedAt: string }>;
};

export type StyleSummary = {
  id: string;
  name: string;
  updatedAt: string;
  imageCount: number;
  thumbnailUrl: string | null;
  summary: string | null;
};

export const critiqueResultSchema = z.object({
  passed: z.boolean(),
  issues: z.array(z.string()),
  correctiveInstruction: z.string().optional(),
});

export type CritiqueResult = z.infer<typeof critiqueResultSchema>;
