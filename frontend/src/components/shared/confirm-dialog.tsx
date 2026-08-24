"use client";

import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  error?: string | null;
  /** When set, the confirm button stays disabled until the typed text matches. */
  requireText?: string;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  busy = false,
  error = null,
  requireText,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const matches = !requireText || typed === requireText;

  function handleOpenChange(next: boolean) {
    if (!next) setTyped("");
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {requireText && (
          <div className="space-y-2">
            <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={requireText}
              aria-label={`Type ${requireText} to confirm`}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Type <span className="font-medium text-foreground">{requireText}</span> to
              enable the button.
            </p>
          </div>
        )}
        {error && <Alert variant="destructive">{error}</Alert>}
        <DialogFooter showCloseButton>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!matches || busy}
            onClick={() => {
              onConfirm();
            }}
          >
            {busy ? "Working…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
