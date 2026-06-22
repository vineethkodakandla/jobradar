"use client";

import * as React from "react";
import { Check, ChevronDown, Cpu, Sparkles, X } from "lucide-react";
import type { JobFit, JobFitComponents } from "@/lib/types";
import {
  FIT_COMPONENT_LABELS,
  FIT_COMPONENT_WEIGHTS,
  getFitTier,
} from "@/lib/fit";
import { cn } from "@/lib/utils";

export interface FitScorePanelProps {
  fit: JobFit | null;
}

const COMPONENT_ORDER: (keyof JobFitComponents)[] = [
  "semantic_sim",
  "skill_overlap",
  "experience_match",
  "location_worktype",
  "recency",
];

export function FitScorePanel({ fit }: FitScorePanelProps) {
  const [expanded, setExpanded] = React.useState(false);

  if (!fit) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        This job hasn’t been scored yet. Scores are computed in the daily run.
      </div>
    );
  }

  const tier = getFitTier(fit.score);
  // UI prefers the LLM rationale only when present (§7).
  const rationale = fit.rationale_llm ?? fit.rationale;
  const llmEnhanced = Boolean(fit.rationale_llm);

  return (
    <div className={cn("rounded-lg border p-4", tier.border, tier.bg)}>
      <div className="flex items-start gap-4">
        {/* deferred (v1): FitRing radial — the numeric score + component bars below suffice */}
        <div className="flex flex-col items-center">
          <span className={cn("text-4xl font-bold tabular-nums", tier.text)}>
            {fit.score}
          </span>
          <span className={cn("text-xs font-semibold", tier.text)}>
            {tier.band}
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {rationale && (
            <p className="text-sm leading-relaxed text-foreground">
              {rationale}
            </p>
          )}
          <span className="inline-flex items-center gap-1 rounded-md bg-card/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {llmEnhanced ? (
              <>
                <Sparkles className="h-3 w-3" /> LLM-enhanced
              </>
            ) : (
              <>
                <Cpu className="h-3 w-3" /> $0 local model
              </>
            )}
          </span>
        </div>
      </div>

      {/* Matched / missing skills */}
      {(fit.matched_skills.length > 0 || fit.missing_skills.length > 0) && (
        <div className="mt-3 space-y-2">
          {fit.matched_skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {fit.matched_skills.map((s) => (
                <span
                  key={`m-${s}`}
                  className="inline-flex items-center gap-1 rounded-full border border-fit-strong/30 bg-fit-strong/10 px-2 py-0.5 text-xs font-medium text-fit-strong"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                  {s}
                </span>
              ))}
            </div>
          )}
          {fit.missing_skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {fit.missing_skills.map((s) => (
                <span
                  key={`x-${s}`}
                  className="inline-flex items-center gap-1 rounded-full border border-fit-low/30 bg-fit-low/10 px-2 py-0.5 text-xs font-medium text-fit-low"
                >
                  <X className="h-3 w-3" strokeWidth={3} />
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Why this score? expander */}
      {fit.components && (
        <div className="mt-3">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
            Why this score?
          </button>
          {expanded && (
            <div className="mt-2 space-y-2">
              {COMPONENT_ORDER.map((key) => {
                const value = fit.components![key] ?? 0;
                const weight = FIT_COMPONENT_WEIGHTS[key] ?? 0;
                const pct = Math.round(value * 100);
                return (
                  <div key={key} className="space-y-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">
                        {FIT_COMPONENT_LABELS[key]}
                        <span className="ml-1 opacity-60">
                          ({Math.round(weight * 100)}%)
                        </span>
                      </span>
                      <span className="tabular-nums text-foreground">{pct}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {fit.gated && fit.gate_reason && (
                <p className="rounded-md bg-fit-low/10 px-2 py-1 text-[11px] text-fit-low">
                  Score capped: {fit.gate_reason.replace(/_/g, " ")}.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
