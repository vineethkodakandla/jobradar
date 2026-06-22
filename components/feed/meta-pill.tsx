import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MetaPillProps {
  icon?: LucideIcon;
  label: React.ReactNode;
  className?: string;
}

export function MetaPill({ icon: Icon, label, className }: MetaPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-foreground",
        className,
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
      {label}
    </span>
  );
}
