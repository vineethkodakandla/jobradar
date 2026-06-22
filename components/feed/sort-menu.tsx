"use client";

import { ArrowUpDown, Check } from "lucide-react";
import type { SortKey } from "@/lib/filters";
import { Button } from "../ui/button";
import {
  DropdownItem,
  DropdownMenu,
} from "../ui/dropdown-menu";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "fit", label: "Best fit" },
  { value: "posted", label: "Newest" },
  { value: "salary", label: "Salary" },
  { value: "company", label: "Company" },
];

export interface SortMenuProps {
  value: SortKey;
  onChange: (value: SortKey) => void;
}

export function SortMenu({ value, onChange }: SortMenuProps) {
  const current = SORT_OPTIONS.find((o) => o.value === value)?.label ?? "Sort";
  return (
    <DropdownMenu
      align="end"
      trigger={
        <Button variant="outline" size="sm">
          <ArrowUpDown className="h-3.5 w-3.5" />
          {current}
        </Button>
      }
    >
      {SORT_OPTIONS.map((o) => (
        <DropdownItem
          key={o.value}
          active={o.value === value}
          onClick={() => onChange(o.value)}
        >
          <span className="flex-1">{o.label}</span>
          {o.value === value && <Check className="h-3.5 w-3.5" />}
        </DropdownItem>
      ))}
    </DropdownMenu>
  );
}
