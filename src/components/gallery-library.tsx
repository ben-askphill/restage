"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Images, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadBlob, downloadFilename } from "@/lib/download-image";
import {
  deleteGeneration,
  listGenerations,
  type GalleryRecord,
} from "@/lib/gallery-store";

type GalleryEntry = GalleryRecord & { url: string };

type GalleryLibraryProps = {
  revision: number;
  onBack: () => void;
  onChanged: () => void;
};

function formatWhen(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function GalleryLightbox({
  entry,
  onClose,
}: {
  entry: GalleryEntry;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div className="flex justify-end p-3 sm:p-4">
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className="flex size-11 items-center justify-center rounded-full bg-background text-foreground shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4 sm:px-10 sm:pb-10">
        <h2 id={titleId} className="sr-only">
          {entry.roomType} generation
        </h2>
        {/* Blob URLs from the local gallery cannot be optimized by next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={entry.url}
          alt={`${entry.roomType} generation`}
          className="h-auto w-auto max-h-[calc(100dvh-7.5rem)] max-w-[calc(100vw-2rem)] rounded-lg object-contain sm:max-w-[calc(100vw-5rem)]"
          onClick={(event) => event.stopPropagation()}
        />
      </div>
    </div>,
    document.body,
  );
}

export function GalleryLibrary({
  revision,
  onBack,
  onChanged,
}: GalleryLibraryProps) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const created: string[] = [];

    listGenerations()
      .then((records) => {
        if (cancelled) return;
        const next = records.map((record) => {
          const url = URL.createObjectURL(record.image);
          created.push(url);
          return { ...record, url };
        });
        setEntries(next);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Couldn't open the gallery",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [revision]);

  const active = entries.find((entry) => entry.id === activeId) ?? null;

  const closeLightbox = useCallback(() => {
    setActiveId(null);
    const trigger = returnFocusRef.current;
    returnFocusRef.current = null;
    requestAnimationFrame(() => trigger?.focus());
  }, []);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-4xl font-extrabold tracking-[-0.025em]">
            Gallery
          </h1>
          <p className="font-medium text-muted-foreground">
            Every generation is saved here, so you can download it later.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          className="h-12 rounded-lg px-6 text-[15px] font-bold"
        >
          Back to design
        </Button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-destructive/50 bg-destructive/10 px-5 py-4 text-sm font-medium text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : entries.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl bg-muted px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-background">
            <Images className="size-5 text-primary" />
          </div>
          <p className="text-[17px] font-bold">No generations yet</p>
          <p className="max-w-sm text-sm font-medium text-muted-foreground">
            When you render a room, the image is stored in this gallery
            automatically.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="overflow-hidden rounded-3xl border border-border bg-background"
            >
              <button
                type="button"
                onClick={(event) => {
                  returnFocusRef.current = event.currentTarget;
                  setActiveId(entry.id);
                }}
                aria-label={`View ${entry.roomType} generation`}
                className="block w-full cursor-zoom-in bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-inset"
              >
                {/* Blob URLs from the local gallery cannot be optimized by next/image. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={entry.url}
                  alt=""
                  className="w-full"
                />
              </button>
              <div className="flex flex-col gap-3 p-4">
                <div className="space-y-1">
                  <p className="text-[15px] font-bold capitalize">
                    {entry.roomType}
                  </p>
                  <p className="text-[13px] font-medium text-muted-foreground">
                    {entry.styleLabel} · {entry.region}
                  </p>
                  <p className="text-[13px] text-faint">
                    {formatWhen(entry.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={downloadingId === entry.id}
                    onClick={() => {
                      setDownloadingId(entry.id);
                      try {
                        downloadBlob(
                          entry.image,
                          downloadFilename(entry.roomType, entry.mediaType),
                        );
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Couldn't download the image",
                        );
                      } finally {
                        setDownloadingId(null);
                      }
                    }}
                    className="h-10 gap-2 rounded-lg px-4 text-[14px] font-bold"
                  >
                    <Download className="size-4" />
                    Download
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={`Remove ${entry.roomType} generation`}
                    onClick={async () => {
                      try {
                        await deleteGeneration(entry.id);
                        onChanged();
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Couldn't remove that generation",
                        );
                      }
                    }}
                    className="h-10 gap-2 rounded-lg px-4 text-[14px] font-bold"
                  >
                    <Trash2 className="size-4" />
                    Remove
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {active ? <GalleryLightbox entry={active} onClose={closeLightbox} /> : null}
    </section>
  );
}
