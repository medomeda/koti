"use client";

import { Check, Copy, Mail, MoreVertical, Phone, Ticket, UserMinus, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cancelInvitationAction, inviteMemberAction, removeMemberAction } from "@/actions/members";
import { createTicketAction, deleteTicketAction } from "@/actions/tickets";
import { formatFCFA } from "@/lib/utils/money";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/misc";
import { cn } from "@/lib/utils/cn";
import { ConfirmDialog } from "./confirm-dialog";
import { useAction } from "./use-action";

export function InviteButton({ tontineId, disabled }: { tontineId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={disabled}>
        <UserPlus /> Inviter
      </Button>
      {open && <InviteDialog tontineId={tontineId} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function InviteDialog({ tontineId, open, onOpenChange }: { tontineId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [channel, setChannel] = useState<"EMAIL" | "PHONE">("EMAIL");
  const [value, setValue] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const invite = useAction(inviteMemberAction, {
    onSuccess: (d) => {
      setLink(`${window.location.origin}${d.path}`);
      setEmailed(d.emailed);
    },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void invite.run(channel === "EMAIL" ? { tontineId, channel, email: value } : { tontineId, channel, phone: value });
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Lien copié.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copie impossible : sélectionnez le lien manuellement.");
    }
  };

  const again = () => {
    setLink(null);
    setValue("");
  };

  const fieldError = invite.fieldErrors.email ?? invite.fieldErrors.phone;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader title="Inviter un membre" description="La personne reçoit un lien personnel, valable 7 jours. Elle pourra créer son compte si elle n'en a pas." />
        {link ? (
          <>
            <DialogBody>
              <Alert tone="success" icon={<Check />} title="Invitation créée">
                {emailed ? "Un e-mail contenant le lien vient d'être envoyé. " : ""}
                Si la personne a déjà un compte KOTI, elle la voit dans ses alertes. {emailed ? "Vous pouvez aussi lui transmettre ce lien (WhatsApp, SMS…) :" : "Partagez-lui ce lien (WhatsApp, SMS…) :"}
              </Alert>
              <div className="flex gap-2">
                <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Lien d'invitation" className="font-mono text-xs sm:text-xs" />
                <Button variant="outline" size="icon" onClick={copy} aria-label="Copier le lien">
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Ce lien ne sera plus affiché : il est stocké sous forme chiffrée. Seul le contact invité peut l&apos;utiliser. Les invitations par téléphone ne sont pas envoyées automatiquement : partagez le lien vous-même.</p>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={again}>
                Inviter une autre personne
              </Button>
              <Button onClick={() => onOpenChange(false)}>Terminé</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate className="contents">
            <DialogBody>
              <div role="radiogroup" aria-label="Moyen d'invitation" className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
                {(["EMAIL", "PHONE"] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={channel === c}
                    onClick={() => {
                      setChannel(c);
                      setValue("");
                    }}
                    className={cn("flex h-9 items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors", channel === c ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground")}
                  >
                    {c === "EMAIL" ? <Mail className="size-4" /> : <Phone className="size-4" />}
                    {c === "EMAIL" ? "E-mail" : "Téléphone"}
                  </button>
                ))}
              </div>
              <Field label={channel === "EMAIL" ? "Adresse e-mail" : "Numéro de téléphone"} required error={fieldError}>
                {(p) =>
                  channel === "EMAIL" ? (
                    <Input {...p} type="email" inputMode="email" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="ex. mariam@exemple.ci" autoFocus />
                  ) : (
                    <Input {...p} type="tel" inputMode="tel" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder="+225 07 00 00 00 00" autoFocus />
                  )
                }
              </Field>
              {!fieldError && <FormError message={invite.error} />}
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Annuler
              </Button>
              <Button type="submit" loading={invite.pending} disabled={!value.trim()}>
                Créer l&apos;invitation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function MemberMenu({ tontineId, memberId, name }: { tontineId: string; memberId: string; name: string }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${name}`}>
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem destructive onSelect={() => setConfirm(true)}>
            <UserMinus /> Retirer de la tontine
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Retirer ${name} ?`}
        description="Son historique de paiements est conservé. Ses échéances futures non payées sont supprimées et son tour de main à venir est annulé."
        confirmLabel="Retirer"
        destructive
        reason={{ label: "Motif", required: true, placeholder: "Ex. départ volontaire" }}
        onConfirm={async (reason) => {
          const res = await removeMemberAction({ tontineId, memberId, reason });
          if (!res.ok) return res.error;
          toast.success(`${name} a été retiré(e) de la tontine.`);
          return null;
        }}
      />
    </>
  );
}

export function CancelInvitationButton({ tontineId, invitationId }: { tontineId: string; invitationId: string }) {
  const cancel = useAction(cancelInvitationAction, { success: "Invitation annulée." });
  return (
    <Button variant="ghost" size="sm" onClick={() => cancel.run({ tontineId, invitationId })} loading={cancel.pending}>
      <X /> Annuler
    </Button>
  );
}

export interface TicketChip {
  id: string;
  label: string;
  rotationPosition: number | null;
}

/**
 * Tickets d'un membre. Les actions sont proposées à l'administrateur uniquement, en brouillon (confort :
 * le serveur revérifie droits, statut, option « tickets multiples » et plafond à chaque appel).
 */
export function TicketManager({
  tontineId,
  memberId,
  name,
  tickets,
  contributionAmount,
  maxTickets,
  canAdd,
  canDelete,
}: {
  tontineId: string;
  memberId: string;
  name: string;
  tickets: TicketChip[];
  contributionAmount: number;
  maxTickets: number;
  canAdd: boolean;
  canDelete: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<TicketChip | null>(null);
  const count = tickets.length;
  const showAdd = canAdd && count < maxTickets;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tickets.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
          <Ticket className="size-3" aria-hidden /> {t.label}
          {t.rotationPosition !== null && <span className="font-normal text-muted-foreground">· tour {t.rotationPosition}</span>}
          {canDelete && count > 1 && (
            <button type="button" onClick={() => setRemoving(t)} className="-mr-1 rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-destructive" aria-label={`Supprimer le ticket ${t.label} de ${name}`}>
              <X className="size-3" />
            </button>
          )}
        </span>
      ))}
      {showAdd && (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setAdding(true)}>
          Ajouter un ticket
        </Button>
      )}
      <ConfirmDialog
        open={adding}
        onOpenChange={setAdding}
        title="Ajouter un ticket ?"
        description={
          <>
            <span className="block">
              Membre : <strong className="text-foreground">{name}</strong>
            </span>
            <span className="block">
              Tickets : <strong className="text-foreground">{count} → {count + 1}</strong> (maximum {maxTickets})
            </span>
            <span className="block">
              Cotisation par ticket : <strong className="tabular-nums text-foreground">{formatFCFA(contributionAmount)}</strong>
            </span>
            <span className="block">
              Nouvelle cotisation par période : <strong className="tabular-nums text-primary">{formatFCFA((count + 1) * contributionAmount)}</strong>
            </span>
          </>
        }
        confirmLabel="Ajouter le ticket"
        onConfirm={async () => {
          const res = await createTicketAction({ tontineId, memberId });
          if (!res.ok) return res.error;
          toast.success(`Ticket ajouté pour ${name}.`);
          return null;
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Supprimer le ticket ${removing?.label ?? ""} ?`}
        description="Possible uniquement avant le démarrage. Son tour de main est retiré du calendrier et son numéro ne sera pas réutilisé."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          if (!removing) return null;
          const res = await deleteTicketAction({ tontineId, ticketId: removing.id });
          if (!res.ok) return res.error;
          toast.success(`Ticket ${removing.label} supprimé.`);
          return null;
        }}
      />
    </div>
  );
}
