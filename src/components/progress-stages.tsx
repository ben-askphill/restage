"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  { id: "analyze", label: "Analyzing room" },
  { id: "design", label: "Designing" },
  { id: "render", label: "Rendering" },
  { id: "shop", label: "Sourcing furniture" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

type ProgressStagesProps = {
  currentStage: StageId | null;
  completedStages: StageId[];
  statusText?: string;
};

export function ProgressStages({
  currentStage,
  completedStages,
  statusText,
}: ProgressStagesProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
        {STAGES.map((stage, index) => {
          const isComplete = completedStages.includes(stage.id);
          const isCurrent = currentStage === stage.id;
          const isPending = !isComplete && !isCurrent;

          return (
            <div key={stage.id} className="flex items-center gap-2">
              <div
                className={cn(
                  "flex size-7 items-center justify-center rounded-full border text-xs",
                  isComplete && "border-accent bg-accent text-accent-foreground",
                  isCurrent && "border-accent text-accent",
                  isPending && "border-muted-foreground/30 text-muted-foreground",
                )}
              >
                {isComplete ? (
                  <Check className="size-3.5" />
                ) : isCurrent ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-sm",
                  isCurrent && "font-medium",
                  isPending && "text-muted-foreground",
                )}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
      {statusText && (
        <p className="text-sm text-muted-foreground animate-pulse">{statusText}</p>
      )}
    </div>
  );
}
