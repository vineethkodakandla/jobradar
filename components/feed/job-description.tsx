"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

export interface JobDescriptionProps {
  description: string | null;
}

const COLLAPSED_HEIGHT = 320; // px

/**
 * Renders the job description as plain text (the backend strips HTML at ingest,
 * so `description` is already plain text — we render it as text, never
 * dangerouslySetInnerHTML). Collapsible with a "Show more" toggle.
 */
export function JobDescription({ description }: JobDescriptionProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [overflows, setOverflows] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (el) setOverflows(el.scrollHeight > COLLAPSED_HEIGHT + 24);
  }, [description]);

  if (!description) {
    return (
      <p className="text-sm text-muted-foreground">
        No description was provided for this listing.
      </p>
    );
  }

  return (
    <div>
      <div
        ref={ref}
        style={{ maxHeight: expanded ? undefined : COLLAPSED_HEIGHT }}
        className={cn(
          "relative overflow-hidden whitespace-pre-line text-sm leading-relaxed text-foreground/90",
          !expanded && overflows && "[mask-image:linear-gradient(to_bottom,black_70%,transparent)]",
        )}
      >
        {description}
      </div>
      {overflows && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
          />
          {expanded ? "Show less" : "Show full description"}
        </Button>
      )}
    </div>
  );
}
