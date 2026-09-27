"use client";

import { useState } from "react";
import { MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ImageNote } from "@/lib/image-notes";

type DraftPin = {
  x: number;
  y: number;
  text: string;
};

type RenderNotesProps = {
  src: string;
  notes: ImageNote[];
  onChange: (notes: ImageNote[]) => void;
  disabled?: boolean;
};

export function RenderNotes({
  src,
  notes,
  onChange,
  disabled = false,
}: RenderNotesProps) {
  const [draft, setDraft] = useState<DraftPin | null>(null);

  const placeDraft = (event: React.MouseEvent<HTMLImageElement>) => {
    if (disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const x = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
    setDraft({ x, y, text: draft?.text ?? "" });
  };

  const saveDraft = () => {
    if (!draft || !draft.text.trim()) return;
    onChange([
      ...notes,
      {
        id: crypto.randomUUID(),
        x: draft.x,
        y: draft.y,
        text: draft.text.trim(),
      },
    ]);
    setDraft(null);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <h3 className="text-[22px] font-extrabold tracking-[-0.02em]">
          Comment on this render
        </h3>
        <p className="font-medium text-muted-foreground">
          Click a part of the image, leave a note, and Refine will use it.
        </p>
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Rendered room. Click to pin a comment."
          onClick={placeDraft}
          className="block w-full cursor-crosshair"
          draggable={false}
        />
        {notes.map((note, index) => (
          <span
            key={note.id}
            className="pointer-events-none absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground shadow-sm"
            style={{ left: `${note.x}%`, top: `${note.y}%` }}
          >
            {index + 1}
          </span>
        ))}
        {draft ? (
          <span
            className="pointer-events-none absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary bg-background text-primary shadow-sm"
            style={{ left: `${draft.x}%`, top: `${draft.y}%` }}
          >
            <MapPin className="size-3.5" />
          </span>
        ) : null}
      </div>

      {draft ? (
        <form
          className="space-y-3 rounded-2xl border border-border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            saveDraft();
          }}
        >
          <p className="text-sm font-bold">
            Note at {Math.round(draft.x)}% across, {Math.round(draft.y)}% down
          </p>
          <Textarea
            value={draft.text}
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, text: event.target.value } : current,
              )
            }
            placeholder="e.g. make this lamp brass"
            disabled={disabled}
            rows={2}
            className="min-h-[72px] w-full rounded-2xl border-transparent bg-muted px-4 py-3 text-[15px] font-medium placeholder:text-faint"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={disabled || !draft.text.trim()}
              className="h-11 rounded-full px-5 text-[15px] font-bold"
            >
              Add note
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDraft(null)}
              className="h-11 rounded-full px-5 text-[15px] font-bold"
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {notes.length > 0 ? (
        <ul className="space-y-2">
          {notes.map((note, index) => (
            <li
              key={note.id}
              className="flex items-start gap-3 rounded-2xl bg-muted px-4 py-3"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 text-[15px] font-medium">
                {note.text}
              </span>
              <button
                type="button"
                aria-label={`Remove note ${index + 1}`}
                disabled={disabled}
                onClick={() => onChange(notes.filter((item) => item.id !== note.id))}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
