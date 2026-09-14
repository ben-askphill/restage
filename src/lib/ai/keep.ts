import type {
  ExistingFurnitureItem,
  RoomInventory,
} from "./schemas";

const FURNITURE_ALIASES = [
  ["sofa", "couch", "sectional", "settee", "loveseat", "bank"],
  ["rug", "carpet", "vloerkleed"],
  ["armchair", "accent chair", "lounge chair", "fauteuil"],
  ["coffee table", "salontafel"],
  ["tv", "television", "media console", "tv unit", "tv cabinet", "sideboard"],
];

export function normalizeItemName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function itemsMatch(a: string, b: string): boolean {
  const left = normalizeItemName(a);
  const right = normalizeItemName(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  return FURNITURE_ALIASES.some(
    (group) =>
      group.some((alias) => left.includes(alias)) &&
      group.some((alias) => right.includes(alias)),
  );
}

export function uniqueKeepItems(items: string[]): string[] {
  const unique: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (unique.some((existing) => itemsMatch(existing, trimmed))) continue;
    unique.push(trimmed);
  }
  return unique;
}

export function applyKeepItems(
  inventory: RoomInventory,
  keepItems: string[],
): RoomInventory {
  const selected = uniqueKeepItems(keepItems);

  const furniture: ExistingFurnitureItem[] = inventory.existingFurniture.map(
    (piece) => ({
      ...piece,
      keep: selected.some((keep) => itemsMatch(piece.item, keep)),
    }),
  );

  const extras = selected.filter(
    (keep) => !furniture.some((piece) => itemsMatch(piece.item, keep)),
  );

  return {
    ...inventory,
    existingFurniture: [
      ...furniture,
      ...extras.map((item) => ({
        item,
        keep: true,
        note: "Added by user",
      })),
    ],
    constraintsFromUser: {
      ...inventory.constraintsFromUser,
      keepItems: selected,
    },
  };
}

export function keptFurniture(inventory: RoomInventory): ExistingFurnitureItem[] {
  return inventory.existingFurniture.filter((piece) => piece.keep);
}
