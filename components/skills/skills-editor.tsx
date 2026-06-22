"use client";

import * as React from "react";
import { Info, Sparkles } from "lucide-react";
import type { ProfileSkill } from "@/lib/types";
import { EmptyState } from "../ui/empty-state";
import { Skeleton } from "../ui/skeleton";
import { Checkbox } from "../ui/checkbox";
import { useProfile, useUpdateProfile } from "../hooks/use-profile";
import { AddSkillCombobox } from "./add-skill-combobox";
import { FitImpactPanel } from "./fit-impact-panel";
import { ResumePasteSeeder } from "./resume-paste-seeder";
import { SkillChip } from "./skill-chip";
import { SKILL_CATEGORIES } from "./taxonomy";

const CATEGORY_ORDER = [...SKILL_CATEGORIES, "Other"];

function groupByCategory(
  skills: ProfileSkill[],
): { category: string; items: ProfileSkill[] }[] {
  const map = new Map<string, ProfileSkill[]>();
  for (const s of skills) {
    const cat = (SKILL_CATEGORIES as readonly string[]).includes(s.category)
      ? s.category
      : "Other";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(s);
  }
  return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
    category: c,
    items: (map.get(c) ?? []).sort((a, b) => b.weight - a.weight),
  }));
}

export function SkillsEditor() {
  const { data: profile, isLoading, isError } = useProfile();
  const updateProfile = useUpdateProfile();

  // Local skills array (optimistically edited; persisted on change, debounced).
  const [skills, setSkills] = React.useState<ProfileSkill[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (profile) setSkills(profile.skills);
  }, [profile]);

  const persist = React.useCallback(
    (next: ProfileSkill[], resumeText?: string) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setDirty(true);
      saveTimer.current = setTimeout(() => {
        updateProfile.mutate(
          resumeText != null
            ? { skills: next, resume_text: resumeText }
            : { skills: next },
          { onSettled: () => setDirty(false) },
        );
      }, 600);
    },
    [updateProfile],
  );

  const updateSkills = (next: ProfileSkill[], resumeText?: string) => {
    setSkills(next);
    persist(next, resumeText);
  };

  const onAdd = (skill: ProfileSkill) => {
    if (skills.some((s) => s.skill.toLowerCase() === skill.skill.toLowerCase()))
      return;
    updateSkills([...skills, skill]);
  };
  const onRemove = (name: string) =>
    updateSkills(skills.filter((s) => s.skill !== name));
  const onWeight = (name: string, weight: number) =>
    updateSkills(
      skills.map((s) => (s.skill === name ? { ...s, weight } : s)),
    );
  const onSeed = (incoming: ProfileSkill[], resumeText: string) => {
    const have = new Set(skills.map((s) => s.skill.toLowerCase()));
    const merged = [
      ...skills,
      ...incoming.filter((s) => !have.has(s.skill.toLowerCase())),
    ];
    updateSkills(merged, resumeText);
  };

  const grouped = React.useMemo(() => groupByCategory(skills), [skills]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full max-w-md" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full max-w-md" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Couldn't load your skills profile"
        description="Reload the page to try again."
        className="h-full"
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-primary" />
            Skills profile
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            These weighted skills drive every job’s fit score.
            {dirty ? " Saving…" : " Saved."}
          </p>
        </div>
        <ResumePasteSeeder onSeed={onSeed} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-5">
          <AddSkillCombobox
            existing={skills.map((s) => s.skill)}
            onAdd={onAdd}
          />

          {skills.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No skills yet"
              description="Add skills above or seed them from your résumé. Weight each from 0 to 1 to tune fit scoring."
            />
          ) : (
            <div className="space-y-5">
              {grouped.map(({ category, items }) => (
                <section key={category}>
                  <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {category}{" "}
                    <span className="opacity-60">({items.length})</span>
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {items.map((s) => (
                      <SkillChip
                        key={s.skill}
                        skill={s}
                        onWeightChange={(w) => onWeight(s.skill, w)}
                        onRemove={() => onRemove(s.skill)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {/* Weight legend */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Weights:</span>
            <span>
              <span className="font-semibold text-fit-strong">1.0 Core</span> —
              must-have
            </span>
            <span>
              <span className="font-semibold text-fit-good">0.8 Strong</span>
            </span>
            <span>
              <span className="font-semibold text-fit-stretch">0.4 Nice</span> —
              bonus
            </span>
          </div>
        </div>

        {/* Right rail */}
        <aside className="space-y-4">
          <FitImpactPanel threshold={70} pendingRecompute={dirty} />

          {/* LLM rationale toggle — clearly OFF by default (§7). Display only;
              the actual toggle is a GitHub Actions env flag (USE_LLM_RATIONALE)
              and not editable from the UI. */}
          <div className="rounded-lg border border-border bg-card p-4">
            <Checkbox
              checked={false}
              disabled
              onCheckedChange={() => {}}
              label={
                <span className="text-sm font-medium text-foreground">
                  LLM-written rationale
                </span>
              }
            />
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Off by default ($0). Enabled via the{" "}
              <code className="rounded bg-muted px-1">USE_LLM_RATIONALE</code>{" "}
              scraper flag, not from the UI.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
