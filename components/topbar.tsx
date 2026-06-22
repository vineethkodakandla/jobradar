"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { LastSyncedStrip } from "./last-synced-strip";
import { RefreshButton } from "./refresh-button";
import { ThemeToggle } from "./theme-toggle";
import { SignOutButton } from "./sign-out-button";

const NAV = [
  { href: "/", label: "Feed" },
  { href: "/saved", label: "Saved" },
  { href: "/tracker", label: "Tracker" },
  { href: "/skills", label: "Skills" },
  { href: "/settings", label: "Settings" },
];

function navActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/jobs");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Topbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur sm:px-4">
      <Button
        size="icon"
        variant="ghost"
        className="lg:hidden"
        aria-label="Open menu"
        aria-expanded={mobileOpen}
        onClick={() => setMobileOpen((v) => !v)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      <Link
        href="/"
        className="flex items-center gap-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Radar className="h-4 w-4" />
        </span>
        <span className="hidden sm:inline">JobRadar</span>
      </Link>

      <div className="ml-2 hidden lg:block">
        <LastSyncedStrip />
      </div>

      <div className="ml-auto flex items-center gap-1">
        <RefreshButton />
        <ThemeToggle />
        <SignOutButton />
      </div>

      {/* Mobile nav sheet (sidebar is hidden < lg). */}
      {mobileOpen && (
        <div className="absolute inset-x-0 top-14 z-30 border-b border-border bg-card p-2 shadow-lg lg:hidden">
          <div className="mb-2 px-2">
            <LastSyncedStrip />
          </div>
          <nav className="flex flex-col gap-1">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  navActive(pathname, href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
