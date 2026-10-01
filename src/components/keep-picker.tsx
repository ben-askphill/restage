"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExistingFurnitureItem } from "@/lib/ai/schemas";
import { itemsMatch } from "@/lib/ai/keep";
import {
  applyKeepSelectAll,
  clearKeepSelectAll,
  setKeepItemChecked,
  type KeepToggleMemory,
} from "@/lib/ai/keep-selection";
import { cn } from "@/lib/utils";

export type KeepSelectionChange = {
  keepItems: string[];
  selectAll: boolean;
  memory: KeepToggleMemory;
};

type KeepPickerProps = {
  furniture: ExistingFurnitureItem[];
  keepItems: string[];
  selectAll: boolean;
  memory: KeepToggleMemory;
  onChange: (selection: KeepSelectionChange) => void;
  disabled?: boolean;
  /** Existing items the user is swapping out with an uploaded piece photo. */
  replacedItems?: string[];
};

type KeepRowProps = {
  item: string;
  note?: string;
  kept: boolean;
  disabled: boolean;
  replaced: boolean;
  onToggle: (checked: boolean) => void;
};

function KeepRow({
  item,
  note,
  kept,
  disabled,
  replaced,
  onToggle,
}: KeepRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={kept}
      disabled={disabled || replaced}
      onClick={() => onToggle(!kept)}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-2xl border px-4.5 py-3.5 text-left transition-colors disabled:opacity-50",
        replaced
          ? "border-border bg-muted/60"
          : kept
            ? "border-tint-border bg-tint"
            : "border-border bg-background hover:bg-muted/50",
      )}
    >
      <span
        className={cn(
          "flex size-[26px] shrink-0 items-center justify-center rounded-lg",
          kept && !replaced ? "bg-primary" : "border-2 border-[#cdc5bc]",
        )}
      >
        {kept && !replaced && (
          <Check className="size-3.5 text-primary-foreground" strokeWidth={3} />
        )}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold">{item}</span>
        {replaced ? (
          <span className="text-[13px] text-muted-foreground">
            Replaced by your uploaded piece
          </span>
        ) : note ? (
          <span className="text-[13px] text-muted-foreground">{note}</span>
        ) : null}
      </span>
    </button>
  );
}

export function KeepPicker({
  furniture,
  keepItems,
  selectAll,
  memory,
  onChange,
  disabled = false,
  replacedItems = [],
}: KeepPickerProps) {
  const [manualItem, setManualItem] = useState("");

  const isKept = (item: string) =>
    keepItems.some((keep) => itemsMatch(item, keep));

  const isReplaced = (item: string) =>
    replacedItems.some((target) => itemsMatch(item, target));

  const toggleSelectAll = () => {
    if (selectAll) {
      const next = clearKeepSelectAll(keepItems, memory, replacedItems);
      onChange({
        keepItems: next.keepItems,
        selectAll: false,
        memory: next.memory,
      });
      return;
    }
    const next = applyKeepSelectAll(
      keepItems,
      memory,
      furniture,
      replacedItems,
    );
    onChange({
      keepItems: next.keepItems,
      selectAll: true,
      memory: next.memory,
    });
  };

  const toggleItem = (item: string, checked: boolean) => {
    if (isReplaced(item)) return;
    const next = setKeepItemChecked(
      item,
      checked,
      keepItems,
      memory,
      selectAll,
      furniture,
    );
    onChange({
      keepItems: next.keepItems,
      selectAll: next.selectAll,
      memory: next.memory,
    });
  };

  const addManualItem = () => {
    const trimmed = manualItem.trim();
    if (!trimmed || isKept(trimmed) || isReplaced(trimmed)) {
      setManualItem("");
      return;
    }
    const next = setKeepItemChecked(
      trimmed,
      true,
      keepItems,
      memory,
      selectAll,
      furniture,
    );
    onChange({
      keepItems: next.keepItems,
      selectAll: next.selectAll,
      memory: next.memory,
    });
    setManualItem("");
  };

  const extras = keepItems.filter(
    (keep) => !furniture.some((piece) => itemsMatch(piece.item, keep)),
  );

  const selectAllDisabled = disabled || furniture.length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 space-y-1.5">
          <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">
            What should stay?
          </h2>
          <p className="font-medium text-muted-foreground">
            Check anything that should remain as it is. You can also type an
            item that was missed.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={selectAll}
          aria-label="Select all analyzed items except ones you are replacing"
          disabled={selectAllDisabled}
          onClick={toggleSelectAll}
          className="flex shrink-0 items-center gap-3 rounded-lg bg-muted py-2 pl-4 pr-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="flex flex-col">
            <span className="text-[15px] font-bold leading-tight">Select all</span>
            <span className="text-[12px] font-medium leading-tight text-muted-foreground">
              Except replaced items
            </span>
          </span>
          <span
            className={cn(
              "relative h-[26px] w-11 shrink-0 rounded-full transition-colors",
              selectAll ? "bg-primary" : "bg-[#ddd5cc]",
            )}
          >
            <span
              className={cn(
                "absolute top-[3px] size-5 rounded-full bg-white transition-all",
                selectAll ? "left-[21px]" : "left-[3px]",
              )}
            />
          </span>
        </button>
      </div>
      <div className="space-y-2.5">
        {furniture.map((piece, index) => (
          <KeepRow
            key={`${piece.item}-${index}`}
            item={piece.item}
            note={piece.note ?? undefined}
            kept={isKept(piece.item)}
            disabled={disabled}
            replaced={isReplaced(piece.item)}
            onToggle={(checked) => toggleItem(piece.item, checked)}
          />
        ))}
        {extras.map((item) => (
          <KeepRow
            key={`extra-${item}`}
            item={item}
            kept
            disabled={disabled}
            replaced={isReplaced(item)}
            onToggle={(checked) => toggleItem(item, checked)}
          />
        ))}
      </div>

      <div className="flex gap-2.5">
        <Input
          value={manualItem}
          onChange={(event) => setManualItem(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addManualItem();
            }
          }}
          placeholder="Add another keep item"
          disabled={disabled}
          className="h-12 grow rounded-lg border-transparent bg-muted px-5 text-[15px] font-medium placeholder:text-faint dark:bg-muted"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={addManualItem}
          disabled={disabled || !manualItem.trim()}
          className="h-12 rounded-lg px-6 text-[15px] font-bold"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
