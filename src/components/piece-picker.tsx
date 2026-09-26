"use client";

import { useCallback, useRef, useState } from "react";
import { Lamp, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  labelFromFilename,
  MAX_PIECE_REFERENCES,
} from "@/lib/ai/piece-meta";
import type { ExistingFurnitureItem, PieceIntent } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

export type PieceDraft = {
  id: string;
  file: File;
  previewUrl: string;
  label: string;
  intent: PieceIntent;
  replaces: string;
};

type PiecePickerProps = {
  pieces: PieceDraft[];
  onChange: (pieces: PieceDraft[]) => void;
  furniture?: ExistingFurnitureItem[];
  disabled?: boolean;
};

function newDraft(file: File): PieceDraft {
  return {
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
    label: labelFromFilename(file.name),
    intent: "add",
    replaces: "",
  };
}

function IntentToggle({
  value,
  disabled,
  onChange,
}: {
  value: PieceIntent;
  disabled: boolean;
  onChange: (intent: PieceIntent) => void;
}) {
  const options: Array<{ intent: PieceIntent; label: string; hint: string }> = [
    { intent: "replace", label: "Replace", hint: "Swap an existing item" },
    { intent: "add", label: "Add", hint: "Place this in the room" },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="How to use this piece"
      className="inline-flex rounded-full bg-muted p-1"
    >
      {options.map((option) => {
        const selected = value === option.intent;
        return (
          <button
            key={option.intent}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            title={option.hint}
            onClick={() => onChange(option.intent)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-colors disabled:opacity-50",
              selected
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function PiecePicker({
  pieces,
  onChange,
  furniture = [],
  disabled = false,
}: PiecePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const remaining = MAX_PIECE_REFERENCES - pieces.length;
  const canAdd = remaining > 0 && !disabled;

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      if (!canAdd) return;
      const images = Array.from(incoming).filter(
        (file) =>
          file.type.startsWith("image/") ||
          /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name),
      );
      if (images.length === 0) return;
      const next = images.slice(0, remaining).map(newDraft);
      onChange([...pieces, ...next]);
    },
    [canAdd, onChange, pieces, remaining],
  );

  const update = (id: string, patch: Partial<PieceDraft>) => {
    onChange(
      pieces.map((piece) =>
        piece.id === id ? { ...piece, ...patch } : piece,
      ),
    );
  };

  const remove = (id: string) => {
    const piece = pieces.find((item) => item.id === id);
    if (piece) URL.revokeObjectURL(piece.previewUrl);
    onChange(pieces.filter((item) => item.id !== id));
  };

  const setIntent = (id: string, intent: PieceIntent) => {
    onChange(
      pieces.map((piece) => {
        if (piece.id !== id) return piece;
        switch (intent) {
          case "add":
            return { ...piece, intent, replaces: "" };
          case "replace":
            return { ...piece, intent };
          default: {
            const _exhaustive: never = intent;
            throw new Error(`Unhandled piece intent: ${_exhaustive}`);
          }
        }
      }),
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-[17px] font-bold">Your pieces</p>
        <p className="text-sm font-medium text-muted-foreground">
          Upload a sofa, lamp, rug, or other item. Choose{" "}
          <span className="text-foreground">Replace</span> to swap something
          already in the room, or <span className="text-foreground">Add</span>{" "}
          to place it as a new piece. This is not a style folder.
        </p>
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (canAdd) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (canAdd && event.dataTransfer.files.length) {
            addFiles(event.dataTransfer.files);
          }
        }}
        onClick={() => {
          if (canAdd) inputRef.current?.click();
        }}
        className={cn(
          "flex flex-col items-center gap-2 rounded-3xl bg-muted px-6 py-8 text-center transition-colors",
          canAdd ? "cursor-pointer hover:bg-[#ece8e2]" : "cursor-not-allowed opacity-60",
          dragging && "bg-tint",
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-full bg-background">
          <Lamp className="size-5 text-primary" />
        </div>
        <span className="text-[15px] font-bold">
          {canAdd ? "Upload piece photos" : "Piece limit reached"}
        </span>
        <span className="text-[13px] text-faint">
          {pieces.length} of {MAX_PIECE_REFERENCES} · drag &amp; drop or click
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          disabled={!canAdd}
          onChange={(event) => {
            if (event.target.files?.length) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {pieces.length > 0 && (
        <ul className="space-y-3">
          {pieces.map((piece, index) => (
            <li
              key={piece.id}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-3 sm:flex-row sm:items-start"
            >
              <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={piece.previewUrl}
                  alt={piece.label || `Piece ${index + 1}`}
                  className="size-full object-cover"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <IntentToggle
                    value={piece.intent}
                    disabled={disabled}
                    onChange={(intent) => setIntent(piece.id, intent)}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${piece.label || "piece"}`}
                    disabled={disabled}
                    onClick={() => remove(piece.id)}
                    className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor={`piece-label-${piece.id}`}
                    className="text-[13px] font-bold"
                  >
                    What is it?
                  </Label>
                  <Input
                    id={`piece-label-${piece.id}`}
                    value={piece.label}
                    onChange={(event) =>
                      update(piece.id, { label: event.target.value })
                    }
                    placeholder="e.g. walnut sofa, brass floor lamp"
                    disabled={disabled}
                    className="h-11 rounded-full border-transparent bg-muted px-4 text-[15px] font-medium placeholder:text-faint"
                  />
                </div>
                {piece.intent === "replace" ? (
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`piece-replaces-${piece.id}`}
                      className="text-[13px] font-bold"
                    >
                      Replace which item?
                    </Label>
                    {furniture.length > 0 ? (
                      <Select
                        value={piece.replaces || undefined}
                        onValueChange={(value) => {
                          if (value) update(piece.id, { replaces: value });
                        }}
                        disabled={disabled}
                      >
                        <SelectTrigger
                          id={`piece-replaces-${piece.id}`}
                          className="h-11 w-full rounded-full border-transparent bg-muted px-4 text-[15px] font-medium"
                        >
                          <SelectValue placeholder="Choose an item in the room" />
                        </SelectTrigger>
                        <SelectContent>
                          {furniture.map((item, itemIndex) => (
                            <SelectItem
                              key={`${item.item}-${itemIndex}`}
                              value={item.item}
                            >
                              {item.item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id={`piece-replaces-${piece.id}`}
                        value={piece.replaces}
                        onChange={(event) =>
                          update(piece.id, { replaces: event.target.value })
                        }
                        placeholder="e.g. grey sofa, current rug"
                        disabled={disabled}
                        className="h-11 rounded-full border-transparent bg-muted px-4 text-[15px] font-medium placeholder:text-faint"
                      />
                    )}
                    {furniture.length === 0 ? (
                      <p className="text-[12px] text-muted-foreground">
                        Analyze the room first to pick from detected furniture.
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
