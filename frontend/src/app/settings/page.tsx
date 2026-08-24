"use client";

import { DashboardShell } from "@/components/layout/shell";
import { AdminSettings } from "@/components/settings/admin-settings";
import { StaffSettings } from "@/components/settings/staff-settings";
import { Skeleton } from "@/components/ui/skeleton";
import { useRequireRole } from "@/hooks/use-guards";
import { useAuthStore } from "@/store/auth";

/**
 * Shared /settings route for both roles — the content differs, the URL
 * stays predictable. Rendered inside its own shell because this route
 * lives outside the (admin)/(staff) groups.
 */
export default function SettingsPage() {
  const { ready } = useRequireRole("any");
  const role = useAuthStore((state) => state.user?.role);

  if (!ready || !role) {
    return (
      <div className="flex min-h-svh flex-col gap-4 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <DashboardShell role={role}>
      {role === "staff" ? <StaffSettings /> : <AdminSettings />}
    </DashboardShell>
  );
}
