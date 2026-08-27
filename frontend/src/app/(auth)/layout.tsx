import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 px-4 py-12">
      <header className="text-center">
        <Link href="/" className="text-2xl font-semibold tracking-tight">
          AI-QMS
        </Link>
        <p className="mt-1 text-sm text-muted-foreground">
          AI-assisted queue management platform
        </p>
      </header>
      {children}
    </div>
  );
}