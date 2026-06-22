"use client";

import * as React from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

export interface SplitViewProps {
  left: React.ReactNode;
  middle: React.ReactNode;
  right: React.ReactNode;
  /** Whether the right (detail) pane currently has content selected. */
  rightOpen?: boolean;
  /** Called when the mobile detail overlay requests close. */
  onCloseRight?: () => void;
}

function ResizeHandle() {
  return (
    <PanelResizeHandle className="group relative w-px bg-border outline-none">
      <span className="absolute inset-y-0 -left-1 -right-1 z-10 transition-colors group-hover:bg-primary/20 group-data-[resize-handle-active]:bg-primary/40" />
    </PanelResizeHandle>
  );
}

/**
 * Three-pane layout (FilterRail | JobList | JobDetail) using
 * react-resizable-panels on lg+. Below lg the panels stack: the filter rail
 * is hidden (its mobile <Sheet> lives in FilterRail), the list is full width,
 * and the detail renders as a slide-over overlay when a job is selected.
 */
export function SplitView({
  left,
  middle,
  right,
  rightOpen,
  onCloseRight,
}: SplitViewProps) {
  return (
    <div className="h-full">
      {/* Desktop: resizable three-pane */}
      <div className="hidden h-full lg:block">
        <PanelGroup direction="horizontal" autoSaveId="jobradar-feed">
          <Panel defaultSize={20} minSize={15} maxSize={28} className="min-w-0">
            <div className="h-full overflow-y-auto scrollbar-thin border-r border-border">
              {left}
            </div>
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={38} minSize={28} className="min-w-0">
            <div className="h-full min-h-0">{middle}</div>
          </Panel>
          <ResizeHandle />
          <Panel defaultSize={42} minSize={28} className="min-w-0">
            <div className="h-full overflow-y-auto scrollbar-thin">{right}</div>
          </Panel>
        </PanelGroup>
      </div>

      {/* Mobile / tablet: list full-width, detail as an overlay */}
      <div className="relative h-full lg:hidden">
        <div className="h-full min-h-0">{middle}</div>
        <div
          className={cn(
            "absolute inset-0 z-20 bg-background transition-transform duration-200 motion-reduce:transition-none",
            rightOpen ? "translate-x-0" : "pointer-events-none translate-x-full",
          )}
          aria-hidden={!rightOpen}
        >
          <div className="h-full overflow-y-auto scrollbar-thin">
            <div className="sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
              <button
                type="button"
                onClick={onCloseRight}
                className="text-sm font-medium text-primary hover:underline"
              >
                ← Back to list
              </button>
            </div>
            {right}
          </div>
        </div>
      </div>
    </div>
  );
}
