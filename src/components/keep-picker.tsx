"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExistingFurnitureItem } from "@/lib/ai/schemas";
import { itemsMatch } from "@/lib/ai/keep";

type KeepPickerProps = {
  furniture: ExistingFurnitureItem[];
  keepItems: string[];
  onChange: (keepItems: string[]) => void;
  disabled?: boolean;
};

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
      <div className="space-y-3">
        {furniture.map((piece, index) => {
          const id = `keep-${index}`;
          return (
            <div key={`${piece.item}-${index}`} className="flex items-start gap-3">
              <Checkbox
                id={id}
                checked={isKept(piece.item)}
                disabled={disabled}
                onCheckedChange={(value) =>
                  toggleItem(piece.item, value === true)
                }
              />
              <div className="space-y-0.5">
                <Label htmlFor={id} className="text-sm font-medium">
                  {piece.item}
                </Label>
                {piece.note ? (
                  <p className="text-xs text-muted-foreground">{piece.note}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {extras.length > 0 && (
        <div className="space-y-3">
          {extras.map((item) => {
            const id = `keep-extra-${item}`;
            return (
              <div key={item} className="flex items-start gap-3">
                <Checkbox
                  id={id}
                  checked
                  disabled={disabled}
                  onCheckedChange={(value) =>
                    toggleItem(item, value === true)
                  }
                />
                <Label htmlFor={id} className="text-sm font-medium">
                  {item}
                </Label>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex gap-2">
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
        />
        <Button
          type="button"
          variant="outline"
          onClick={addManualItem}
          disabled={disabled || !manualItem.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
