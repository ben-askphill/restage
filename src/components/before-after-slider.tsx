"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronsLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";

type BeforeAfterSliderProps = {
  beforeSrc: string;
  afterSrc: string;
  className?: string;
};

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  className,
}: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    updatePosition(e.clientX);
  };

  const handlePointerUp = () => setDragging(false);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative aspect-[3/2] w-full overflow-hidden rounded-3xl bg-muted select-none sm:rounded-[32px]",
        className,
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <img
        src={afterSrc}
        alt="After redesign"
        className="absolute inset-0 size-full object-cover"
        draggable={false}
      />
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img
          src={beforeSrc}
          alt="Before"
          className="size-full object-cover"
          draggable={false}
        />
      </div>
      <div
        className="absolute inset-y-0 z-10 w-1 bg-white"
        style={{ left: `calc(${position}% - 2px)` }}
      >
        <div className="absolute top-1/2 left-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(36,28,23,0.25)]">
          <ChevronsLeftRight className="size-[18px] text-foreground" strokeWidth={2.5} />
        </div>
      </div>
      <div className="pointer-events-none absolute top-4 left-4 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-foreground sm:top-5 sm:left-5">
        Before
      </div>
      <div className="pointer-events-none absolute top-4 right-4 rounded-full bg-foreground px-4 py-2 text-[13px] font-bold text-background sm:top-5 sm:right-5">
        After
      </div>
    </div>
  );
}
