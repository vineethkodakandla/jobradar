"use client";

import * as React from "react";
import { FileText, Sparkles } from "lucide-react";
import type { ProfileSkill } from "@/lib/types";
import { Button } from "../ui/button";
import { Textarea } from "../ui/input";
import { Modal } from "../ui/modal";
import { SKILL_CATEGORIES, matchResumeToSkills } from "./taxonomy";

export interface ResumePasteSeederProps {
  /** Merge the accepted skills into the profile (caller persists via PUT). */
  onSeed: (skills: ProfileSkill[], resumeText: string) => void;
}

export function ResumePasteSeeder({ onSeed }: ResumePasteSeederProps) {
  const [open, setOpen] = React.useState(false);
  const [resume, setResume] = React.useState("");
  const [proposed, setProposed] = React.useState<ProfileSkill[] | null>(null);
  const [accepted, setAccepted] = React.useState<Set<string>>(new Set());

  const analyze = () => {
    const skills = matchResumeToSkills(resume);
    setProposed(skills);
    setAccepted(new Set(skills.map((s) => s.skill)));
  };

  const toggle = (skill: string) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(skill)) next.delete(skill);
      else next.add(skill);
      return next;
    });
  };

  const apply = () => {
    if (!proposed) return;
    const chosen = proposed.filter((s) => accepted.has(s.skill));
    onSeed(chosen, resume);
    reset();
  };

  const reset = () => {
    setOpen(false);
    setResume("");
    setProposed(null);
    setAccepted(new Set());
  };

  const grouped = React.useMemo(() => {
    const map = new Map<string, ProfileSkill[]>();
    for (const cat of SKILL_CATEGORIES) map.set(cat, []);
    for (const s of proposed ?? []) {
      if (!map.has(s.category)) map.set(s.category, []);
      map.get(s.category)!.push(s);
    }
    return Array.from(map.entries()).filter(([, list]) => list.length > 0);
  }, [proposed]);

  return (
    <>
      <Button variant="outline" size="md" onClick={() => setOpen(true)}>
        <FileText className="h-4 w-4" />
        Seed from résumé
      </Button>

      <Modal
        open={open}
        onClose={reset}
        title="Seed skills from your résumé"
        labelledBy="seeder-title"
        className="max-w-2xl"
      >
        <div className="space-y-4 p-5">
          {!proposed ? (
            <>
              <p className="text-sm text-muted-foreground">
                Paste your résumé text. We match it against a built-in skill
                taxonomy (alias-aware) on-device — nothing is sent until you
                save.
              </p>
              <Textarea
                value={resume}
                onChange={(e) => setResume(e.target.value)}
                placeholder="Paste résumé text here…"
                className="min-h-[200px]"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={reset}>
                  Cancel
                </Button>
                <Button onClick={analyze} disabled={!resume.trim()}>
                  <Sparkles className="h-4 w-4" />
                  Find skills
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Found <strong>{proposed.length}</strong> matching skills.
                Untick any you don’t want, then add them to your profile.
              </p>
              {proposed.length === 0 ? (
                <p className="rounded-lg border border-border bg-muted/30 px-3 py-6 text-center text-sm text-muted-foreground">
                  No known skills matched. Try the manual “Add a skill” box
                  instead.
                </p>
              ) : (
                <div className="max-h-[320px] space-y-4 overflow-y-auto scrollbar-thin pr-1">
                  {grouped.map(([cat, list]) => (
                    <div key={cat}>
                      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {cat}
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {list.map((s) => {
                          const on = accepted.has(s.skill);
                          return (
                            <button
                              key={s.skill}
                              type="button"
                              aria-pressed={on}
                              onClick={() => toggle(s.skill)}
                              className={
                                on
                                  ? "inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
                                  : "inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground line-through"
                              }
                            >
                              {s.skill} · {s.weight.toFixed(1)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex justify-between gap-2">
                <Button variant="ghost" onClick={() => setProposed(null)}>
                  Back
                </Button>
                <Button onClick={apply} disabled={accepted.size === 0}>
                  Add {accepted.size} skill{accepted.size === 1 ? "" : "s"}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
