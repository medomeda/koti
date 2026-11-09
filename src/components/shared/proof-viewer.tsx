"use client";

import { Paperclip } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader } from "@/components/ui/dialog";

/** Ouvre le justificatif d'un paiement (image servie par /api/v1/proofs/[id] : réservée au membre et aux administrateurs). */
export function ProofButton({ proofId, label = "Justificatif" }: { proofId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Paperclip /> {label}
      </Button>
      {open && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader title="Justificatif de paiement" description="Capture ou photo jointe par le membre." />
            <DialogBody>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/v1/proofs/${proofId}`} alt="Justificatif de paiement" className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg border" />
            </DialogBody>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
