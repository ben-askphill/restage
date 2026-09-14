"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExistingFurnitureItem } from "@/lib/ai/schemas";
import { itemsMatch } from "@/lib/ai/keep";
import { cn } from "@/lib/utils";

type KeepPickerProps = {
  furniture: ExistingFurnitureItem[];
  keepItems: string[];
  onChange: (keepItems: string[]) => void;
  disabled?: boolean;
};

type KeepRowProps = {
  item: string;
  note?: string;
  kept: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
};

function KeepRow({ item, note, kept, disabled, onToggle }: KeepRowProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={kept}
      disabled={disabled}
      onClick={() => onToggle(!kept)}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-2xl border px-4.5 py-3.5 text-left transition-colors disabled:opacity-50",
        kept
          ? "border-tint-border bg-tint"
          : "border-border bg-background hover:bg-muted/50",
      )}
    >
      <span
        className={cn(
          "flex size-[26px] shrink-0 items-center justify-center rounded-lg",
          kept ? "bg-primary" : "border-2 border-[#cdc5bc]",
        )}
      >
        {kept && (
          <Check className="size-3.5 text-primary-foreground" strokeWidth={3} />
        )}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold">{item}</span>
        {note ? (
          <span className="text-[13px] text-muted-foreground">{note}</span>
        ) : null}
      </span>
    </button>
  );
}

export function KeepPicker({
  furniture,
  keepItems,
  onChange,
  disabled = false,
}: KeepPickerProps) {
  const [manualItem, setManualItem] = useState("");

  const isKept = (item: string) =>
    keepItems.some((keep) => itemsMatch(item, keep));

  const toggleItem = (item: string, checked: boolean) => {
    if (checked) {
      if (isKept(item)) return;
      onChange([...keepItems, item]);
      return;
    }
    onChange(keepItems.filter((keep) => !itemsMatch(item, keep)));
  };

  const addManualItem = () => {
    const trimmed = manualItem.trim();
    if (!trimmed || isKept(trimmed)) {
      setManualItem("");
      return;
    }
    onChange([...keepItems, trimmed]);
    setManualItem("");
  };

  const extras = keepItems.filter(
    (keep) => !furniture.some((piece) => itemsMatch(piece.item, keep)),
  );

  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        {furniture.map((piece, index) => (
          <KeepRow
            key={`${piece.item}-${index}`}
            item={piece.item}
            note={piece.note ?? undefined}
            kept={isKept(piece.item)}
            disabled={disabled}
            onToggle={(checked) => toggleItem(piece.item, checked)}
          />
        ))}
        {extras.map((item) => (
          <KeepRow
            key={`extra-${item}`}
            item={item}
            kept
            disabled={disabled}
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
          className="h-12 grow rounded-full border-transparent bg-muted px-5 text-[15px] font-medium placeholder:text-faint dark:bg-muted"
        />
        <Button
          type="button"
          variant="secondary"
          onClick={addManualItem}
          disabled={disabled || !manualItem.trim()}
          className="h-12 rounded-full px-6 text-[15px] font-bold"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
