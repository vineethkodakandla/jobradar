"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import type { ExperienceLevel, WorkType } from "@/lib/types";
import {
  activeFilterCount,
  FIT_BAND_VALUES,
  STATUS_FILTER_VALUES,
} from "@/lib/filters";
import { cn, formatSalary } from "@/lib/utils";
import type { UseJobFiltersResult } from "../hooks/use-job-filters";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Chip } from "../ui/chip";
import { Select } from "../ui/select";
import { Slider } from "../ui/slider";
import { Modal } from "../ui/modal";
import { KeywordSearch } from "./keyword-search";
import {
  DATE_POSTED_OPTIONS,
  EXPERIENCE_OPTIONS,
  ROLE_QUICK_PICKS,
  SOURCE_OPTIONS,
  US_STATES,
  WORKTYPE_OPTIONS,
} from "./us-states";

const MAX_SALARY = 300_000;
const SALARY_STEP = 10_000;

function Section({
  title,
  children,
  htmlFor,
}: {
  title: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-2 border-b border-border px-4 py-3">
      <label
        htmlFor={htmlFor}
        className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {title}
      </label>
      {children}
    </div>
  );
}

function toggleInList<T extends string>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value];
}

const STATUS_LABELS: Record<string, string> = {
  none: "Not tracked",
  saved: "Saved",
  applied: "Applied",
  phone_screen: "Phone screen",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
};

