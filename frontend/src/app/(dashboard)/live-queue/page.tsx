"use client";

import { LiveQueueView } from "@/components/queue/live-queue-view";

export default function LiveQueuePage() {
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Live queue</h1>
        <p className="text-sm text-muted-foreground">
          Every token in this institution&apos;s queue, updated in real time over WebSocket.
        </p>
      </div>
      <LiveQueueView />
    </>
  );
}