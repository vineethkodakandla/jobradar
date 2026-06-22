import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "muted" | "primary";

const VARIANTS: Record<Variant, string> = {
  default: "border-border bg-card text-foreground",
  outline: "border-border bg-transparent text-muted-foreground",
  muted: "border-transparent bg-muted text-muted-foreground",
  primary: "border-primary/30 bg-primary/10 text-primary",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
