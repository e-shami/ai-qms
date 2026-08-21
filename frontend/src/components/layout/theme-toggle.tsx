"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

const STORAGE_KEY = "aiqms-theme";

/**
 * Icons are CSS-driven (dark: variant) so SSR and hydration always agree —
 * the no-FOUC script in the root layout sets the class before paint.
 */
export function ThemeToggle() {
  function toggle() {
    const isDark = document.documentElement.classList.contains("dark");
    const next = isDark ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.classList.toggle("dark", next === "dark");
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label="Toggle dark mode"
      title="Toggle dark mode"
    >
      <Sun className="hidden size-4 dark:inline-block" />
      <Moon className="inline-block size-4 dark:hidden" />
    </Button>
  );
}
