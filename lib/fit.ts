import type { FitBand } from "./types";

// ============================================================================
// Fit-tier presentation. SINGLE SOURCE OF TRUTH for band cutoffs + colors.
// MUST match the Python scorer bands in scraper/fit.py exactly:
//   Strong >= 78 · Good 62–77 · Stretch 45–61 · Low < 45
// Colors map to the --fit-* CSS variables defined in app/globals.css.
// ============================================================================

export interface FitTier {
  band: FitBand;
  /** Tailwind text color utility (semantic, theme-aware). */
  text: string;
  /** Tailwind background tint utility for badges. */
  bg: string;
  /** Tailwind border utility. */
  border: string;
  /** Raw CSS color (for inline ring strokes etc.). */
  color: string;
  blurb: string;
}

export function getFitTier(score: number): FitTier {
  if (score >= 78) {
    return {
      band: "Strong",
      text: "text-fit-strong",
      bg: "bg-fit-strong/10",
      border: "border-fit-strong/30",
      color: "hsl(var(--fit-strong))",
      blurb: "Strong match — apply first.",
    };
  }
  if (score >= 62) {
    return {
      band: "Good",
      text: "text-fit-good",
      bg: "bg-fit-good/10",
      border: "border-fit-good/30",
      color: "hsl(var(--fit-good))",
      blurb: "Good fit — worth a serious look.",
    };
  }
  if (score >= 45) {
    return {
      band: "Stretch",
      text: "text-fit-stretch",
      bg: "bg-fit-stretch/10",
      border: "border-fit-stretch/30",
      color: "hsl(var(--fit-stretch))",
      blurb: "Stretch — a reach, but possible.",
    };
  }
  return {
    band: "Low",
    text: "text-fit-low",
    bg: "bg-fit-low/10",
    border: "border-fit-low/30",
    color: "hsl(var(--fit-low))",
    blurb: "Low fit for your profile.",
  };
}

export const FIT_COMPONENT_LABELS: Record<string, string> = {
  semantic_sim: "Semantic match",
  skill_overlap: "Skill overlap",
  experience_match: "Experience level",
  location_worktype: "Location / work type",
  recency: "Recency",
};

export const FIT_COMPONENT_WEIGHTS: Record<string, number> = {
  semantic_sim: 0.35,
  skill_overlap: 0.3,
  experience_match: 0.2,
  location_worktype: 0.1,
  recency: 0.05,
};
