import type { ExistingFurnitureItem } from "./schemas";
import { itemsMatch, uniqueKeepItems } from "./keep";

/** Which keep checks the select-all toggle owns, and which the user checked. */
export type KeepToggleMemory = {
  owned: string[];
  manual: string[];
};

export function emptyKeepToggleMemory(): KeepToggleMemory {
  return { owned: [], manual: [] };
}

export function isReplacementTarget(
  item: string,
  replacedItems: string[],
): boolean {
  return replacedItems.some((target) => itemsMatch(item, target));
}

/** Analyzed items that can still be kept. Replacement targets are excluded. */
export function selectableAnalyzedItems(
  furniture: ExistingFurnitureItem[],
  replacedItems: string[],
): string[] {
  return uniqueKeepItems(
    furniture
      .map((piece) => piece.item)
      .filter((item) => item.trim() && !isReplacementTarget(item, replacedItems)),
  );
}

export function sameKeepList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((item) => right.some((other) => itemsMatch(item, other)));
}

export function sameKeepToggleMemory(
  left: KeepToggleMemory,
  right: KeepToggleMemory,
): boolean {
  return sameKeepList(left.owned, right.owned) && sameKeepList(left.manual, right.manual);
}

function withoutMatches(items: string[], target: string): string[] {
  return items.filter((item) => !itemsMatch(item, target));
}

function keptWithoutReplacements(
  keepItems: string[],
  replacedItems: string[],
): string[] {
  return keepItems.filter((item) => !isReplacementTarget(item, replacedItems));
}

/**
 * Select every analyzed item that is not a replacement target.
 * Checks the user already made stay manual, so turning the toggle off
 * does not clear them.
 */
export function applyKeepSelectAll(
  keepItems: string[],
  memory: KeepToggleMemory,
  furniture: ExistingFurnitureItem[],
  replacedItems: string[],
): { keepItems: string[]; memory: KeepToggleMemory } {
  const kept = keptWithoutReplacements(keepItems, replacedItems);
  const manual = uniqueKeepItems([
    ...memory.manual,
    ...kept.filter((item) => !memory.owned.some((owned) => itemsMatch(owned, item))),
  ]);
  const selectable = selectableAnalyzedItems(furniture, replacedItems);
  const owned = selectable.filter(
    (item) => !manual.some((mark) => itemsMatch(mark, item)),
  );
  const extras = kept.filter(
    (item) => !furniture.some((piece) => itemsMatch(piece.item, item)),
  );

  return {
    keepItems: uniqueKeepItems([...extras, ...selectable]),
    memory: { owned, manual },
  };
}

/** Clear checks the toggle selected. Manual checks stay. */
export function clearKeepSelectAll(
  keepItems: string[],
  memory: KeepToggleMemory,
  replacedItems: string[],
): { keepItems: string[]; memory: KeepToggleMemory } {
  const nextKeep = keepItems.filter(
    (item) => !memory.owned.some((owned) => itemsMatch(owned, item)),
  );
  const manual = memory.manual.filter(
    (item) =>
      nextKeep.some((kept) => itemsMatch(kept, item)) ||
      isReplacementTarget(item, replacedItems),
  );

  return {
    keepItems: nextKeep,
    memory: { owned: [], manual },
  };
}

export function setKeepItemChecked(
  item: string,
  checked: boolean,
  keepItems: string[],
  memory: KeepToggleMemory,
  selectAll: boolean,
  furniture: ExistingFurnitureItem[],
): { keepItems: string[]; memory: KeepToggleMemory; selectAll: boolean } {
  if (checked) {
    return {
      keepItems: uniqueKeepItems([...keepItems, item]),
      memory: {
        owned: withoutMatches(memory.owned, item),
        manual: uniqueKeepItems([...memory.manual, item]),
      },
      selectAll,
    };
  }

  const analyzed = furniture.some((piece) => itemsMatch(piece.item, item));

  return {
    keepItems: withoutMatches(keepItems, item),
    memory: {
      owned: withoutMatches(memory.owned, item),
      manual: withoutMatches(memory.manual, item),
    },
    selectAll: analyzed ? false : selectAll,
  };
}
