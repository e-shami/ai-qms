"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Pencil } from "lucide-react";
import toast from "react-hot-toast";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useInstitution } from "@/hooks/use-resources";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import { institutionSchema, type InstitutionFormValues } from "@/lib/validators";

export function InstitutionSettings() {
  const { institution, loading, reload } = useInstitution();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InstitutionFormValues>({
    resolver: zodResolver(institutionSchema),
    defaultValues: { name: "", type: "", whatsappNumber: "" },
  });

  function openEdit() {
    if (!institution) return;
    setError(null);
    reset({
      name: institution.name,
      type: institution.type ?? "",
      whatsappNumber: institution.whatsapp_number ?? "",
    });
    setOpen(true);
  }

  async function onCopyCode() {
    if (!institution) return;
    try {
      await navigator.clipboard.writeText(institution.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — the code remains visible to copy by hand.
    }
  }

  async function onSubmit(values: InstitutionFormValues) {
    setError(null);
    try {
      await api.patch("/institutions/me", {
        name: values.name,
        type: values.type || null,
        whatsapp_number: values.whatsappNumber || null,
      });
      toast.success("Institution updated");
      setOpen(false);
      reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Update failed";
      setError(message);
      toast.error(message);
    }
  }

  if (loading && !institution) {
    return <Skeleton className="h-48" />;
  }
  if (!institution) return null;

  const rows: Array<[string, React.ReactNode]> = [
    ["Name", institution.name],
    [
      "Institution ID",
      <span key="code" className="inline-flex items-center gap-2">
        <span className="font-mono text-sm font-semibold tracking-widest">
          {institution.code}
        </span>
        <button
          type="button"
          onClick={onCopyCode}
          className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Copy institution ID"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </span>,
    ],
    ["Type", institution.type ?? "—"],
    ["WhatsApp", institution.whatsapp_number ?? "—"],
    ["Status", institution.is_active ? "Active" : "Deactivated"],
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>Institution</CardTitle>
            <CardDescription>
              The ID is generated once and never changes.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={openEdit}>
            <Pencil />
            Edit
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="divide-y">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
            >
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="min-w-0 truncate text-right text-sm font-medium">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit institution</DialogTitle>
            <DialogDescription>
              These details appear on public pages and tickets.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {error && <Alert variant="destructive">{error}</Alert>}
            <div className="space-y-2">
              <Label htmlFor="inst-name">Name</Label>
              <Input id="inst-name" aria-invalid={!!errors.name} {...register("name")} />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="inst-type">Type</Label>
              <Input
                id="inst-type"
                placeholder="e.g. hospital, bank"
                aria-invalid={!!errors.type}
                {...register("type")}
              />
              {errors.type && (
                <p className="text-xs text-destructive">{errors.type.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="inst-whatsapp">WhatsApp number</Label>
              <Input
                id="inst-whatsapp"
                placeholder="0311 1234567 or +92 311 1234567"
                autoComplete="tel"
                aria-invalid={!!errors.whatsappNumber}
                {...register("whatsappNumber")}
              />
              {errors.whatsappNumber && (
                <p className="text-xs text-destructive">
                  {errors.whatsappNumber.message}
                </p>
              )}
            </div>
            <DialogFooter showCloseButton>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

export function DangerZone() {
  const { institution, reload } = useInstitution();
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  const [confirmingPurge, setConfirmingPurge] = useState(false);
  const [purgeError, setPurgeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleDeactivate() {
    if (!institution) return;
    setBusy(true);
    try {
      await api.delete("/institutions/me");
      toast.success("Institution deactivated");
      setConfirmingDeactivate(false);
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deactivation failed");
    } finally {
      setBusy(false);
    }
  }

  async function handlePurge() {
    if (!institution) return;
    setBusy(true);
    setPurgeError(null);
    try {
      await api.post("/institutions/me/purge", {
        confirm_name: institution.name,
      });
      logout();
      toast.success("Institution permanently deleted");
      router.replace("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      setPurgeError(message);
    } finally {
      setBusy(false);
    }
  }

  if (!institution) return null;

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Danger zone</CardTitle>
        <CardDescription>
          Irreversible actions affecting every account, counter, and token in{" "}
          {institution.name}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium">Deactivate institution</p>
            <p className="text-xs text-muted-foreground">
              Reversible. Blocks new sign-ins and hides you from the public join page.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={busy || !institution.is_active}
            onClick={() => setConfirmingDeactivate(true)}
          >
            Deactivate
          </Button>
        </div>

        <div className="flex flex-col justify-between gap-3 rounded-lg border border-destructive/40 p-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-medium">Delete permanently</p>
            <p className="text-xs text-muted-foreground">
              Removes every counter, token, staff member, and account. No undo.
            </p>
          </div>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => {
              setPurgeError(null);
              setConfirmingPurge(true);
            }}
          >
            Delete…
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={confirmingDeactivate}
        onOpenChange={setConfirmingDeactivate}
        title={`Deactivate ${institution.name}?`}
        description="You can reactivate later by signing in and toggling status from here."
        confirmLabel="Deactivate"
        destructive
        busy={busy}
        onConfirm={handleDeactivate}
      />

      <ConfirmDialog
        open={confirmingPurge}
        onOpenChange={(next) => {
          setConfirmingPurge(next);
          if (!next) setPurgeError(null);
        }}
        title={`Delete ${institution.name} forever?`}
        description="Every counter, token, staff account, and record is erased immediately."
        confirmLabel="Delete permanently"
        destructive
        busy={busy}
        error={purgeError}
        requireText={institution.name}
        onConfirm={handlePurge}
      />
    </Card>
  );
}
