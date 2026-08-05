export default function Home() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
        AI-QMS
      </h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        AI-assisted queue management for hospitals, banks, universities, and
        government offices — real-time tracking, wait-time predictions, and
        WhatsApp notifications.
      </p>
      <p className="text-sm text-muted-foreground/70">
        Platform scaffolding is live. Auth, queue management, and analytics
        arrive in later phases.
      </p>
    </main>
  );
}
