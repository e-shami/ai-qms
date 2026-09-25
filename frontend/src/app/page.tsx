"use client";

import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Building2,
  Clock3,
  LayoutDashboard,
  LineChart,
  MessageCircle,
  Radio,
  Ticket,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthStore } from "@/store/auth";
import { homeFor } from "@/lib/navigation";
import { WhatsAppEntry } from "@/components/whatsapp-entry";

const FEATURES = [
  {
    icon: Ticket,
    title: "Tokens in seconds",
    description:
      "Customers join the queue and get a numbered token — from this page or via WhatsApp. No app install, no kiosk queue.",
  },
  {
    icon: Radio,
    title: "Real-time queue",
    description:
      "Positions update live over WebSocket. Customers always know their place; staff see every counter at a glance.",
  },
  {
    icon: Clock3,
    title: "Wait-time prediction",
    description:
      "A machine-learning model estimates waits from live queue state and historical patterns — shown before you commit to waiting.",
  },
  {
    icon: BarChart3,
    title: "Analytics & KPIs",
    description:
      "Served counts, average waits, no-show rates, peak hours, and per-counter throughput — computed server-side.",
  },
  {
    icon: Building2,
    title: "Multi-institution",
    description:
      "Hospitals, banks, universities, government offices — each institution manages its own counters, staff, and data in isolation.",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp channel",
    description:
      "Institutions with a WhatsApp number let customers start the flow in chat — with a full web fallback everywhere else.",
  },
];

const CUSTOMER_STEPS = [
  {
    step: "1",
    title: "Pick your institution",
    description: "Search the list of registered institutions and choose where you need service.",
  },
  {
    step: "2",
    title: "Choose a counter",
    description: "Select the service point you need — pharmacy, teller, admissions, and so on.",
  },
  {
    step: "3",
    title: "Get your token",
    description:
      "Your token is issued instantly with your position and estimated wait. Print it or keep the link — WhatsApp updates where supported.",
  },
];

export default function Home() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const role = useAuthStore((state) => state.user?.role);
  const home = homeFor(role);

  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Ticket className="size-4" />
            </span>
            AI-QMS
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how-it-works" className="hover:text-foreground">How it works</a>
            <a href="#institutions" className="hover:text-foreground">For institutions</a>
          </nav>
          <div className="flex items-center gap-2">
            {accessToken ? (
              <Button size="sm" render={<Link href={home} />}>
                <LayoutDashboard />
                Dashboard
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" render={<Link href="/login" />}>
                  Sign in
                </Button>
                <Button size="sm" variant="outline" render={<Link href="/register" />}>
                  Register
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b bg-muted/30">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 sm:py-28">
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
              <Radio className="size-3.5 text-emerald-500" />
              Live queue tracking · AI wait-time prediction
            </span>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
              Stop waiting in line without knowing{" "}
              <span className="text-primary">how long</span> it will take.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground">
              AI-QMS replaces paper tokens and crowded lobbies with real-time
              queue management. Get a token for any registered institution in
              seconds — with your live position and a predicted wait time.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" render={<Link href="/join" />}>
                Get a token
                <ArrowRight />
              </Button>
              <WhatsAppEntry />
            </div>
            <p className="text-xs text-muted-foreground/70">
              No app needed · Works on any phone · WhatsApp where supported
            </p>
          </div>
        </section>

        {/* How it works — customers */}
        <section id="how-it-works" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Getting a token takes three steps
            </h2>
            <p className="mt-2 text-muted-foreground">
              From your phone browser — or WhatsApp at participating institutions.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {CUSTOMER_STEPS.map((item) => (
              <Card key={item.step}>
                <CardHeader>
                  <span className="flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {item.step}
                  </span>
                  <CardTitle className="mt-2">{item.title}</CardTitle>
                  <CardDescription>{item.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-y bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="mb-10 text-center">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Everything a modern queue needs
              </h2>
              <p className="mt-2 text-muted-foreground">
                One platform for customers, staff, and decision-makers.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <Card key={feature.title} className="h-full">
                  <CardHeader>
                    <feature.icon className="size-5 text-primary" />
                    <CardTitle className="mt-2">{feature.title}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* For institutions */}
        <section id="institutions" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="grid items-center gap-8 lg:grid-cols-2">
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Run your institution&apos;s queue on AI-QMS
              </h2>
              <p className="text-muted-foreground">
                Register your institution as an admin, create counters, assign
                personnel, and hand out tokens — online or on site. Your data
                stays isolated per tenant, and role-based access keeps staff
                permissions tight.
              </p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {[
                  "Admin dashboard: overview, live queue, counters, personnel",
                  "Token lifecycle: call → serve → complete, no-show handling",
                  "Server-side analytics with date ranges and CSV export",
                  "ML wait-time estimates powered by trained models",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <LineChart className="mt-0.5 size-4 shrink-0 text-primary" />
                    {line}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3 pt-2">
                <Button render={<Link href="/register" />}>
                  Create an institution
                  <ArrowRight />
                </Button>
                <Button variant="outline" render={<Link href="/login" />}>
                  Sign in
                </Button>
              </div>
            </div>
            <Card>
              <CardContent className="space-y-4 py-6">
                <div className="flex items-center justify-between border-b pb-3">
                  <span className="text-sm font-medium">Live queue preview</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
                    <span className="size-2 rounded-full bg-emerald-500" aria-hidden />
                    Live
                  </span>
                </div>
                {[
                  { name: "Pharmacy", now: "A-0042", waiting: 7 },
                  { name: "Teller 1", now: "TEL-0018", waiting: 4 },
                  { name: "Admissions", now: "ADM-0031", waiting: 11 },
                ].map((row) => (
                  <div key={row.name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{row.name}</span>
                    <span className="text-muted-foreground">
                      Now serving <strong className="tabular-nums">{row.now}</strong>
                    </span>
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums">
                      {row.waiting} waiting
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <p>AI-QMS — AI-assisted queue management</p>
          <div className="flex gap-4">
            <Link href="/join" className="hover:text-foreground">Get a token</Link>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <Link href="/register" className="hover:text-foreground">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
