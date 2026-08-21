"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel } from "@/components/ui/status";
import { useCounters, usePersonnel } from "@/hooks/use-resources";
import { api } from "@/lib/api-client";
import { useAuthStore } from "@/store/auth";
import {
  NO_COUNTER_VALUE,
  personnelFormSchema,
  staffAccountSchema,
  type PersonnelFormValues,
  type StaffAccountFormValues,
} from "@/lib/validators";
import type { Personnel } from "@/types";

function StaffAccountDialog({
  member,
  onSaved,
  onError,
}: {
  member: Personnel;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StaffAccountFormValues>({
    resolver: zodResolver(staffAccountSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: StaffAccountFormValues) {
    onError(null);
    try {
      await api.post(`/personnel/${member.id}/account`, values);
      toast.success(`Login created for ${member.name}`);
      reset({ email: "", password: "" });
      setOpen(false);
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Account creation failed";
      onError(message);
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="xs" variant="outline" />}>
        Create login
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create login for {member.name}</DialogTitle>
          <DialogDescription>
            Creates a staff account (read-only queue access) linked to this person.
            Share the password securely.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="staff-email">Email</Label>
            <Input
              id="staff-email"
              type="email"
              placeholder="staff@institution.com"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-password">Password</Label>
            <Input
              id="staff-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PersonnelFormDialog({
  member,
  counters,
  onSaved,
  onError,
}: {
  member?: Personnel;
  counters: Array<{ id: number; name: string }>;
  onSaved: () => void;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PersonnelFormValues>({
    resolver: zodResolver(personnelFormSchema),
    defaultValues: {
      name: member?.name ?? "",
      title: member?.title ?? "",
      counterId:
        member?.counter_id != null ? String(member.counter_id) : NO_COUNTER_VALUE,
    },
  });

  const counterId = watch("counterId");

  useEffect(() => {
    if (open) {
      reset({
        name: member?.name ?? "",
        title: member?.title ?? "",
        counterId:
          member?.counter_id != null ? String(member.counter_id) : NO_COUNTER_VALUE,
      });
    }
  }, [member, open, reset]);

  async function onSubmit(values: PersonnelFormValues) {
    onError(null);
    const payload = {
      name: values.name,
      title: values.title || null,
      counter_id: values.counterId === NO_COUNTER_VALUE ? null : Number(values.counterId),
    };
    try {
      if (member) {
        await api.patch(`/personnel/${member.id}`, payload);
        toast.success(`Staff member "${values.name}" updated`);
      } else {
        await api.post("/personnel", payload);
        toast.success(`Staff member "${values.name}" added`);
      }
      setOpen(false);
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      onError(message);
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          member ? <Button size="xs" variant="outline" /> : <Button size="sm" />
        }
      >
        {member ? "Edit" : (
          <>
            <Plus />
            Add staff
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{member ? `Edit ${member.name}` : "Add staff member"}</DialogTitle>
          <DialogDescription>
            Staff work the queue; assigning a counter links them to it.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="personnel-name">Name</Label>
            <Input id="personnel-name" aria-invalid={!!errors.name} {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="personnel-title">Title (optional)</Label>
            <Input
              id="personnel-title"
              placeholder="e.g. nurse, teller, registrar"
              aria-invalid={!!errors.title}
              {...register("title")}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="personnel-counter">Counter (optional)</Label>
            <Select
              value={counterId}
              onValueChange={(value) =>
                setValue("counterId", value ?? NO_COUNTER_VALUE, { shouldValidate: true })
              }
            >
              <SelectTrigger className="w-full" aria-invalid={!!errors.counterId}>
                <SelectValue placeholder="No counter assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COUNTER_VALUE} label="No counter assigned">
                  No counter assigned
                </SelectItem>
                {counters.map((counter) => (
                  <SelectItem
                    key={counter.id}
                    value={String(counter.id)}
                    label={counter.name}
                  >
                    {counter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.counterId && (
              <p className="text-xs text-destructive">{errors.counterId.message}</p>
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
  );
}

export default function PersonnelPage() {
  const { personnel, loading, error, reload } = usePersonnel();
  const { counters } = useCounters();
  const role = useAuthStore((state) => state.user?.role);
  const isAdmin = role === "admin";
  const [actionError, setActionError] = useState<string | null>(null);

  async function deactivate(member: Personnel) {
    if (!confirm(`Deactivate ${member.name}?`)) return;
    try {
      await api.delete(`/personnel/${member.id}`);
      setActionError(null);
      toast.success(`"${member.name}" deactivated`);
      reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Deactivation failed";
      setActionError(message);
      toast.error(message);
    }
  }

  async function reactivate(member: Personnel) {
    try {
      await api.post(`/personnel/${member.id}/activate`);
      setActionError(null);
      toast.success(`"${member.name}" activated`);
      reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reactivation failed";
      setActionError(message);
      toast.error(message);
    }
  }

  const counterName = (id: number | null) =>
    counters?.find((c) => c.id === id)?.name ?? "—";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Personnel</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Manage staff and their counter assignments."
              : "Your institution's staff (read-only for staff)."}
          </p>
        </div>
        {isAdmin && (
          <PersonnelFormDialog
            counters={counters ?? []}
            onSaved={reload}
            onError={setActionError}
          />
        )}
      </div>

      <Panel title="All staff">
        {actionError && <Alert variant="destructive">{actionError}</Alert>}
        {error && <Alert variant="destructive">{error}</Alert>}
        {loading && !personnel ? (
          <div className="space-y-3">
            <Skeleton className="h-8" />
            <Skeleton className="h-8" />
          </div>
        ) : !personnel || personnel.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No staff members yet{isAdmin ? " — add your first one above." : "."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Title</TableHead>
                <TableHead>Counter</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Login</TableHead>
                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {personnel.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {member.title ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {counterName(member.counter_id)}
                  </TableCell>
                  <TableCell>
                    {member.is_active ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {member.user_id != null ? (
                      <Badge variant="outline">Has login</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <PersonnelFormDialog
                          member={member}
                          counters={counters ?? []}
                          onSaved={reload}
                          onError={setActionError}
                        />
                        {member.is_active ? (
                          <>
                            {member.user_id == null && (
                              <StaffAccountDialog
                                member={member}
                                onSaved={reload}
                                onError={setActionError}
                              />
                            )}
                            <Button
                              size="xs"
                              variant="destructive"
                              onClick={() => deactivate(member)}
                            >
                              Deactivate
                            </Button>
                          </>
                        ) : (
                          <Button size="xs" onClick={() => reactivate(member)}>
                            Activate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>
    </>
  );
}
