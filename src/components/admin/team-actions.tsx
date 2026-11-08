"use client";

import { Check, Copy, UserPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { acceptStaffInvitationAction, changeStaffRoleAction, inviteStaffAction, revokeStaffInvitationAction, setStaffStatusAction } from "@/actions/admin";
import { ROLE_LABEL } from "@/lib/constants/admin-labels";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { FormDialog } from "./client-actions";

type Role = "SUPPORT" | "SUPER_ADMIN";
const ROLE_HELP: Record<Role, string> = {
  SUPPORT: "Consulte les clients, les tontines (en agrégats) et les messages ; peut annoter et traiter les messages.",
  SUPER_ADMIN: "Tous les droits du support, plus : suspendre, changer d'offre, régler les offres, annonces et gestion de l'équipe.",
};

export function InviteStaffButton() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("SUPPORT");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const reset = () => {
    setOpen(false);
    setEmail("");
    setRole("SUPPORT");
    setError(null);
    setLink(null);
    setCopied(false);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus /> Inviter un collaborateur
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : reset())}>
        <DialogContent>
          <DialogHeader title={link ? "Invitation créée" : "Inviter un collaborateur"} description={link ? `${emailed ? "Un e-mail contenant le lien vient d'être envoyé. " : "Transmettez ce lien à la personne. "}Il est à usage unique, valable 7 jours, et ne fonctionne qu'avec l'adresse invitée.` : "La personne reçoit un lien pour rejoindre l'équipe avec le rôle choisi."} />
          {link ? (
            <>
              <DialogBody>
                <div className="flex gap-2">
                  <Input readOnly value={link} aria-label="Lien d'invitation" onFocus={(e) => e.currentTarget.select()} />
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(link);
                        setCopied(true);
                      } catch {
                        toast.error("Copie impossible : sélectionnez le lien et copiez-le.");
                      }
                    }}
                  >
                    {copied ? <Check /> : <Copy />} {copied ? "Copié" : "Copier"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">En démonstration, aucun e-mail n&apos;est envoyé : le lien ne sera plus affiché après fermeture.</p>
              </DialogBody>
              <DialogFooter>
                <Button onClick={reset}>Terminé</Button>
              </DialogFooter>
            </>
          ) : (
            <form
              className="contents"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError(null);
                const res = await inviteStaffAction({ email, role });
                setBusy(false);
                if (!res.ok) return setError(res.fieldErrors ? Object.values(res.fieldErrors)[0] ?? res.error : res.error);
                setLink(`${window.location.origin}/staff-invite/${res.data.token}`);
                setEmailed(res.data.emailed);
              }}
            >
              <DialogBody>
                <Field label="Adresse e-mail" required>
                  {(p) => <Input {...p} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@exemple.com" />}
                </Field>
                <Field label="Rôle" hint={ROLE_HELP[role]} required>
                  {(p) => (
                    <NativeSelect {...p} value={role} onChange={(e) => setRole(e.target.value as Role)}>
                      <option value="SUPPORT">{ROLE_LABEL.SUPPORT}</option>
                      <option value="SUPER_ADMIN">{ROLE_LABEL.SUPER_ADMIN}</option>
                    </NativeSelect>
                  )}
                </Field>
                {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive-soft px-3 py-2.5 text-sm text-destructive-soft-foreground">{error}</p>}
              </DialogBody>
              <DialogFooter>
                <Button variant="outline" onClick={reset}>Annuler</Button>
                <Button type="submit" loading={busy}>Créer l&apos;invitation</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RevokeInvitationButton({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const r = await revokeStaffInvitationAction({ id });
        setBusy(false);
        if (r.ok) toast.success("Invitation annulée.");
        else toast.error(r.error);
      }}
    >
      Annuler
    </Button>
  );
}

/** Changer le rôle ou désactiver / réactiver un collaborateur (motif obligatoire, journalisé). */
export function MemberActions({ userId, name, role, active }: { userId: string; name: string; role: Role; active: boolean }) {
  const [dialog, setDialog] = useState<"role" | "status" | null>(null);
  const [reason, setReason] = useState("");
  const other: Role = role === "SUPPORT" ? "SUPER_ADMIN" : "SUPPORT";
  const close = (o: boolean) => {
    if (!o) {
      setDialog(null);
      setReason("");
    }
  };
  const reasonField = (
    <Field label="Motif (journalisé)" required>
      {(p) => <Textarea {...p} rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. changement de poste" />}
    </Field>
  );
  return (
    <>
      <div className="flex flex-wrap justify-end gap-2">
        {active && (
          <Button variant="outline" size="sm" onClick={() => setDialog("role")}>
            Passer en {ROLE_LABEL[other]}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setDialog("status")}>
          {active ? "Désactiver l'accès" : "Réactiver l'accès"}
        </Button>
      </div>
      <FormDialog open={dialog === "role"} onOpenChange={close} title={`Passer ${name} en ${ROLE_LABEL[other]}`} description={ROLE_HELP[other]} submitLabel="Changer le rôle" onSubmit={() => changeStaffRoleAction({ userId, role: other, reason }).then((r) => { if (r.ok) toast.success("Rôle modifié."); return r; })}>
        {reasonField}
      </FormDialog>
      <FormDialog open={dialog === "status"} onOpenChange={close} title={`${active ? "Désactiver" : "Réactiver"} l'accès de ${name}`} description={active ? "La personne est déconnectée tout de suite et ne peut plus se connecter." : "La personne pourra de nouveau se connecter."} submitLabel={active ? "Désactiver" : "Réactiver"} onSubmit={() => setStaffStatusAction({ userId, active: !active, reason }).then((r) => { if (r.ok) toast.success(active ? "Accès désactivé." : "Accès réactivé."); return r; })}>
        {reasonField}
      </FormDialog>
    </>
  );
}

export function AcceptStaffInvitation({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="space-y-3">
      {error && <p role="alert" className="rounded-lg border border-destructive/25 bg-destructive-soft px-3 py-2.5 text-sm text-destructive-soft-foreground">{error}</p>}
      <Button
        className="w-full"
        size="lg"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const r = await acceptStaffInvitationAction({ token });
          if (!r.ok) {
            setBusy(false);
            return setError(r.error);
          }
          router.push("/admin");
          router.refresh();
        }}
      >
        Rejoindre l&apos;équipe
      </Button>
    </div>
  );
}
