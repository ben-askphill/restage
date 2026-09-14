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
      <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
        {STAGES.map((stage, index) => {
          const isComplete = completedStages.includes(stage.id);
          const isCurrent = currentStage === stage.id;
          const isPending = !isComplete && !isCurrent;

          return (
            <div key={stage.id} className="flex items-center gap-2.5">
              <div
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-[13px] font-bold",
                  isComplete && "bg-primary text-primary-foreground",
                  isCurrent && "border-2 border-primary text-primary",
                  isPending && "border-2 border-[#ddd5cc] text-faint",
                )}
              >
                {isComplete ? (
                  <Check className="size-[15px]" strokeWidth={3} />
                ) : isCurrent ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-[15px]",
                  isComplete || isCurrent ? "font-bold" : "font-medium",
                  isPending && "text-faint",
                )}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>
      {statusText && (
        <p className="animate-pulse text-center text-sm font-medium text-muted-foreground">
          {statusText}
        </p>
      )}
    </div>
  );
}
