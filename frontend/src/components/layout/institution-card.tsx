"use client";

import { useState } from "react";
import { Building2, Pencil } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useInstitution } from "@/hooks/use-resources";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";

export function InstitutionCard() {
  const { institution, reload } = useInstitution();
  const isAdmin = useAuthStore((state) => state.user?.role) === "admin";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch("/institutions/me", {
        name: name.trim(),
        type: type.trim() || null,
      });
      setOpen(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="h-fit">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="size-4 text-muted-foreground" />
            Institution
          </CardTitle>
          <CardDescription>
            Your tenant workspace details.
          </CardDescription>
        </div>
        {isAdmin && (
          <Dialog
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              if (next && institution) {
                setName(institution.name);
                setType(institution.type ?? "");
              }
            }}
          >
            <DialogTrigger render={<Button size="xs" variant="outline" />}>
              <Pencil />
              Edit
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit institution</DialogTitle>
                <DialogDescription>
                  Updates your institution&apos;s public details. Staff at other
                  institutions are unaffected.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={onSubmit} className="space-y-4">
                {error && <Alert variant="destructive">{error}</Alert>}
                <div className="space-y-2">
                  <Label htmlFor="inst-name">Name</Label>
                  <Input
                    id="inst-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inst-type">Type (optional)</Label>
                  <Input
                    id="inst-type"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    placeholder="e.g. hospital, bank, university"
                  />
                </div>
                <DialogFooter showCloseButton>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!institution ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          <>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Name</span>
              <span className="text-right font-medium">{institution.name}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Type</span>
              <span className="text-right font-medium capitalize">
                {institution.type ?? "—"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium">
                {institution.is_active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium">
                {new Date(institution.created_at).toLocaleDateString()}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}