"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ImageIcon, Loader2, Settings2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MyStylesManager } from "@/components/my-styles-manager";
import { fetchStyleSummaries } from "@/lib/styles-client";
import type { StyleSummary } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

type StylePickerProps = {
  selected: string | null;
  onSelect: (id: string | null) => void;
};

export function StylePicker({ selected, onSelect }: StylePickerProps) {
  const [styles, setStyles] = useState<StyleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [managerOpen, setManagerOpen] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStyles(await fetchStyleSummaries());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const summaries = await fetchStyleSummaries();
        if (active) setStyles(summaries);
      } catch (err) {
        if (active) setError(errorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Close the manager overlay on Escape.
  useEffect(() => {
    if (!managerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setManagerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [managerOpen]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Style</p>
          <p className="text-xs text-muted-foreground">
            Pick a saved style, or manage your inspiration folders
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setManagerOpen(true)}
        >
          <Settings2 className="size-3.5" />
          Manage styles
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading styles…
        </div>
      ) : error ? (
        <p className="text-xs text-muted-foreground">
          Saved styles are unavailable. {error}
        </p>
      ) : styles.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-xs text-muted-foreground">
          No saved styles yet. Use “Manage styles” to create one from your
          inspiration images.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {styles.map((style) => {
            const isSelected = selected === style.id;
            return (
              <button
                key={style.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(isSelected ? null : style.id)}
                className={cn(
                  "group relative overflow-hidden rounded-xl text-left ring-1 transition",
                  isSelected
                    ? "ring-2 ring-primary"
                    : "ring-foreground/10 hover:ring-foreground/25",
                )}
              >
                <div className="aspect-video overflow-hidden bg-muted">
                  {style.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={style.thumbnailUrl}
                      alt={style.name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <ImageIcon className="size-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="space-y-0.5 p-2.5">
                  <p className="truncate text-sm font-medium">{style.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {style.imageCount} image
                    {style.imageCount === 1 ? "" : "s"}
                  </p>
                </div>
                {isSelected && (
                  <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {managerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Manage styles"
          onClick={() => setManagerOpen(false)}
        >
          <div
            className="my-8 w-full max-w-3xl rounded-xl bg-background p-6 shadow-lg ring-1 ring-foreground/10"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-medium">Manage styles</h3>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setManagerOpen(false)}
                aria-label="Close"
              >
                <X className="size-4" />
              </Button>
            </div>
            <MyStylesManager onStylesChanged={refresh} />
          </div>
        </div>
      )}
    </div>
  );
}
