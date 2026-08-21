"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, MessageCircle, Pencil } from "lucide-react";
import toast from "react-hot-toast";

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
import { institutionSchema, type InstitutionFormValues } from "@/lib/validators";

export function InstitutionCard() {
  const { institution, reload } = useInstitution();
  const isAdmin = useAuthStore((state) => state.user?.role) === "admin";
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState(false);

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
    if (institution) {
      reset({
        name: institution.name,
        type: institution.type ?? "",
        whatsappNumber: institution.whatsapp_number ?? "",
      });
    }
    setError(null);
    setOpen(true);
  }

  async function onSubmit(values: InstitutionFormValues) {
    setError(null);
    try {
      await api.patch("/institutions/me", {
        name: values.name,
        type: values.type || null,
        whatsapp_number: values.whatsappNumber ? values.whatsappNumber : null,
      });
      toast.success("Institution updated");
      setOpen(false);
      reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
      toast.error(message);
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
      toast.success(`${institution.name} deactivated`);
      logout();
      router.replace("/login");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deactivation failed";
      setError(message);
      toast.error(message);
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
              if (next) openEdit();
              else setOpen(false);
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
                  <Label htmlFor="inst-type">Type (optional)</Label>
                  <Input
                    id="inst-type"
                    placeholder="e.g. hospital, bank, university"
                    aria-invalid={!!errors.type}
                    {...register("type")}
                  />
                  {errors.type && (
                    <p className="text-xs text-destructive">{errors.type.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inst-whatsapp">WhatsApp number (optional)</Label>
                  <Input
                    id="inst-whatsapp"
                    type="tel"
                    placeholder="+251911234567"
                    aria-invalid={!!errors.whatsappNumber}
                    {...register("whatsappNumber")}
                  />
                  {errors.whatsappNumber ? (
                    <p className="text-xs text-destructive">{errors.whatsappNumber.message}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      International format with country code.
                    </p>
                  )}
                </div>
                <DialogFooter showCloseButton>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Saving…" : "Save"}
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
