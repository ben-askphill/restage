import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyKeepSelectAll,
  clearKeepSelectAll,
  emptyKeepToggleMemory,
  selectableAnalyzedItems,
  setKeepItemChecked,
  type KeepToggleMemory,
} from "./keep-selection";
import type { ExistingFurnitureItem } from "./schemas";

const SOFA = "beige three-seat sofa against the far wall";
const TABLE = "round marble coffee table";
const LAMP = "arched brass floor lamp";
const EXTRA = "vintage radio";

const furniture: ExistingFurnitureItem[] = [
  { item: SOFA, keep: false, note: "" },
  { item: TABLE, keep: false, note: "" },
  { item: LAMP, keep: false, note: "" },
];

function names(items: string[]): string[] {
  return [...items].sort();
}

describe("keep select all", () => {
  it("checks every analyzed item except replacement targets", () => {
    const next = applyKeepSelectAll(
      [],
      emptyKeepToggleMemory(),
      furniture,
      [TABLE],
    );

    assert.deepEqual(names(next.keepItems), names([SOFA, LAMP]));
    assert.deepEqual(names(next.memory.owned), names([SOFA, LAMP]));
    assert.deepEqual(next.memory.manual, []);
    assert.equal(
      selectableAnalyzedItems(furniture, []).length,
      furniture.length,
    );
  });

  it("does not take ownership of a check the user already made", () => {
    const next = applyKeepSelectAll(
      [LAMP],
      emptyKeepToggleMemory(),
      furniture,
      [],
    );

    assert.deepEqual(names(next.keepItems), names([SOFA, TABLE, LAMP]));
    assert.deepEqual(names(next.memory.owned), names([SOFA, TABLE]));
    assert.deepEqual(next.memory.manual, [LAMP]);

    const cleared = clearKeepSelectAll(next.keepItems, next.memory, []);
    assert.deepEqual(cleared.keepItems, [LAMP]);
    assert.deepEqual(cleared.memory.owned, []);
    assert.deepEqual(cleared.memory.manual, [LAMP]);
  });

  it("drops a new replacement target and selects it again when it is no longer replaced", () => {
    const selected = applyKeepSelectAll(
      [],
      emptyKeepToggleMemory(),
      furniture,
      [],
    );
    const replaced = applyKeepSelectAll(
      selected.keepItems.filter((item) => item !== TABLE),
      selected.memory,
      furniture,
      [TABLE],
    );

    assert.equal(replaced.keepItems.includes(TABLE), false);
    assert.equal(replaced.memory.owned.includes(TABLE), false);

    const restored = applyKeepSelectAll(
      replaced.keepItems,
      replaced.memory,
      furniture,
      [],
    );
    assert.equal(restored.keepItems.includes(TABLE), true);
    assert.equal(restored.memory.owned.includes(TABLE), true);
  });

  it("keeps a manual item manual when it stops being a replacement target", () => {
    const selected = applyKeepSelectAll(
      [LAMP],
      emptyKeepToggleMemory(),
      furniture,
      [],
    );
    const replaced = applyKeepSelectAll(
      selected.keepItems.filter((item) => item !== LAMP),
      selected.memory,
      furniture,
      [LAMP],
    );
    assert.equal(replaced.keepItems.includes(LAMP), false);
    assert.ok(replaced.memory.manual.some((item) => item === LAMP));

    const restored = applyKeepSelectAll(
      replaced.keepItems,
      replaced.memory,
      furniture,
      [],
    );
    assert.equal(restored.keepItems.includes(LAMP), true);
    assert.equal(
      restored.memory.owned.some((item) => item === LAMP),
      false,
    );

    const cleared = clearKeepSelectAll(restored.keepItems, restored.memory, []);
    assert.equal(cleared.keepItems.includes(LAMP), true);
    assert.equal(cleared.keepItems.includes(SOFA), false);
  });

  it("leaves a typed keep item in place when the toggle turns off", () => {
    const selected = applyKeepSelectAll(
      [],
      emptyKeepToggleMemory(),
      furniture,
      [],
    );
    const withExtra = setKeepItemChecked(
      EXTRA,
      true,
      [...selected.keepItems, EXTRA],
      selected.memory,
      true,
      furniture,
    );
    const cleared = clearKeepSelectAll(
      withExtra.keepItems,
      withExtra.memory,
      [],
    );

    assert.deepEqual(cleared.keepItems, [EXTRA]);
  });

  it("stops select-all when the user unchecks an analyzed item, and a later recheck is manual", () => {
    const selected = applyKeepSelectAll(
      [],
      emptyKeepToggleMemory(),
      furniture,
      [],
    );
    const unchecked = setKeepItemChecked(
      SOFA,
      false,
      selected.keepItems,
      selected.memory,
      true,
      furniture,
    );

    assert.equal(unchecked.selectAll, false);
    assert.equal(unchecked.keepItems.includes(SOFA), false);
    assert.equal(unchecked.keepItems.includes(TABLE), true);
    assert.equal(unchecked.keepItems.includes(LAMP), true);

    const rechecked = setKeepItemChecked(
      SOFA,
      true,
      unchecked.keepItems,
      unchecked.memory,
      unchecked.selectAll,
      furniture,
    );
    assert.ok(rechecked.memory.manual.includes(SOFA));
    assert.equal(
      rechecked.memory.owned.some((item) => item === SOFA),
      false,
    );

    const cleared = clearKeepSelectAll(
      rechecked.keepItems,
      rechecked.memory,
      [],
    );
    assert.equal(cleared.keepItems.includes(SOFA), true);
    assert.equal(cleared.keepItems.includes(TABLE), false);
    assert.equal(cleared.keepItems.includes(LAMP), false);
  });

  it("is stable when applied twice", () => {
    let memory: KeepToggleMemory = emptyKeepToggleMemory();
    let keepItems = [LAMP, EXTRA];
    const first = applyKeepSelectAll(keepItems, memory, furniture, [TABLE]);
    const second = applyKeepSelectAll(
      first.keepItems,
      first.memory,
      furniture,
      [TABLE],
    );

    assert.deepEqual(second.keepItems, first.keepItems);
    assert.deepEqual(second.memory.owned, first.memory.owned);
    assert.deepEqual(second.memory.manual, first.memory.manual);
    memory = second.memory;
    keepItems = second.keepItems;
    assert.equal(keepItems.includes(TABLE), false);
    assert.equal(keepItems.includes(EXTRA), true);
    assert.equal(memory.manual.includes(LAMP), true);
    assert.equal(memory.manual.includes(EXTRA), true);
  });
});
