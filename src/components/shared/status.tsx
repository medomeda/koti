import { Badge } from "@/components/ui/badge";
import { INVITATION_STATUS, MEMBER_STATUS, OBLIGATION_STATUS, PAYMENT_STATUS, ROLE_LABEL, ROTATION_STATUS, TONTINE_STATUS } from "@/lib/constants/labels";
import type { InvitationStatus, MemberRole, MemberStatus, ObligationStatus, PaymentStatus, RotationStatus, TontineStatus } from "@/types/domain";

export function TontineStatusBadge({ status }: { status: TontineStatus }) {
  const s = TONTINE_STATUS[status];
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

export function ObligationStatusBadge({ status }: { status: ObligationStatus }) {
  const s = OBLIGATION_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const s = PAYMENT_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function InvitationStatusBadge({ status }: { status: InvitationStatus }) {
  const s = INVITATION_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function MemberStatusBadge({ status }: { status: MemberStatus }) {
  const s = MEMBER_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function RotationStatusBadge({ status }: { status: RotationStatus }) {
  const s = ROTATION_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function RoleBadge({ role }: { role: MemberRole }) {
  return <Badge tone={role === "ADMIN" ? "success" : "neutral"}>{ROLE_LABEL[role]}</Badge>;
}
