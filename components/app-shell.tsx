import * as React from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/**
 * The authenticated app chrome: a fixed sidebar + topbar with a scrollable
 * <main>. Mounted by app/(app)/layout.tsx as <AppShell>{children}</AppShell>.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        {/* deferred (v1): command palette (⌘K) mounts here as a global overlay */}
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
