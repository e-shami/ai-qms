"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useInstitution } from "@/hooks/use-resources";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

const NAV_ITEMS = [
  { href: "/overview", label: "Overview" },
  { href: "/live-queue", label: "Live queue" },
  { href: "/tokens", label: "Tokens" },
  { href: "/counters", label: "Counters" },
  { href: "/personnel", label: "Personnel" },
  { href: "/analytics", label: "Analytics" },
];

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { institution } = useInstitution();
  const [menuOpen, setMenuOpen] = useState(false);

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-card px-4 sm:px-6">
      <button
        type="button"
        className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="Toggle navigation"
      >
        <Menu className="size-5" />
      </button>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{institution?.name ?? "Dashboard"}</p>
        <p className="truncate text-xs text-muted-foreground">
          {user?.full_name} · {user?.role}
        </p>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {institution ? `Institution #${institution.id}` : ""}
        </span>
        <Button variant="ghost" size="sm" onClick={handleLogout}>
          <LogOut />
          Sign out
        </Button>
      </div>

      {menuOpen && (
        <nav className="absolute inset-x-0 top-14 z-30 border-b bg-card p-2 lg:hidden">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className={cn(
                "flex items-center rounded-md px-3 py-2 text-sm font-medium",
                pathname === item.href
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}