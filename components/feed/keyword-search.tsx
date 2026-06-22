"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebouncedCallback } from "../hooks/use-debounced-callback";

export interface KeywordSearchProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

/** Debounced keyword search bound to the `q` filter. */
export function KeywordSearch({ value, onChange, className }: KeywordSearchProps) {
  const [local, setLocal] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const debounced = useDebouncedCallback(onChange, 350);

  // Keep local input in sync if the URL value changes externally (e.g. reset).
  React.useEffect(() => setLocal(value), [value]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        value={local}
        placeholder="Search title, company, skills…"
        aria-label="Search jobs"
        onChange={(e) => {
          setLocal(e.target.value);
          debounced(e.target.value);
        }}
        className={cn(
          "h-9 w-full rounded-lg border border-border bg-background pl-8 pr-8 text-sm",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
          "[&::-webkit-search-cancel-button]:hidden",
        )}
      />
      {local && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setLocal("");
            onChange("");
            inputRef.current?.focus();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
