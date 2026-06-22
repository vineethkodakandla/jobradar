"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  label?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  id,
  label,
  disabled,
  className,
}: CheckboxProps) {
  const reactId = React.useId();
  const inputId = id ?? reactId;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        "inline-flex cursor-pointer select-none items-center gap-2 text-sm",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <span className="relative inline-flex h-4 w-4 items-center justify-center">
        <input
          id={inputId}
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange(e.target.checked)}
        />
        <span
          className={cn(
            "flex h-4 w-4 items-center justify-center rounded border border-border bg-background transition-colors",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
            checked && "border-primary bg-primary text-primary-foreground",
          )}
        >
          {checked && <Check className="h-3 w-3" strokeWidth={3} />}
        </span>
      </span>
      {label != null && <span>{label}</span>}
    </label>
  );
}
