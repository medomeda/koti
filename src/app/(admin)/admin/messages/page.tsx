import { Inbox, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { guard } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { TOPIC_LABEL } from "@/lib/constants/admin-labels";
import { formatDateTime } from "@/lib/utils/dates";
import { listContactRequests } from "@/modules/admin/admin.service";
import { ctxFor } from "@/server/context";

export const metadata: Metadata = { title: "Messages" };

export default async function AdminMessagesPage() {
  const user = await requireUser("/admin/messages");
  const messages = guard(() => listContactRequests(ctxFor(user.id)));
  const fresh = messages.filter((m) => m.status === "NEW").length;
  return (
    <>
      <PageHeader title="Messages" description={`Reçus par le formulaire de contact du site : ${fresh} à traiter sur ${messages.length}. Le traitement (réponse, statut) arrive à l'étape suivante.`} />
      <Card>
        {messages.length === 0 ? (
          <EmptyState icon={<Inbox />} title="Aucun message" description="Les messages du formulaire de contact apparaissent ici." />
        ) : (
          <ul className="divide-y">
            {messages.map((m) => (
              <li key={m.id} className="space-y-1.5 px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{m.name}</p>
                  <Badge tone="neutral">{TOPIC_LABEL[m.topic]}</Badge>
                  {m.status === "NEW" ? <Badge tone="danger" dot>À traiter</Badge> : <Badge tone="success" dot>Traité</Badge>}
                  <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</span>
                </div>
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <a href={`mailto:${m.email}`} className="inline-flex items-center gap-1.5 hover:text-primary hover:underline">
                    <Mail className="size-3.5" aria-hidden /> {m.email}
                  </a>
                  {m.phone && (
                    <span className="inline-flex items-center gap-1.5">
                      <Phone className="size-3.5" aria-hidden /> {m.phone}
                    </span>
                  )}
                </p>
                <p className="max-w-3xl leading-relaxed">{m.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
