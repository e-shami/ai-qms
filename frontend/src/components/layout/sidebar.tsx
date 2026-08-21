"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Gauge,
  Radio,
  ScanLine,
  Settings2,
  Ticket,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/overview", label: "Overview", icon: Gauge },
  { href: "/live-queue", label: "Live queue", icon: Radio },
  { href: "/tokens", label: "Tokens", icon: Ticket },
  { href: "/counters", label: "Counters", icon: ScanLine },
  { href: "/personnel", label: "Personnel", icon: Users },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r bg-card lg:flex">
      <Link href="/overview" className="flex h-14 items-center gap-2 border-b px-4">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Settings2 className="size-4" />
        </span>
        <span className="text-sm font-semibold tracking-tight">AI-QMS</span>
      </Link>
      <nav className="flex-1 space-y-1 p-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3 text-xs text-muted-foreground">
        v0.1 · Phase 6 dashboard
      </div>
    </aside>
  );
}