"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
    <div className="sticky bottom-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto max-w-4xl space-y-3 px-4 py-4">
        <p className="text-sm font-medium">Refine this design</p>
        <div className="flex flex-wrap gap-2">
          {REFINE_CHIPS.map((chip) => (
            <Badge
              key={chip}
              variant="outline"
              className="cursor-pointer hover:bg-accent hover:text-accent-foreground"
              onClick={() => handleRefine(chip.toLowerCase())}
            >
              {chip}
            </Badge>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRefine(instruction);
          }}
          className="flex gap-2"
        >
          <Input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. swap the sofa for something in cognac leather"
            disabled={disabled || loading}
          />
          <Button type="submit" disabled={disabled || loading || !instruction.trim()}>
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
