"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DropdownContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}

const DropdownContext = React.createContext<DropdownContextValue | null>(null);

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  className?: string;
  contentClassName?: string;
}

/** Click-outside dropdown menu. Trigger is rendered as-is; menu toggles below it. */
export function DropdownMenu({
  trigger,
  children,
  align = "start",
  className,
  contentClassName,
}: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div ref={rootRef} className={cn("relative inline-block", className)}>
        <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
        {open && (
          <div
            role="menu"
            className={cn(
              "absolute z-40 mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg",
              "motion-safe:animate-[fadeIn_100ms_ease-out]",
              align === "end" ? "right-0" : "left-0",
              contentClassName,
            )}
          >
            {children}
          </div>
        )}
      </div>
    </DropdownContext.Provider>
  );
}

export interface DropdownItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  /** Close the menu after click (default true). */
  closeOnClick?: boolean;
}

export function DropdownItem({
  className,
  active,
  closeOnClick = true,
  onClick,
  children,
  ...props
}: DropdownItemProps) {
  const ctx = React.useContext(DropdownContext);
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
        "hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        active && "bg-muted font-medium text-foreground",
        className,
      )}
      onClick={(e) => {
        onClick?.(e);
        if (closeOnClick) ctx?.setOpen(false);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 h-px bg-border" />;
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  );
}
