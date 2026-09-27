import { itemsMatch, normalizeItemName } from "./keep";
import type { ExistingFurnitureItem, RoomInventory } from "./schemas";

const NAMED_FIXTURE =
  /\b(chandeliers?|flush[\s-]?mount(?:ed|s)?|semi[\s-]?flush(?:[\s-]?mount(?:ed|s)?)?|pendants?|sputniks?|canopy\s+lights?|track\s+light(?:s|ing)?|ceiling\s+fans?)\b/i;

const PORTABLE_LAMP =
  /\b(table|desk|floor|bedside|nightstand|task)\s+lamps?\b/i;

const CEILING_PLACE = /\b(ceiling|overhead)\b/i;

const FIXTURE_NOUN =
  /\b(lights?|lamps?|fixtures?|chandeliers?|pendants?|bulbs?|globes?)\b/i;

const DAYLIGHT_ONLY =
  /\b(natural|daylight|sunlight|window light|skylight)\b/i;

const HARD_FIXTURE = /\b(chandeliers?|pendants?|flush[\s-]?mount|bulbs?|globes?|fixtures?|lamps?)\b/i;

/** Fixture families used to tell two ceiling lights apart. */
const KIND_TOKENS = [
  "chandelier",
  "flush mount",
  "semi flush",
  "pendant",
  "sputnik",
  "track lighting",
  "track light",
  "ceiling fan",
  "canopy light",
] as const;

const OVERLAP_STOP = new Set([
  "light",
  "lights",
  "lamp",
  "lamps",
  "fixture",
  "fixtures",
  "ceiling",
  "overhead",
  "hanging",
  "mounted",
  "mount",
  "mounts",
  "with",
  "from",
  "that",
  "this",
  "room",
  "wall",
  "centered",
  "centre",
  "center",
  "visible",
  "existing",
  "artificial",
  "style",
  "bulb",
  "bulbs",
  "globe",
  "globes",
  "exposed",
  "multi",
  "arm",
  "arms",
  "the",
  "and",
]);

/**
 * Decorative ceiling lights a person can keep, replace, or buy.
 * Portable lamps (table, floor, desk) are not ceiling fixtures.
 */
export function isCeilingLightingFixture(text: string): boolean {
  const value = text.trim();
  if (!value) return false;

  const portable = PORTABLE_LAMP.test(value);
  const onCeiling = CEILING_PLACE.test(value);

  if (NAMED_FIXTURE.test(value)) return true;
  if (portable && !onCeiling) return false;

  if (onCeiling && FIXTURE_NOUN.test(value)) {
    if (DAYLIGHT_ONLY.test(value) && !HARD_FIXTURE.test(value)) return false;
    return true;
  }

  return false;
}

function kindsIn(text: string): string[] {
  const normalized = normalizeItemName(text);
  return KIND_TOKENS.filter((kind) =>
    normalized.includes(normalizeItemName(kind)),
  );
}

function contentWords(text: string): string[] {
  const kindWords = new Set(
    kindsIn(text).flatMap((kind) => normalizeItemName(kind).split(" ")),
  );
  return normalizeItemName(text)
    .split(" ")
    .filter((word) => word.length > 2)
    .filter((word) => !OVERLAP_STOP.has(word))
    .filter((word) => !kindWords.has(word));
}

/** True when two labels are the same ceiling fixture, not two different ones. */
export function sameCeilingFixture(a: string, b: string): boolean {
  if (itemsMatch(a, b)) return true;
  if (!isCeilingLightingFixture(a) || !isCeilingLightingFixture(b)) return false;

  const leftKinds = kindsIn(a);
  const rightKinds = kindsIn(b);
  const sharedKind =
    leftKinds.length === 0 || rightKinds.length === 0
      ? leftKinds.length === 0 && rightKinds.length === 0
      : leftKinds.some((kind) => rightKinds.includes(kind));
  if (!sharedKind) return false;

  const leftWords = contentWords(a);
  const rightWords = contentWords(b);
  if (leftWords.length === 0 || rightWords.length === 0) return false;

  const [shorter, longer] =
    leftWords.length <= rightWords.length
      ? [leftWords, rightWords]
      : [rightWords, leftWords];
  return shorter.every((word) => longer.includes(word));
}

export function unkeptCeilingFixtures(
  furniture: ExistingFurnitureItem[],
): ExistingFurnitureItem[] {
  return furniture.filter(
    (piece) => !piece.keep && isCeilingLightingFixture(piece.item),
  );
}

/** Shopping-list instruction for ceiling fixtures the user did not keep. */
export function ceilingFixtureSourceRule(
  pieces: ExistingFurnitureItem[],
): string {
  if (pieces.length === 0) return "";
  return `
- Original ceiling fixtures the user is not keeping. Include a buyable replacement for each (chandelier, flush mount, pendant, or similar), matching the fixture shown in the render:
${pieces.map((piece) => `  - ${piece.item}`).join("\n")}`;
}

function withoutCeilingFixtures(entries: string[]): string[] {
  return entries.filter((entry) => !isCeilingLightingFixture(entry));
}

/**
 * Ceiling fixtures are often filed under lighting or fixed architecture and
 * then never reach the keep / replace / source list. Copy any that are missing
 * into existingFurniture, and stop treating them as immovable architecture.
 */
export function promoteCeilingFixtures(inventory: RoomInventory): RoomInventory {
  const candidates = [
    ...inventory.lighting.existingArtificial,
    ...inventory.fixedElements,
    ...inventory.architecture.builtIns,
  ];

  const additions: ExistingFurnitureItem[] = [];
  for (const raw of candidates) {
    const text = raw.trim();
    if (!isCeilingLightingFixture(text)) continue;

    const listed = [
      ...inventory.existingFurniture.map((piece) => piece.item),
      ...additions.map((piece) => piece.item),
    ];
    if (listed.some((item) => sameCeilingFixture(item, text))) continue;

    additions.push({
      item: text,
      keep: false,
      note: "Ceiling light fixture",
    });
  }

  return {
    ...inventory,
    architecture: {
      ...inventory.architecture,
      builtIns: withoutCeilingFixtures(inventory.architecture.builtIns),
    },
    fixedElements: withoutCeilingFixtures(inventory.fixedElements),
    existingFurniture: [...inventory.existingFurniture, ...additions],
  };
}
