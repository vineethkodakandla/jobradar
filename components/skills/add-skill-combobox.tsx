"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import type { ProfileSkill } from "@/lib/types";
import { cn } from "@/lib/utils";
import { taxonomySuggestions, type TaxonomyEntry } from "./taxonomy";

export interface AddSkillComboboxProps {
  existing: string[];
  onAdd: (skill: ProfileSkill) => void;
}

export function AddSkillCombobox({ existing, onAdd }: AddSkillComboboxProps) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const suggestions = React.useMemo(
    () => taxonomySuggestions(query, existing),
    [query, existing],
  );

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  React.useEffect(() => setActive(0), [query]);

  const addEntry = (entry: TaxonomyEntry) => {
    onAdd({
      skill: entry.skill,
      aliases: entry.aliases,
      weight: entry.weight,
      category: entry.category,
    });
    setQuery("");
    setOpen(false);
  };

  const addFreeText = () => {
    const name = query.trim();
    if (!name) return;
    if (existing.some((s) => s.toLowerCase() === name.toLowerCase())) {
      setQuery("");
      return;
    }
    onAdd({ skill: name, aliases: [], weight: 0.6, category: "Domain" });
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(suggestions.length, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active < suggestions.length && suggestions[active]) {
        addEntry(suggestions[active]!);
      } else {
        addFreeText();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="flex gap-2">
        <input
          value={query}
          placeholder="Add a skill (e.g. PyTorch, k8s, RAG)…"
          aria-label="Add a skill"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring"
        />
        <button
          type="button"
          onClick={addFreeText}
          disabled={!query.trim()}
          className="inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
      </div>

      {open && (suggestions.length > 0 || query.trim()) && (
        <ul
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto scrollbar-thin rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={s.skill}>
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => addEntry(s)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
                  i === active ? "bg-muted" : "hover:bg-muted",
                )}
              >
                <span className="text-foreground">{s.skill}</span>
                <span className="text-[11px] text-muted-foreground">
                  {s.category} · {s.weight.toFixed(1)}
                </span>
              </button>
            </li>
          ))}
          {query.trim() &&
            !suggestions.some(
              (s) => s.skill.toLowerCase() === query.trim().toLowerCase(),
            ) && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={active === suggestions.length}
                  onMouseEnter={() => setActive(suggestions.length)}
                  onClick={addFreeText}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
                    active === suggestions.length ? "bg-muted" : "hover:bg-muted",
                  )}
                >
                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                  Add “{query.trim()}” as a custom skill
                </button>
              </li>
            )}
        </ul>
      )}
    </div>
  );
}
