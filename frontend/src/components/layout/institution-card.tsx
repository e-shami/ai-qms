"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, MessageCircle, Pencil } from "lucide-react";

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
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  function openEdit() {
    if (institution) {
      setName(institution.name);
      setType(institution.type ?? "");
      setWhatsappNumber(institution.whatsapp_number ?? "");
    }
    setError(null);
    setOpen(true);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.patch("/institutions/me", {
        name: name.trim(),
        type: type.trim() || null,
        whatsapp_number:
          whatsappNumber.trim() ? whatsappNumber.replace(/[^\d+]/g, "") : null,
      });
      setOpen(false);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function deactivateInstitution() {
    if (!institution) return;
    if (
      !confirm(
        `Deactivate ${institution.name}? Customers can no longer get tokens here and all users lose access. This is soft-deactivation.`
      )
    )
      return;
    setDeactivating(true);
    try {
      await api.delete("/institutions/me");
      logout();
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deactivation failed");
      setDeactivating(false);
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
              if (next) openEdit();
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
                  Updates your institution&apos;s public details. The WhatsApp
                  number enables customer token flows via WhatsApp.
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
                <div className="space-y-2">
                  <Label htmlFor="inst-whatsapp">WhatsApp number (optional)</Label>
                  <Input
                    id="inst-whatsapp"
                    type="tel"
                    value={whatsappNumber}
                    onChange={(e) => setWhatsappNumber(e.target.value)}
                    placeholder="+251911234567"
                  />
                  <p className="text-xs text-muted-foreground">
                    International format with country code; digits only after saving.
                  </p>
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
              <span className="text-muted-foreground">WhatsApp</span>
              <span className="flex items-center gap-1.5 text-right font-medium tabular-nums">
                {institution.is_active && institution.whatsapp_number && (
                  <MessageCircle className="size-3.5 text-emerald-600" />
                )}
                {institution.whatsapp_number ?? "—"}
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
            {isAdmin && institution.is_active && (
              <div className="border-t pt-3">
                <p className="mb-2 text-xs text-muted-foreground">Danger zone</p>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={deactivateInstitution}
                  disabled={deactivating}
                  className="w-full"
                >
                  {deactivating ? "Deactivating…" : "Deactivate institution"}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
