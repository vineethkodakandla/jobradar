"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** "center" = dialog, "right" = side sheet/drawer. */
  side?: "center" | "right";
  title?: React.ReactNode;
  className?: string;
  labelledBy?: string;
}

/**
 * Self-contained modal / side-sheet rendered into a fixed-position portal.
 * Handles Escape, click-outside, focus return, and body scroll lock.
 */
export function Modal({
  open,
  onClose,
  children,
  side = "center",
  title,
  className,
  labelledBy,
}: ModalProps) {
  const [mounted, setMounted] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const lastFocused = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    lastFocused.current = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);

    // Move focus into the panel for accessibility.
    const t = window.setTimeout(() => panelRef.current?.focus(), 0);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
      lastFocused.current?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex"
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div
        className="absolute inset-0 bg-black/50 motion-safe:animate-[fadeIn_120ms_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative bg-card text-card-foreground shadow-xl outline-none",
          side === "center"
            ? "m-auto w-full max-w-lg rounded-lg border border-border"
            : "ml-auto h-full w-full max-w-md border-l border-border overflow-y-auto scrollbar-thin",
          className,
        )}
      >
        {(title || side === "right") && (
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <div id={labelledBy} className="text-sm font-semibold">
              {title}
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
