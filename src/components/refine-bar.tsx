"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ImageNote } from "@/lib/image-notes";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

const REFINE_CHIPS = [
  "Warmer",
  "Cheaper",
  "More minimal",
  "Keep the sofa",
  "More color",
  "Less clutter",
];

const APPLY_PINNED_NOTES = "apply the comments I left.";

type RefineBarProps = {
  onRefine: (instruction: string) => Promise<void>;
  disabled?: boolean;
  notes?: ImageNote[];
  className?: string;
};

export function RefineBar({
  onRefine,
  disabled,
  notes = [],
  className,
}: RefineBarProps) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const allowEmpty = notes.length > 0;

  const handleRefine = async (text: string) => {
    if (loading) return;
    const trimmed = text.trim();
    const next = trimmed || (allowEmpty ? APPLY_PINNED_NOTES : "");
    if (!next) return;
    setLoading(true);
    try {
      await onRefine(next);
      setInstruction("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside
      aria-label="Refine this design"
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-[0_12px_32px_rgba(36,28,23,0.08)]",
        className,
      )}
    >
      <div className="shrink-0 space-y-1 border-b border-border px-5 py-4">
        <h2 className="text-lg font-extrabold tracking-[-0.02em]">
          Refine this design
        </h2>
        <p className="text-sm font-medium text-muted-foreground">
          Suggestions, a written change, or the notes you pinned on the image.
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-4">
        {notes.length > 0 ? (
          <div className="space-y-2.5">
            <p className="text-sm font-bold">Pinned comments</p>
            <ul className="space-y-2">
              {notes.map((note, index) => (
                <li
                  key={note.id}
                  className="flex items-start gap-2.5 rounded-2xl bg-muted px-3 py-2.5"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="min-w-0 text-sm font-medium">{note.text}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              disabled={disabled || loading}
              onClick={() => handleRefine(APPLY_PINNED_NOTES)}
              className="rounded-lg bg-tint px-3.5 py-1.5 text-[13px] font-semibold text-tint-foreground transition-colors hover:bg-[#f3d9cc] disabled:opacity-50"
            >
              Apply the comments I left
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {REFINE_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={disabled || loading}
              className="rounded-lg bg-muted px-3.5 py-1.5 text-[13px] font-semibold transition-colors hover:bg-[#ece8e2] disabled:opacity-50"
              onClick={() => handleRefine(chip.toLowerCase())}
            >
              {chip}
            </button>
          ))}
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          handleRefine(instruction);
        }}
        className="flex shrink-0 flex-col gap-2.5 border-t border-border px-5 py-4 sm:flex-row lg:flex-col"
      >
        <Input
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          placeholder="e.g. swap the sofa for something in cognac leather"
          disabled={disabled || loading}
          aria-label="Refinement instruction"
          className="h-12 min-w-0 grow rounded-lg border-transparent bg-muted px-5 text-[15px] font-medium placeholder:text-faint dark:bg-muted"
        />
        <Button
          type="submit"
          disabled={disabled || loading || (!instruction.trim() && !allowEmpty)}
          className="h-12 rounded-lg px-6 text-[15px] font-bold sm:shrink-0 lg:w-full"
        >
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Refine"}
        </Button>
      </form>
    </aside>
  );
}
