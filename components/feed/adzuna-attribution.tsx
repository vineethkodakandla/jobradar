import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdzunaAttributionProps {
  /** The job's apply/listing URL to link the attribution back to. */
  href: string;
  className?: string;
}

/**
 * Required "Jobs by Adzuna" attribution pill (Adzuna ToS §4). Rendered as a
 * linked pill (≥116×23px) wherever an Adzuna-sourced listing is displayed.
 * Uses a text wordmark sized to the minimum logo footprint so it satisfies the
 * attribution requirement without bundling a remote image asset.
 */
export function AdzunaAttribution({ href, className }: AdzunaAttributionProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer sponsored"
      aria-label="Jobs by Adzuna (opens in a new tab)"
      title="Jobs by Adzuna"
      className={cn(
        "inline-flex h-[23px] min-w-[116px] items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40",
        className,
      )}
    >
      Jobs by{" "}
      <span className="font-bold text-[#6f42c1] dark:text-[#a78bfa]">
        Adzuna
      </span>
      <ExternalLink className="h-3 w-3 text-muted-foreground" />
    </a>
  );
}
