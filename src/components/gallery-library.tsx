"use client";

import { useEffect, useState } from "react";
import { Download, Images, Loader2, Trash2 } from "lucide-react";
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

export function GalleryLibrary({
  revision,
  onBack,
  onChanged,
}: GalleryLibraryProps) {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

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
          className="h-12 rounded-full px-6 text-[15px] font-bold"
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
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.url}
                alt={`${entry.roomType} generation`}
                className="w-full bg-muted"
              />
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
                    className="h-10 gap-2 rounded-full px-4 text-[14px] font-bold"
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
                    className="h-10 gap-2 rounded-full px-4 text-[14px] font-bold"
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
    </section>
  );
}
