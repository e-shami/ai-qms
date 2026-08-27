"use client";

import { LegacyRedirect } from "@/components/shared/legacy-redirect";

export default function RedirectPage() {
  return <LegacyRedirect adminTarget="/management?tab=counters" />;
}