/** Debounced text input (350ms) so typing doesn't refetch on every keystroke. */
function DebouncedInput({
  id,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [local, setLocal] = React.useState(value);
  React.useEffect(() => setLocal(value), [value]);
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);
  return (
    <input
      id={id}
      type="text"
      aria-label={ariaLabel}
      placeholder={placeholder}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

interface FilterRailProps {
  controller: UseJobFiltersResult;
  /** Hide the saved-only-irrelevant pieces; saved page passes true. */
  scopedSaved?: boolean;
}

function FilterRailBody({ controller, scopedSaved }: FilterRailProps) {
  const { filters: f, set } = controller;

  return (
    <div className="flex flex-col">
      {/* Keyword search */}
      <Section title="Search">
        <KeywordSearch value={f.q} onChange={(q) => set({ q })} />
      </Section>

      {/* Role quick picks */}
      <Section title="Role">
        <div className="flex flex-wrap gap-1.5">
          {ROLE_QUICK_PICKS.map((r) => (
            <Chip
              key={r.label}
              active={f.q.toLowerCase() === r.q}
              onClick={() => set({ q: f.q.toLowerCase() === r.q ? "" : r.q })}
            >
              {r.label}
            </Chip>
          ))}
        </div>
      </Section>

      {/* Company */}
      <Section title="Company" htmlFor="company-filter">
        <DebouncedInput
          id="company-filter"
          ariaLabel="Filter by company name"
          placeholder="e.g. Stripe"
          value={f.company}
          onChange={(company) => set({ company })}
        />
      </Section>

      {/* Exclude keywords */}
      <Section title="Exclude keywords" htmlFor="exclude-kw">
        <DebouncedInput
          id="exclude-kw"
          ariaLabel="Exclude keywords, comma-separated"
          placeholder="e.g. senior, clearance"
          value={f.excludeKw.join(", ")}
          onChange={(s) =>
            set({
              excludeKw: s
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Comma-separated; hides matching title/description.
        </p>
      </Section>

      {/* Experience */}
      <Section title="Experience">
        <div className="flex flex-wrap gap-1.5">
          {EXPERIENCE_OPTIONS.map((e) => {
            const v = e.value as ExperienceLevel;
            return (
              <Chip
                key={e.value}
                active={f.level.includes(v)}
                onClick={() => set({ level: toggleInList(f.level, v) })}
              >
                {e.label}
              </Chip>
            );
          })}
        </div>
      </Section>

      {/* Location: remote-US toggle + states */}
      <Section title="Location">
        <Checkbox
          checked={f.remote}
          onCheckedChange={(remote) => set({ remote })}
          label="Remote (US)"
        />
        <div className="mt-2">
          <select
            multiple
            aria-label="Filter by US state"
            value={f.state}
            onChange={(e) =>
              set({
                state: Array.from(e.target.selectedOptions).map(
                  (o) => o.value,
                ),
              })
            }
            className="h-32 w-full rounded-lg border border-border bg-background px-2 py-1 text-sm scrollbar-thin focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Cmd/Ctrl-click for multiple. {f.state.length > 0 && `${f.state.length} selected.`}
          </p>
        </div>
      </Section>

      {/* Work type */}
      <Section title="Work type">
        <div className="flex flex-wrap gap-1.5">
          {WORKTYPE_OPTIONS.map((w) => {
            const v = w.value as WorkType;
            return (
              <Chip
                key={w.value}
                active={f.work.includes(v)}
                onClick={() => set({ work: toggleInList(f.work, v) })}
              >
                {w.label}
              </Chip>
            );
          })}
        </div>
        <div className="mt-2">
          <Checkbox
            checked={f.relocate}
            onCheckedChange={(relocate) => set({ relocate })}
            label="Only relocation-friendly"
          />
        </div>
      </Section>

      {/* Salary */}
      <Section title="Minimum salary" htmlFor="salary-min">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {f.salaryMin
              ? formatSalary(f.salaryMin, null)
              : "Any"}
          </span>
          <span className="text-xs text-muted-foreground">${MAX_SALARY / 1000}k+</span>
        </div>
        <Slider
          id="salary-min"
          aria-label="Minimum salary"
          min={0}
          max={MAX_SALARY}
          step={SALARY_STEP}
          value={f.salaryMin ?? 0}
          onValueChange={(v) => set({ salaryMin: v === 0 ? null : v })}
        />
        <div className="mt-2">
          <Checkbox
            checked={f.includeNoSalary}
            onCheckedChange={(includeNoSalary) => set({ includeNoSalary })}
            label="Include jobs with no salary listed"
          />
        </div>
      </Section>

      {/* Fit threshold */}
      <Section title="Minimum fit" htmlFor="fit-threshold">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {f.fit > 0 ? `${f.fit}+` : "Any"}
          </span>
        </div>
        <Slider
          id="fit-threshold"
          aria-label="Minimum fit score"
          min={0}
          max={100}
          step={1}
          value={f.fit}
          onValueChange={(fit) => set({ fit })}
        />
      </Section>

      {/* Fit band */}
      <Section title="Fit band">
        <div className="flex flex-wrap gap-1.5">
          {FIT_BAND_VALUES.map((b) => (
            <Chip
              key={b}
              active={f.fitBand.includes(b)}
              onClick={() => set({ fitBand: toggleInList(f.fitBand, b) })}
            >
              {b}
            </Chip>
          ))}
        </div>
      </Section>

      {/* Source */}
      {!scopedSaved && (
        <Section title="Source">
          <div className="flex flex-wrap gap-1.5">
            {SOURCE_OPTIONS.map((s) => (
              <Chip
                key={s.slug}
                active={f.src.includes(s.slug)}
                onClick={() => set({ src: toggleInList(f.src, s.slug) })}
              >
                {s.label}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      {/* Application status */}
      {!scopedSaved && (
        <Section title="Application status">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTER_VALUES.map((st) => (
              <Chip
                key={st}
                active={f.status.includes(st)}
                onClick={() => set({ status: toggleInList(f.status, st) })}
              >
                {STATUS_LABELS[st]}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      {/* Date posted */}
      <Section title="Date posted" htmlFor="date-posted">
        <Select
          id="date-posted"
          aria-label="Date posted"
          value={f.since}
          onValueChange={(v) =>
            set({ since: v as typeof f.since })
          }
          options={DATE_POSTED_OPTIONS}
          className="w-full"
        />
      </Section>
    </div>
  );
}

/**
 * The filter rail. On lg+ it renders inline (inside SplitView's left panel).
 * On smaller screens FeedShell renders <FilterRailSheet> instead.
 */
export function FilterRail(props: FilterRailProps) {
  return <FilterRailBody {...props} />;
}

/** Mobile entry point: a "Filters" button that opens the rail in a sheet. */
export function FilterRailSheet({ controller, scopedSaved }: FilterRailProps) {
  const [open, setOpen] = React.useState(false);
  const count = activeFilterCount(controller.filters);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className={cn(count > 0 && "border-primary/40 text-primary")}
      >
        <SlidersHorizontal className="h-4 w-4" />
        Filters
        {count > 0 && (
          <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
            {count}
          </span>
        )}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        side="right"
        title="Filters"
        labelledBy="filters-sheet-title"
      >
        <FilterRailBody controller={controller} scopedSaved={scopedSaved} />
        <div className="sticky bottom-0 flex gap-2 border-t border-border bg-card p-3">
          <Button
            variant="outline"
            size="md"
            className="flex-1"
            onClick={() => controller.reset()}
          >
            Clear all
          </Button>
          <Button size="md" className="flex-1" onClick={() => setOpen(false)}>
            Show results
          </Button>
        </div>
      </Modal>
    </>
  );
}
