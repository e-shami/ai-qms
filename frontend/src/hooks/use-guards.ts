"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { homeFor } from "@/lib/navigation";
import { useAuthStore } from "@/store/auth";
import type { Role } from "@/types";

const emptySubscribe = () => () => {};

/** SSR-safe "have we mounted" flag; keeps guards from flashing redirects. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

interface GuardResult {
  /** False while the session is being resolved — render the skeleton. */
  ready: boolean;
}

/**
 * Route guard for role-scoped shells. Unauthenticated visitors go to
 * /login; authenticated ones with the wrong role are sent to their own
 * home screen instead of seeing a foreign shell.
 */
export function useRequireRole(role: Role | "any"): GuardResult {
  const mounted = useMounted();
  const accessToken = useAuthStore((state) => state.accessToken);
  const userRole = useAuthStore((state) => state.user?.role);
  const router = useRouter();

  const signedIn = Boolean(accessToken);
  const roleMatches = role === "any" || userRole === role;

  useEffect(() => {
    if (!mounted) return;
    if (!signedIn) {
      router.replace("/login");
      return;
    }
    if (userRole && !roleMatches) {
      router.replace(homeFor(userRole));
    }
  }, [mounted, signedIn, userRole, roleMatches, router]);

  return { ready: mounted && signedIn && roleMatches };
}

/** Chrome-free pages (lobby display): only needs a session. */
export function useRequireAuth(): GuardResult {
  return useRequireRole("any");
}
