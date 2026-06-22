"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

/** Native <select> styled to match the theme (reliable + accessible). */
export function Select({
  value,
  onValueChange,
  options,
  id,
  className,
  disabled,
  "aria-label": ariaLabel,
}: SelectProps) {
  return (
    <div className={cn("relative inline-flex", className)}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onValueChange(e.target.value)}
        className={cn(
          "h-9 w-full appearance-none rounded-lg border border-border bg-background pl-3 pr-8 text-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
