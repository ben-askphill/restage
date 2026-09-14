import { z } from "zod";

export const budgetTierSchema = z.enum(["budget", "mid", "premium"]);

export const userBriefInputSchema = z.object({
  roomType: z.string().min(1),
  style: z.string().min(1),
  budgetTier: budgetTierSchema,
  region: z.string().min(1),
  keepItems: z.array(z.string()).default([]),
  function: z.string().min(1),
});

export type UserBriefInput = z.infer<typeof userBriefInputSchema>;

const windowDoorSchema = z.object({
  location: z.string(),
  keep: z.boolean(),
});

export const existingFurnitureItemSchema = z.object({
  item: z.string(),
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
    builtIns: z.array(z.string()),
  }),
  fixedElements: z.array(z.string()),
  lighting: z.object({
    naturalSources: z.array(
      z.object({
        type: z.string(),
        wall: z.string(),
        orientation: z.string(),
      }),
    ),
    existingArtificial: z.array(z.string()),
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
  existingFurniture: z.array(existingFurnitureItemSchema),
  constraintsFromUser: constraintsFromUserSchema,
});

export type RoomInventory = z.infer<typeof roomInventorySchema>;

export const designBriefSchema = roomInventorySchema.extend({
  designStrategy: designStrategySchema,
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

export const critiqueResultSchema = z.object({
  passed: z.boolean(),
  issues: z.array(z.string()),
  correctiveInstruction: z.string().optional(),
});

export type CritiqueResult = z.infer<typeof critiqueResultSchema>;
