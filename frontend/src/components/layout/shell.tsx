"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Gauge,
  LayoutList,
  LogOut,
  Menu,
  Monitor,
  Radio,
  Settings,
  Ticket,
  X,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { StatusLabel } from "@/components/ui/status-dot";
import { useInstitution } from "@/hooks/use-resources";
import { cn } from "@/lib/utils";
import { queueSocket } from "@/lib/socket";
import { useAuthStore } from "@/store/auth";
import type { Role } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ADMIN_NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge },
  { href: "/management", label: "Management", icon: LayoutList },
  { href: "/tokens", label: "Tokens", icon: Ticket },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/display", label: "Lobby display", icon: Monitor },
  { href: "/settings", label: "Settings", icon: Settings },
];

const STAFF_NAV: NavItem[] = [
  { href: "/workspace", label: "My queue", icon: Radio },
  { href: "/display", label: "Lobby display", icon: Monitor },
  { href: "/settings", label: "Settings", icon: Settings },
];

function navFor(role: Role): NavItem[] {
  return role === "staff" ? STAFF_NAV : ADMIN_NAV;
}

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function BrandHeader({ home }: { home: string }) {
  return (
    <Link href={home} className="flex h-14 items-center gap-2 border-b px-4">
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Ticket className="size-4" />
      </span>
      <span className="text-sm font-semibold tracking-tight">AI-QMS</span>
    </Link>
  );
}

export function DashboardShell({
  role,
  children,
}: {
  role: Role;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { institution } = useInstitution();
  const [navOpen, setNavOpen] = useState(false);
  const [connected, setConnected] = useState(() => queueSocket.isConnected());

  const items = navFor(role);
  const home = role === "staff" ? "/workspace" : "/dashboard";

  // Track live/reconnecting for the header pill; initial value is read
  // synchronously so a mid-session mount shows the truth immediately.
  useEffect(() => queueSocket.subscribeState(setConnected), []);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  const navLinks = (onNavigate?: () => void) =>
    items.map((item) => (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          isActive(pathname, item.href)
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <item.icon className="size-4" />
        {item.label}
      </Link>
    ));

  return (
    <div className="min-h-svh bg-muted/30">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r bg-sidebar lg:flex">
        <BrandHeader home={home} />
        <nav className="flex-1 space-y-1 overflow-y-auto p-2">{navLinks()}</nav>
        <div className="border-t p-3 text-xs text-muted-foreground">AI-QMS</div>
      </aside>

      <div className="flex min-h-svh flex-col lg:pl-56">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            aria-expanded={navOpen}
            aria-controls="mobile-nav"
            aria-label={navOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setNavOpen((open) => !open)}
          >
            {navOpen ? <X /> : <Menu />}
          </Button>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {institution?.name ?? "AI-QMS"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {institution?.code ? `${institution.code} · ` : ""}
              {user?.full_name} · {user?.role}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden sm:inline-flex">
              <StatusLabel
                tone={connected ? "live" : "break"}
                label={connected ? "Live" : "Reconnecting"}
                pulse={connected}
              />
            </span>
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>

        <main className="flex-1 space-y-6 p-4 sm:p-6">{children}</main>
      </div>

      {/* Slide-over navigation for small screens */}
      <div
        id="mobile-nav"
        className={cn(
          "fixed inset-0 z-40 lg:hidden",
          navOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <div
          aria-hidden
          className={cn(
            "absolute inset-0 bg-black/30 transition-opacity duration-200",
            navOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setNavOpen(false)}
        />
        <nav
          inert={!navOpen}
          aria-label="Primary"
          className={cn(
            "absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col border-r bg-card shadow-xl transition-transform duration-200",
            navOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <BrandHeader home={home} />
          <div className="flex-1 space-y-1 overflow-y-auto p-2 py-2 [&_a]:py-2.5">
            {navLinks(() => setNavOpen(false))}
          </div>
        </nav>
      </div>
    </div>
  );
}

export { ADMIN_NAV, STAFF_NAV };
