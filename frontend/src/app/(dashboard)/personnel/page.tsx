"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

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
import type { Personnel } from "@/types";

const NO_COUNTER = "__none__";

function StaffAccountDialog({
  member,
  onSaved,
  onError,
}: {
  member: Personnel;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post(`/personnel/${member.id}/account`, {
        email,
        password,
      });
      setOpen(false);
      setEmail("");
      setPassword("");
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Account creation failed");
    } finally {
      setBusy(false);
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
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="staff-email">Email</Label>
            <Input
              id="staff-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@institution.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="staff-password">Password</Label>
            <Input
              id="staff-password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={busy}>
              {busy ? "Creating…" : "Create account"}
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
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(member?.name ?? "");
  const [title, setTitle] = useState(member?.title ?? "");
  const [counterId, setCounterId] = useState(
    member?.counter_id != null ? String(member.counter_id) : NO_COUNTER
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        title: title.trim() || null,
        counter_id: counterId === NO_COUNTER ? null : Number(counterId),
      };
      if (member) {
        await api.patch(`/personnel/${member.id}`, payload);
      } else {
        await api.post("/personnel", payload);
      }
      setOpen(false);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
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
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="personnel-name">Name</Label>
            <Input
              id="personnel-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="personnel-title">Title (optional)</Label>
            <Input
              id="personnel-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. nurse, teller, registrar"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="personnel-counter">Counter (optional)</Label>
            <Select
              value={counterId}
              onValueChange={(value) => setCounterId(value ?? NO_COUNTER)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="No counter assigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COUNTER} label="No counter assigned">
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
          </div>
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
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
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Deactivation failed");
    }
  }

  async function reactivate(member: Personnel) {
    try {
      await api.post(`/personnel/${member.id}/activate`);
      setActionError(null);
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Reactivation failed");
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