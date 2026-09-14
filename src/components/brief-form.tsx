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
import { Badge } from "@/components/ui/badge";
import type { UserBriefInput } from "@/lib/ai/schemas";

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

type BriefFormProps = {
  value: UserBriefInput;
  onChange: (value: UserBriefInput) => void;
};

export function BriefForm({ value, onChange }: BriefFormProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="roomType">Room type</Label>
          <Select
            value={value.roomType}
            onValueChange={(v) => {
              if (v) onChange({ ...value, roomType: v });
            }}
          >
            <SelectTrigger id="roomType">
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
          <Label htmlFor="budget">Budget tier</Label>
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
            <SelectTrigger id="budget">
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

      <div className="space-y-2">
        <Label htmlFor="style">Style direction</Label>
        <Input
          id="style"
          value={value.style}
          onChange={(e) => onChange({ ...value, style: e.target.value })}
          placeholder="e.g. warm Japandi with walnut accents"
        />
        <div className="flex flex-wrap gap-2 pt-1">
          {STYLE_PRESETS.map((preset) => (
            <Badge
              key={preset}
              variant={value.style === preset ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => onChange({ ...value, style: preset })}
            >
              {preset}
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="region">Region</Label>
        <Input
          id="region"
          value={value.region}
          onChange={(e) => onChange({ ...value, region: e.target.value })}
          placeholder="e.g. Netherlands, United States"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="function">How is the room used?</Label>
        <Textarea
          id="function"
          value={value.function}
          onChange={(e) => onChange({ ...value, function: e.target.value })}
          placeholder="e.g. WFH by day, hosting in the evening"
          rows={2}
        />
      </div>
    </div>
  );
}
