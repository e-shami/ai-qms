"use client";

import Image from "next/image";
import { MessageCircle, QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { whatsappEntry } from "@/lib/whatsapp";

export function WhatsAppEntry() {
  const entry = whatsappEntry(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);

  if (!entry) {
    return (
      <div className="space-y-1">
        <Button size="lg" variant="outline" disabled>
          <MessageCircle aria-hidden="true" />
          WhatsApp unavailable
        </Button>
        <p className="text-xs text-muted-foreground">You can still get a token online.</p>
      </div>
    );
  }

  return (
    <>
      <Button
        size="lg"
        variant="outline"
        className="md:hidden"
        nativeButton={false}
        role="link"
        render={<a href={entry.url} target="_blank" rel="noopener noreferrer" />}
      >
        <MessageCircle aria-hidden="true" />
        Chat on WhatsApp
        <span className="sr-only"> (opens in a new tab)</span>
      </Button>
      <Dialog>
        <DialogTrigger render={<Button size="lg" variant="outline" className="hidden md:inline-flex" />}>
          <QrCode aria-hidden="true" />
          Get a token on WhatsApp
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chat with the WhatsApp bot</DialogTitle>
            <DialogDescription>
              {entry.hasMatchingQr
                ? "Scan with your phone camera, then send a message in WhatsApp to get started."
                : "Open WhatsApp to message the bot. A QR code is not available for this number."}
            </DialogDescription>
          </DialogHeader>
          {entry.hasMatchingQr && (
            <div className="mx-auto rounded-lg bg-white p-4">
              <Image
                src="/images/whatsapp-qrcode.png"
                alt="QR code to open a chat with the WhatsApp bot"
                width={196}
                height={196}
                unoptimized
              />
            </div>
          )}
          <Button
            nativeButton={false}
            role="link"
            render={<a href={entry.url} target="_blank" rel="noopener noreferrer" />}
          >
            <MessageCircle aria-hidden="true" />
            Open WhatsApp chat
            <span className="sr-only"> (opens in a new tab)</span>
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
