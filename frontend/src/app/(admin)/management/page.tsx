"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScanLine, Users } from "lucide-react";

import { CountersTab } from "@/components/management/counters-tab";
import { StaffTab } from "@/components/management/staff-tab";
import { PageHeader } from "@/components/shared/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const TAB_VALUES = ["staff", "counters"] as const;
type TabValue = (typeof TAB_VALUES)[number];

function parseTab(raw: string | null): TabValue {
  return TAB_VALUES.includes(raw as TabValue) ? (raw as TabValue) : "staff";
}

/**
 * useSearchParams forces this subtree to render client-side only; the
 * Suspense boundary keeps the rest of the route prerenderable.
 */
function ManagementContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));

  function handleTabChange(value: string | null) {
    const next = parseTab(value);
    // Keep the tab in the URL so staff/counters views are linkable.
    router.replace(`/management?tab=${next}`, { scroll: false });
  }

  return (
    <>
      <PageHeader
        title="Management"
        description="Run your floor — people on one side, service points on the other."
      />

      <Tabs value={tab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="staff">
            <Users />
            Staff
          </TabsTrigger>
          <TabsTrigger value="counters">
            <ScanLine />
            Counters
          </TabsTrigger>
        </TabsList>
        <TabsContent value="staff">
          <StaffTab />
        </TabsContent>
        <TabsContent value="counters">
          <CountersTab />
        </TabsContent>
      </Tabs>
    </>
  );
}

export default function ManagementPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-64" />
        </div>
      }
    >
      <ManagementContent />
    </Suspense>
  );
}
