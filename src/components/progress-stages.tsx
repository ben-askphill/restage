"use client";

import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export const FLOW_STAGES = [
  { id: "space", label: "Upload" },
  { id: "pieces", label: "Pieces" },
  { id: "style", label: "Style" },
  { id: "render", label: "Render" },
  { id: "source", label: "Source" },
] as const;

export type FlowStageId = (typeof FLOW_STAGES)[number]["id"];

type ProgressStagesProps = {
  viewed: FlowStageId;
  completed: FlowStageId[];
  available: FlowStageId[];
  busyStage?: FlowStageId | null;
  locked?: boolean;
  statusText?: string;
  onSelect: (stage: FlowStageId) => void;
};

export function ProgressStages({
  viewed,
  completed,
  available,
  busyStage = null,
  locked = false,
  statusText,
  onSelect,
}: ProgressStagesProps) {
  return (
    <div>
      <nav aria-label="Restage progress">
        <ol className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 sm:gap-x-3.5">
          {FLOW_STAGES.map((stage, index) => {
            const isComplete = completed.includes(stage.id);
            const isViewed = viewed === stage.id;
            const isBusy = busyStage === stage.id;
            const isAvailable = available.includes(stage.id);
            const isPending = !isComplete && !isViewed && !isBusy;

            return (
              <li key={stage.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={isViewed ? "step" : undefined}
                  disabled={!isAvailable || locked}
                  onClick={() => onSelect(stage.id)}
                  className="flex items-center gap-1.5 rounded-lg disabled:cursor-not-allowed"
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full text-[13px] font-bold",
                      isComplete && "bg-primary text-primary-foreground",
                      (isViewed || isBusy) &&
                        !isComplete &&
                        "border-2 border-primary text-primary",
                      isViewed &&
                        isComplete &&
                        "ring-2 ring-primary ring-offset-2",
                      isPending && "border-2 border-[#ddd5cc] text-faint",
                    )}
                  >
                    {isBusy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : isComplete ? (
                      <Check className="size-[15px]" strokeWidth={3} />
                    ) : (
                      <span>{index + 1}</span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-[15px]",
                      isComplete || isViewed || isBusy
                        ? "font-bold"
                        : "font-medium",
                      isPending && "text-faint",
                      !isAvailable && "text-faint",
                    )}
                  >
                    {stage.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      {statusText ? (
        <p className="mt-0.5 animate-pulse text-center text-sm font-medium leading-tight text-muted-foreground">
          {statusText}
        </p>
      ) : null}
    </div>
  );
}
