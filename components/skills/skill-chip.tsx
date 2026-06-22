"use client";

import { X } from "lucide-react";
import type { ProfileSkill } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Slider } from "../ui/slider";

export interface SkillChipProps {
  skill: ProfileSkill;
  onWeightChange: (weight: number) => void;
  onRemove: () => void;
}

// Weight buckets -> label/color (matches §2 weight tiers 1.0 / 0.8 / 0.4).
function weightTier(w: number): { label: string; cls: string } {
  if (w >= 0.85) return { label: "Core", cls: "text-fit-strong" };
  if (w >= 0.55) return { label: "Strong", cls: "text-fit-good" };
  if (w >= 0.3) return { label: "Nice", cls: "text-fit-stretch" };
  return { label: "Minor", cls: "text-muted-foreground" };
}

export function SkillChip({ skill, onWeightChange, onRemove }: SkillChipProps) {
  const tier = weightTier(skill.weight);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {skill.skill}
          </span>
          <span className={cn("text-[11px] font-semibold", tier.cls)}>
            {tier.label} · {skill.weight.toFixed(1)}
          </span>
        </div>
        <Slider
          aria-label={`${skill.skill} weight`}
          min={0}
          max={1}
          step={0.1}
          value={skill.weight}
          onValueChange={onWeightChange}
          className="mt-2"
        />
      </div>
      <button
        type="button"
        aria-label={`Remove ${skill.skill}`}
        onClick={onRemove}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
