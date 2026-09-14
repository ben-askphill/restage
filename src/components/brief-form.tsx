"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UserBriefInput } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

const ROOM_TYPES = [
  "Living room",
  "Bedroom",
  "Kitchen",
  "Dining room",
  "Home office",
  "Bathroom",
  "Nursery",
  "Entryway",
];

const STYLE_PRESETS = [
  "Japandi",
  "Mid-century",
  "Warm minimal",
  "Industrial",
  "Classic",
  "Scandinavian",
  "Bohemian",
  "Contemporary",
];

const fieldClass =
  "h-[52px] w-full rounded-2xl border-transparent bg-muted px-5 text-[15px] font-medium dark:bg-muted";

const labelClass = "text-sm font-bold";

type BriefFormProps = {
  value: UserBriefInput;
  onChange: (value: UserBriefInput) => void;
};

export function BriefForm({ value, onChange }: BriefFormProps) {
  return (
    <div className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="roomType" className={labelClass}>
            Room type
          </Label>
          <Select
            value={value.roomType}
            onValueChange={(v) => {
              if (v) onChange({ ...value, roomType: v });
            }}
          >
            <SelectTrigger id="roomType" className={fieldClass}>
              <SelectValue placeholder="Select room type" />
            </SelectTrigger>
            <SelectContent>
              {ROOM_TYPES.map((type) => (
                <SelectItem key={type} value={type.toLowerCase()}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="budget" className={labelClass}>
            Budget tier
          </Label>
          <Select
            value={value.budgetTier}
            onValueChange={(v) => {
              if (v) {
                onChange({
                  ...value,
                  budgetTier: v as UserBriefInput["budgetTier"],
                });
              }
            }}
          >
            <SelectTrigger id="budget" className={fieldClass}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="budget">Budget</SelectItem>
              <SelectItem value="mid">Mid</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2.5">
        <Label htmlFor="style" className={labelClass}>
          Style direction
        </Label>
        <Input
          id="style"
          value={value.style}
          onChange={(e) => onChange({ ...value, style: e.target.value })}
          placeholder="e.g. warm Japandi with walnut accents"
          className={cn(fieldClass, "placeholder:text-faint")}
        />
        <div className="flex flex-wrap gap-2 pt-1">
          {STYLE_PRESETS.map((preset) => {
            const selected = value.style === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => onChange({ ...value, style: preset })}
                className={cn(
                  "rounded-full px-4 py-2.5 text-sm font-semibold transition-colors",
                  selected
                    ? "bg-foreground text-background"
                    : "bg-muted hover:bg-[#ece8e2]",
                )}
              >
                {preset}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="region" className={labelClass}>
            Region
          </Label>
          <Input
            id="region"
            value={value.region}
            onChange={(e) => onChange({ ...value, region: e.target.value })}
            placeholder="e.g. Netherlands, United States"
            className={cn(fieldClass, "placeholder:text-faint")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="function" className={labelClass}>
            How is the room used?
          </Label>
          <Textarea
            id="function"
            value={value.function}
            onChange={(e) => onChange({ ...value, function: e.target.value })}
            placeholder="e.g. WFH by day, hosting in the evening"
            rows={1}
            className="min-h-[52px] w-full rounded-2xl border-transparent bg-muted px-5 py-3.5 text-[15px] font-medium placeholder:text-faint dark:bg-muted"
          />
        </div>
      </div>
    </div>
  );
}
