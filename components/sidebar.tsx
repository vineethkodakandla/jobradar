"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bookmark,
  ExternalLink,
  KanbanSquare,
  LayoutGrid,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/", label: "Feed", icon: LayoutGrid },
  { href: "/saved", label: "Saved", icon: Bookmark },
  { href: "/tracker", label: "Tracker", icon: KanbanSquare },
  { href: "/skills", label: "Skills", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

const PORTFOLIO_URL =
  process.env.NEXT_PUBLIC_PORTFOLIO_URL ??
  "https://vineeth-portfolio-five.vercel.app/#work";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/jobs");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Primary">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}

        <div className="my-3 h-px bg-border" aria-hidden="true" />

        <a
          href={PORTFOLIO_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open portfolio (new tab)"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            "text-muted-foreground hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <ExternalLink className="h-4 w-4 shrink-0" />
          Portfolio
        </a>
      </nav>
    </aside>
  );
}
