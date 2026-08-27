"use client";

import { useAuthStore } from "@/store/auth";

import { PasswordForm, ProfileForm } from "@/components/shared/account-forms";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWorkspace } from "@/hooks/use-workspace";
import type { WorkStatus } from "@/types";

const WORK_STATUS_LABELS: Record<WorkStatus, string> = {
  off_duty: "Off duty",
  available: "Available",
  on_break: "On break",
};

function AssignmentCard() {
  const { workspace } = useWorkspace();

  return (
    <Card>
      <CardHeader>
        <CardTitle>My assignment</CardTitle>
      </CardHeader>
      <CardContent className="divide-y text-sm">
        <div className="flex items-center justify-between gap-4 py-2 first:pt-0">
          <span className="text-muted-foreground">Name</span>
          <span className="font-medium">{workspace?.name ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-4 py-2">
          <span className="text-muted-foreground">Title</span>
          <span className="font-medium">{workspace?.title ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-4 py-2">
          <span className="text-muted-foreground">Counter</span>
          <span className="font-medium">
            {workspace?.counter
              ? `${workspace.counter.name}${
                  workspace.counter.type ? ` — ${workspace.counter.type}` : ""
                }`
              : "None claimed"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 py-2 last:pb-0">
          <span className="text-muted-foreground">Presence</span>
          <span className="font-medium">
            {workspace ? WORK_STATUS_LABELS[workspace.work_status] : "—"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/** Staff view: personal account plus a read-only assignment summary. */
export function StaffSettings() {
  const user = useAuthStore((state) => state.user);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your account details and current assignment."
      />

      <div className="grid max-w-2xl gap-6">
        {user ? (
          <ProfileForm key={`${user.id}:${user.email}`} user={user} />
        ) : (
          <p className="text-sm text-muted-foreground">Loading profile…</p>
        )}
        <PasswordForm />
        <AssignmentCard />
      </div>
    </>
  );
}
