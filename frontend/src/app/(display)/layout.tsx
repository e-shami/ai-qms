"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/auth";

const emptySubscribe = () => () => {};

/** Chrome-free guard for the lobby display route. */
export default function DisplayLayout({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const router = useRouter();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  useEffect(() => {
    if (mounted && !accessToken) router.replace("/login");
  }, [mounted, accessToken, router]);

  if (!mounted || !accessToken) {
    return (
      <div className="grid min-h-svh gap-4 bg-background p-8">
        <Skeleton className="h-24 w-96" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    );
  }

  return <>{children}</>;
}
