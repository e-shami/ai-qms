"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/auth";

export default function Home() {
  const accessToken = useAuthStore((state) => state.accessToken);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">AI-QMS</h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        AI-assisted queue management for hospitals, banks, universities, and
        government offices — real-time tracking, wait-time predictions, and
        WhatsApp notifications.
      </p>
      <div className="flex gap-3">
        {accessToken ? (
          <Button render={<Link href="/overview" />}>Open dashboard</Button>
        ) : (
          <>
            <Button render={<Link href="/login" />}>Sign in</Button>
            <Button variant="outline" render={<Link href="/register" />}>
              Create an institution
            </Button>
          </>
        )}
      </div>
      <p className="text-sm text-muted-foreground/70">
        Queue management · wait-time prediction · analytics
      </p>
    </main>
  );
}