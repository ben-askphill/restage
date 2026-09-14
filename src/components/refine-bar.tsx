"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

const REFINE_CHIPS = [
  "Warmer",
  "Cheaper",
  "More minimal",
  "Keep the sofa",
  "More color",
  "Less clutter",
];

type RefineBarProps = {
  onRefine: (instruction: string) => Promise<void>;
  disabled?: boolean;
};

export function RefineBar({ onRefine, disabled }: RefineBarProps) {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRefine = async (text: string) => {
    if (!text.trim() || loading) return;
    setLoading(true);
    try {
      await onRefine(text.trim());
      setInstruction("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sticky bottom-0 px-5 pb-5 sm:px-10">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 rounded-[28px] border border-border bg-background/95 p-4 shadow-[0_12px_32px_rgba(36,28,23,0.10)] backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-bold">Refine this design</span>
          {REFINE_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              disabled={disabled || loading}
              className="rounded-full bg-muted px-3.5 py-1.5 text-[13px] font-semibold transition-colors hover:bg-[#ece8e2] disabled:opacity-50"
              onClick={() => handleRefine(chip.toLowerCase())}
            >
              {chip}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRefine(instruction);
          }}
          className="flex gap-2.5"
        >
          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. swap the sofa for something in cognac leather"
            disabled={disabled || loading}
            className="h-12 grow rounded-full border-transparent bg-muted px-5 text-[15px] font-medium placeholder:text-faint dark:bg-muted"
          />
          <Button
            type="submit"
            disabled={disabled || loading || !instruction.trim()}
            className="h-12 rounded-full px-6 text-[15px] font-bold"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Refine"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
