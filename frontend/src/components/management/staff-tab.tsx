"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Plus, Search, ShieldOff, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusDot } from "@/components/ui/status-dot";
import type { StatusTone } from "@/components/ui/status-dot";
import { useCounters, usePersonnel } from "@/hooks/use-resources";
import { api } from "@/lib/api-client";
import {
  NO_COUNTER_VALUE,
  resetPasswordSchema,
  staffCreateSchema,
  type ResetPasswordFormValues,
  type StaffCreateFormValues,
} from "@/lib/validators";
import type { Counter, Personnel } from "@/types";

function presenceTone(member: Personnel): StatusTone {
  if (member.work_status === "available") return "idle";
  if (member.work_status === "on_break") return "break";
  return "off";
}

function presenceLabel(member: Personnel): string {
  if (member.work_status === "available") return "Available";
  if (member.work_status === "on_break") return "On break";
  return "Off duty";
}

/** Create (person + credentials) or edit (person fields only). */
function StaffFormDialog({
  member,
  counters,
  open,
  onOpenChange,
  onSaved,
}: {
  member?: Personnel;
  counters: Counter[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const editing = Boolean(member);
  const schema = staffCreateSchema;
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<StaffCreateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: member?.name ?? "",
      title: member?.title ?? "",
      counterId:
        member?.counter_id != null ? String(member.counter_id) : NO_COUNTER_VALUE,
      email: "",
      password: "",
    },
  });

  const counterId = watch("counterId");

  // Form fields re-seed from props whenever the dialog (re)opens; errors
  // are cleared on close so a stale message never survives a remount.
  useEffect(() => {
    if (open) {
      reset({
        name: member?.name ?? "",
        title: member?.title ?? "",
        counterId:
          member?.counter_id != null ? String(member.counter_id) : NO_COUNTER_VALUE,
        email: "",
        password: "",
      });
    }
  }, [member, open, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function onSubmit(values: StaffCreateFormValues) {
    setError(null);
    const counter =
      values.counterId === NO_COUNTER_VALUE ? null : Number(values.counterId);
    try {
      if (editing && member) {
        await api.patch(`/personnel/${member.id}`, {
          name: values.name,
          title: values.title || null,
          counter_id: counter,
        });
        toast.success(`${values.name} updated`);
      } else {
        await api.post("/personnel", {
          name: values.name,
          title: values.title || null,
          counter_id: counter,
          account_email: values.email,
          account_password: values.password,
        });
        toast.success(`${values.name} added with a login`);
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Save failed";
      setError(message);
      toast.error(message);
    }
  }

  // Editing reuses the same shape minus credential fields.
  const editSubmit = handleSubmit(onSubmit);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${member?.name}` : "Add staff member"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update details or move this person to another counter."
              : "Creates the person and their sign-in in one step. Share the password securely."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={editing ? editSubmit : handleSubmit(onSubmit)} noValidate className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="space-y-2">
            <Label htmlFor="staff-name">Name</Label>
            <Input id="staff-name" aria-invalid={!!errors.name} {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-title">Title (optional)</Label>
            <Input
              id="staff-title"
              placeholder="e.g. nurse, teller, registrar"
              aria-invalid={!!errors.title}
              {...register("title")}
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-counter">Counter</Label>
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
                  <SelectItem key={counter.id} value={String(counter.id)} label={counter.name}>
                    {counter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.counterId && (
              <p className="text-xs text-destructive">{errors.counterId.message}</p>
            )}
          </div>
          {!editing && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="staff-email">Sign-in email</Label>
                <Input
                  id="staff-email"
                  type="email"
                  autoComplete="off"
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
            </div>
          )}
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

function ResetPasswordDialog({
  member,
  open,
  onOpenChange,
}: {
  member: Personnel;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (open) {
      reset({ newPassword: "", confirmPassword: "" });
    }
  }, [open, reset]);

  function handleOpenChange(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  async function onSubmit(values: ResetPasswordFormValues) {
    setError(null);
    try {
      await api.post(`/personnel/${member.id}/reset-password`, {
        new_password: values.newPassword,
      });
      toast.success(`New password set for ${member.name}`);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Reset failed";
      setError(message);
      toast.error(message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password for {member.name}</DialogTitle>
          <DialogDescription>
            Their current sessions are signed out immediately.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          {error && <Alert variant="destructive">{error}</Alert>}
          <div className="space-y-2">
            <Label htmlFor="reset-new">New password</Label>
            <Input
              id="reset-new"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.newPassword}
              {...register("newPassword")}
            />
            {errors.newPassword && (
              <p className="text-xs text-destructive">{errors.newPassword.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="reset-confirm">Confirm password</Label>
            <Input
              id="reset-confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && (
              <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>
            )}
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Setting…" : "Set password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StaffTab() {
  const { personnel, loading, error, reload } = usePersonnel();
  const { counters } = useCounters();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editMember, setEditMember] = useState<Personnel | null>(null);
  const [resetMember, setResetMember] = useState<Personnel | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Personnel | null>(null);
  // Login-enabled state lives on the linked User row, which the personnel
  // payload does not expose — tracked here from the moment an admin toggles it.
  const [blockedLogins, setBlockedLogins] = useState<Record<number, boolean>>({});

  function markLoginBlocked(memberId: number, blocked: boolean) {
    setBlockedLogins((prev) => ({ ...prev, [memberId]: blocked }));
  }

  const filtered = useMemo(() => {
    if (!personnel) return null;
    const needle = query.trim().toLowerCase();
    if (!needle) return personnel;
    return personnel.filter(
      (member) =>
        member.name.toLowerCase().includes(needle) ||
        (member.title ?? "").toLowerCase().includes(needle)
    );
  }, [personnel, query]);

  const counterName = (id: number | null) =>
    id == null ? "—" : counters?.find((c) => c.id === id)?.name ?? `#${id}`;

  async function toggleActive(member: Personnel) {
    const action = member.is_active
      ? () => api.delete(`/personnel/${member.id}`)
      : () => api.post(`/personnel/${member.id}/activate`);
    try {
      await action();
      toast.success(member.is_active ? `${member.name} deactivated` : `${member.name} activated`);
      setDeactivateTarget(null);
      reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Action failed";
      toast.error(message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search staff…"
            className="pl-8"
            aria-label="Search staff"
          />
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Add staff
        </Button>
      </div>

      {error && <Alert variant="destructive">{error}</Alert>}

      {loading && !filtered ? (
        <div className="space-y-2">
          <div className="h-9 animate-pulse rounded-md bg-muted" />
          <div className="h-9 animate-pulse rounded-md bg-muted" />
          <div className="h-9 animate-pulse rounded-md bg-muted" />
        </div>
      ) : !filtered || filtered.length === 0 ? (
        <EmptyState
          title={query ? "No matches" : "No staff members yet"}
          description={
            query ? "Try a different search." : "Add your first staff member to get started."
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden rounded-lg border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Counter</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Login</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <p className="font-medium">{member.name}</p>
                      {member.title && (
                        <p className="text-xs text-muted-foreground">{member.title}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {counterName(member.counter_id)}
                    </TableCell>
                    <TableCell>
                      {member.is_active ? (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          <StatusDot tone={presenceTone(member)} />
                          {presenceLabel(member)}
                        </span>
                      ) : (
                        <Badge variant="secondary">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {member.user_id != null ? (
                        blockedLogins[member.id] ? (
                          <Badge variant="destructive">Blocked</Badge>
                        ) : (
                          <Badge variant="outline">Enabled</Badge>
                        )
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => setEditMember(member)}
                        >
                          Edit
                        </Button>
                        {member.user_id != null && member.is_active && (
                          <>
                            <Button
                              size="xs"
                              variant="outline"
                              onClick={() => setResetMember(member)}
                            >
                              <KeyRound />
                              Password
                            </Button>
                            <DisableLoginButton
                              member={member}
                              blocked={Boolean(blockedLogins[member.id])}
                              onToggled={(blocked) => markLoginBlocked(member.id, blocked)}
                              onDone={reload}
                            />
                          </>
                        )}
                        {member.is_active ? (
                          <Button
                            size="xs"
                            variant="destructive"
                            onClick={() => setDeactivateTarget(member)}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button size="xs" onClick={() => toggleActive(member)}>
                            Activate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((member) => (
              <li key={member.id} className="rounded-lg border bg-card p-4">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{member.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {[member.title, counterName(member.counter_id)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {member.is_active ? (
                    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <StatusDot tone={presenceTone(member)} />
                      {presenceLabel(member)}
                    </span>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="xs" variant="outline" onClick={() => setEditMember(member)}>
                    Edit
                  </Button>
                  {member.user_id != null && member.is_active && (
                    <>
                      <Button size="xs" variant="outline" onClick={() => setResetMember(member)}>
                        <KeyRound />
                        Password
                      </Button>
                      <DisableLoginButton
                        member={member}
                        blocked={Boolean(blockedLogins[member.id])}
                        onToggled={(blocked) => markLoginBlocked(member.id, blocked)}
                        onDone={reload}
                      />
                    </>
                  )}
                  {member.is_active ? (
                    <Button
                      size="xs"
                      variant="destructive"
                      onClick={() => setDeactivateTarget(member)}
                    >
                      Deactivate
                    </Button>
                  ) : (
                    <Button size="xs" onClick={() => toggleActive(member)}>
                      Activate
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <StaffFormDialog
        counters={counters ?? []}
        open={createOpen || editMember !== null}
        member={editMember ?? undefined}
        onOpenChange={(next) => {
          setCreateOpen(next);
          if (!next) setEditMember(null);
        }}
        onSaved={reload}
      />

      <ResetPasswordDialog
        member={resetMember!}
        open={resetMember !== null}
        onOpenChange={(next) => {
          if (!next) setResetMember(null);
        }}
      />

      <ConfirmDialog
        open={deactivateTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeactivateTarget(null);
        }}
        title={`Deactivate ${deactivateTarget?.name ?? ""}?`}
        description="They disappear from the floor view and cannot be assigned until reactivated."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => deactivateTarget && toggleActive(deactivateTarget)}
      />
    </div>
  );
}

/**
 * Toggles the linked login without touching the personnel record.
 * Reports outcome through toasts and lifts its new state upward so the
 * table badge stays in sync immediately.
 */
function DisableLoginButton({
  member,
  blocked,
  onToggled,
  onDone,
}: {
  member: Personnel;
  blocked: boolean;
  onToggled: (blocked: boolean) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      await api.post(`/personnel/${member.id}/set-login`, { enabled: blocked });
      onToggled(!blocked);
      toast.success(blocked ? `Login enabled for ${member.name}` : `Login disabled for ${member.name}`);
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Toggle failed";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="xs" variant="outline" disabled={busy} onClick={toggle}>
      {blocked ? <ShieldCheck /> : <ShieldOff />}
      {blocked ? "Unblock" : "Block"}
    </Button>
  );
}
