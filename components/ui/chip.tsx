"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChipProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "onClick"> {
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  children: React.ReactNode;
}

/**
 * A pill. With `onClick` (no `onRemove`) it renders a toggle <button>. With
 * `onRemove` it renders a non-interactive wrapper containing its own remove
 * <button> (avoids nesting interactive content), plus an optional click target.
 */
export function Chip({
  active = false,
  onClick,
  onRemove,
  children,
  className,
  ...props
}: ChipProps) {
  const base = cn(
    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
    active
      ? "border-primary/40 bg-primary/10 text-primary"
      : "border-border bg-card text-muted-foreground",
    className,
  );

  if (onRemove) {
    return (
      <span className={cn(base, "pr-1")} {...props}>
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {children}
          </button>
        ) : (
          <span>{children}</span>
        )}
        <button
          type="button"
          aria-label="Remove filter"
          onClick={onRemove}
          className="ml-0.5 rounded-full p-0.5 hover:bg-foreground/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        "hover:border-primary/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      {...props}
    >
      {children}
    </button>
  );
}
