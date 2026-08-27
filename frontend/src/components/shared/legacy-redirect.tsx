"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { homeFor } from "@/lib/navigation";
import { useAuthStore } from "@/store/auth";

/**
 * Redirector for pre-split bookmarks. Signed-out visitors land on the
 * login screen; signed-in ones go wherever their role fits the target.
 */
export function LegacyRedirect({
  adminTarget,
}: {
  /** Path admins land on; staff always go to their own workspace. */
  adminTarget: string;
}) {
  const router = useRouter();
  const accessToken = useAuthStore((state) => state.accessToken);
  const role = useAuthStore((state) => state.user?.role);

  useEffect(() => {
    if (!accessToken) {
      router.replace("/login");
      return;
    }
    router.replace(role === "staff" ? homeFor(role) : adminTarget);
  }, [accessToken, role, adminTarget, router]);

  return null;
}
