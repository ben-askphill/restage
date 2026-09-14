"use client";

import { useCallback, useRef, useState } from "react";
import { X, Camera, Images, PencilRuler, FileImage } from "lucide-react";
import { cn } from "@/lib/utils";

type UploadZoneProps = {
  label: string;
  description: string;
  badge: "Required" | "Optional";
  files: File[];
  onChange: (files: File[]) => void;
  multiple?: boolean;
  accept?: string;
};

const ICONS: Record<string, typeof Camera> = {
  "Room photo": Camera,
  "Style references": Images,
  "Floor plan": PencilRuler,
};

export function UploadZone({
  label,
  description,
  badge,
  files,
  onChange,
  multiple = false,
  accept = "image/*",
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const Icon = ICONS[label] ?? Camera;

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const list = Array.from(incoming);
      if (multiple) {
        onChange([...files, ...list]);
      } else {
        onChange(list.slice(0, 1));
      }
    },
    [files, multiple, onChange],
  );

  const removeFile = (index: number) => {
    onChange(files.filter((_, i) => i !== index));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) {
      addFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-3 rounded-3xl bg-muted px-6 py-10 text-center transition-colors",
          dragging ? "bg-tint" : "hover:bg-[#ece8e2]",
        )}
      >
        <div className="flex size-[60px] items-center justify-center rounded-full bg-background">
          <Icon className="size-[26px] text-primary" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <span className="text-[17px] font-bold">{label}</span>
          <span className="text-sm text-muted-foreground">{description}</span>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-bold",
            badge === "Required"
              ? "bg-tint text-tint-foreground"
              : "bg-background text-muted-foreground",
          )}
        >
          {badge}
        </span>
        <span className="text-[13px] text-faint">
          Drag &amp; drop or click to upload
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="group relative size-20 overflow-hidden rounded-2xl bg-muted"
            >
              {file.type.startsWith("image/") ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt={file.name}
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <FileImage className="size-6 text-muted-foreground" />
                </div>
              )}
              <button
                type="button"
                className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  removeFile(index);
                }}
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
