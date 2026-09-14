"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { UploadZone } from "@/components/upload-zone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { callApi, fileToDataUrl } from "@/lib/client-api";
import {
  deleteStyle as deleteStyleApi,
  fetchStyle,
  fetchStyleSummaries,
} from "@/lib/styles-client";
import type { StyleForClient, StyleSummary } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

const NO_FILES: File[] = [];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

type MyStylesManagerProps = {
  /** Called after the style list changes (create, delete, or added images). */
  onStylesChanged?: () => void;
};

export function MyStylesManager({ onStylesChanged }: MyStylesManagerProps) {
  const [styles, setStyles] = useState<StyleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [openStyle, setOpenStyle] = useState<StyleForClient | null>(null);
  const [openLoading, setOpenLoading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const handleCreate = useCallback(async () => {
    const name = window.prompt("Name this style folder");
    if (!name || !name.trim()) return;

    setCreating(true);
    setError(null);
    try {
      await callApi<{ style: StyleForClient }>("/api/styles", {
        name: name.trim(),
      });
      await refresh();
      onStylesChanged?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setCreating(false);
    }
  }, [refresh, onStylesChanged]);

  const handleOpen = useCallback(async (id: string) => {
    setOpenId(id);
    setOpenStyle(null);
    setUploadStatus(null);
    setOpenLoading(true);
    setError(null);
    try {
      setOpenStyle(await fetchStyle(id));
    } catch (err) {
      setError(errorMessage(err));
      setOpenId(null);
    } finally {
      setOpenLoading(false);
    }
  }, []);

  const handleAddImages = useCallback(
    async (files: File[]) => {
      if (!openId || files.length === 0) return;
      setError(null);
      try {
        const dataUrls = await Promise.all(files.map(fileToDataUrl));
        const { style } = await callApi<{ style: StyleForClient }>(
          `/api/styles/${openId}/images`,
          { images: dataUrls },
          setUploadStatus,
        );
        setOpenStyle(style);
        await refresh();
        onStylesChanged?.();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setUploadStatus(null);
      }
    },
    [openId, refresh, onStylesChanged],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (
        !window.confirm(
          "Delete this style folder? Its saved images will be removed.",
        )
      ) {
        return;
      }
      setDeletingId(id);
      setError(null);
      try {
        await deleteStyleApi(id);
        if (openId === id) {
          setOpenId(null);
          setOpenStyle(null);
        }
        await refresh();
        onStylesChanged?.();
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setDeletingId(null);
      }
    },
    [openId, refresh, onStylesChanged],
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-medium">My Styles</h3>
          <p className="text-sm text-muted-foreground">
            Reusable inspiration folders. Add images and we derive a style
            profile automatically.
          </p>
        </div>
        {!openId && (
          <Button size="sm" onClick={handleCreate} disabled={creating}>
            {creating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Plus className="size-3.5" />
            )}
            New style
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          {error.includes("BLOB") || error.includes("AI_GATEWAY") ? (
            <p className="mt-2 text-xs opacity-80">
              Configure environment variables to enable saved styles.
            </p>
          ) : null}
        </div>
      )}

      {/* Detail view */}
      {openId ? (
        <div className="space-y-5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setOpenId(null);
              setOpenStyle(null);
              setUploadStatus(null);
            }}
          >
            <ArrowLeft className="size-3.5" />
            All styles
          </Button>

          {openLoading && !openStyle ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading style…
            </div>
          ) : openStyle ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-lg font-medium">{openStyle.name}</h4>
                  <p className="text-xs text-muted-foreground">
                    {openStyle.images.length} image
                    {openStyle.images.length === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDelete(openStyle.id)}
                  disabled={deletingId === openStyle.id}
                >
                  {deletingId === openStyle.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  Delete
                </Button>
              </div>

              {/* Derived profile */}
              {openStyle.profile ? (
                <div className="space-y-3 rounded-lg border p-4">
                  <p className="text-sm">{openStyle.profile.summary}</p>
                  <ChipRow label="Palette" items={openStyle.profile.palette} />
                  <ChipRow
                    label="Materials"
                    items={openStyle.profile.materials}
                    variant="outline"
                  />
                  <ChipRow
                    label="Keywords"
                    items={openStyle.profile.keywords}
                    variant="secondary"
                  />
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground">Mood:</span>{" "}
                      {openStyle.profile.mood}
                    </span>
                    <span>
                      <span className="font-medium text-foreground">
                        Finish:
                      </span>{" "}
                      {openStyle.profile.finishLevel}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                  Add inspiration images and a style profile is derived
                  automatically.
                </p>
              )}

              {/* Images */}
              {openStyle.images.length > 0 && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {openStyle.images.map((image) => (
                    <div
                      key={image.url}
                      className="aspect-square overflow-hidden rounded-md border bg-muted"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.url}
                        alt="Style inspiration"
                        className="size-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              )}

              <UploadZone
                label="Add images"
                description="Upload more inspiration to enrich this style"
                files={NO_FILES}
                onChange={handleAddImages}
                multiple
              />

              {uploadStatus && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {uploadStatus}
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        // Grid / list view
        <div>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading styles…
            </div>
          ) : styles.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <p className="text-sm font-medium">No saved styles yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a style folder and add inspiration images to reuse it in
                every redesign.
              </p>
              <Button
                size="sm"
                className="mt-4"
                onClick={handleCreate}
                disabled={creating}
              >
                <Plus className="size-3.5" />
                New style
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {styles.map((style) => (
                <div
                  key={style.id}
                  className="group relative overflow-hidden rounded-xl ring-1 ring-foreground/10"
                >
                  <button
                    type="button"
                    onClick={() => handleOpen(style.id)}
                    className="block w-full text-left"
                  >
                    <div className="aspect-video overflow-hidden bg-muted">
                      {style.thumbnailUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={style.thumbnailUrl}
                          alt={style.name}
                          className="size-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center">
                          <ImageIcon className="size-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="truncate text-sm font-medium">
                        {style.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {style.imageCount} image
                        {style.imageCount === 1 ? "" : "s"}
                      </p>
                      {style.summary && (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {style.summary}
                        </p>
                      )}
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-sm"
                    className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => handleDelete(style.id)}
                    disabled={deletingId === style.id}
                    aria-label={`Delete ${style.name}`}
                  >
                    {deletingId === style.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ChipRow({
  label,
  items,
  variant = "default",
}: {
  label: string;
  items: string[];
  variant?: "default" | "secondary" | "outline";
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
      </span>
      {items.map((item) => (
        <Badge key={item} variant={variant} className={cn("font-normal")}>
          {item}
        </Badge>
      ))}
    </div>
  );
}
