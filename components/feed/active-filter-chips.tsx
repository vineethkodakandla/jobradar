"use client";

import { activeFilterCount } from "@/lib/filters";
import { experienceLabel, formatSalary, workTypeLabel } from "@/lib/utils";
import type { UseJobFiltersResult } from "../hooks/use-job-filters";
import { Chip } from "../ui/chip";
import { stateName } from "./us-states";
import { SOURCE_OPTIONS, DATE_POSTED_OPTIONS } from "./us-states";

interface ActiveFilterChipsProps {
  controller: UseJobFiltersResult;
}

function sourceLabel(slug: string): string {
  return SOURCE_OPTIONS.find((s) => s.slug === slug)?.label ?? slug;
}

function sinceLabel(since: string): string {
  return DATE_POSTED_OPTIONS.find((d) => d.value === since)?.label ?? since;
}

/** Renders one removable chip per active filter, plus a "Clear all" button. */
export function ActiveFilterChips({ controller }: ActiveFilterChipsProps) {
  const { filters: f, set, reset } = controller;
  const count = activeFilterCount(f);
  if (count === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
      {f.q && (
        <Chip onRemove={() => set({ q: "" })}>“{f.q}”</Chip>
      )}
      {f.level.map((lvl) => (
        <Chip
          key={`lvl-${lvl}`}
          onRemove={() => set({ level: f.level.filter((v) => v !== lvl) })}
        >
          {experienceLabel(lvl)}
        </Chip>
      ))}
      {f.remote && <Chip onRemove={() => set({ remote: false })}>Remote</Chip>}
      {f.work.map((w) => (
        <Chip
          key={`work-${w}`}
          onRemove={() => set({ work: f.work.filter((v) => v !== w) })}
        >
          {workTypeLabel(w)}
        </Chip>
      ))}
      {f.state.map((st) => (
        <Chip
          key={`st-${st}`}
          onRemove={() => set({ state: f.state.filter((v) => v !== st) })}
        >
          {stateName(st)}
        </Chip>
      ))}
      {f.relocate && (
        <Chip onRemove={() => set({ relocate: false })}>Relocation-friendly</Chip>
      )}
      {f.salaryMin != null && (
        <Chip onRemove={() => set({ salaryMin: null })}>
          {formatSalary(f.salaryMin, null)}+
        </Chip>
      )}
      {f.fit > 0 && (
        <Chip onRemove={() => set({ fit: 0 })}>Fit {f.fit}+</Chip>
      )}
      {f.src.map((s) => (
        <Chip
          key={`src-${s}`}
          onRemove={() => set({ src: f.src.filter((v) => v !== s) })}
        >
          {sourceLabel(s)}
        </Chip>
      ))}
      {f.since !== "any" && (
        <Chip onRemove={() => set({ since: "any" })}>{sinceLabel(f.since)}</Chip>
      )}

      <button
        type="button"
        onClick={() => reset()}
        className="ml-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        Clear all
      </button>
    </div>
  );
}
