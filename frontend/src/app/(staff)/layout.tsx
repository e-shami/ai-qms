"use client";

import { DashboardShell } from "@/components/layout/shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useRequireRole } from "@/hooks/use-guards";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useRequireRole("staff");

  if (!ready) {
    return (
      <div className="flex min-h-svh flex-col gap-4 p-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return <DashboardShell role="staff">{children}</DashboardShell>;
}
