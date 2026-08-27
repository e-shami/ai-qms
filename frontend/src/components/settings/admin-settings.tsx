"use client";

import { useAuthStore } from "@/store/auth";

import { PasswordForm, ProfileForm } from "@/components/shared/account-forms";
import { PageHeader } from "@/components/shared/page-header";
import {
  DangerZone,
  InstitutionSettings,
} from "@/components/settings/institution-settings";

/** Everything an administrator can configure for their institution. */
export function AdminSettings() {
  const user = useAuthStore((state) => state.user);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your account, institution details, and destructive options."
      />

      <div className="grid max-w-2xl gap-6">
        {user ? (
          <ProfileForm key={`${user.id}:${user.email}`} user={user} />
        ) : (
          <p className="text-sm text-muted-foreground">Loading profile…</p>
        )}
        <PasswordForm />
        <InstitutionSettings />
        <DangerZone />
      </div>
    </>
  );
}
