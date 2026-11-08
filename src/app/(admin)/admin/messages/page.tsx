import { Inbox, Mail, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MessageActions } from "@/components/admin/message-actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { guard } from "@/lib/auth/guard";
import { requireUser } from "@/lib/auth/session";
import { TOPIC_LABEL } from "@/lib/constants/admin-labels";
import { cn } from "@/lib/utils/cn";
import { formatDateTime } from "@/lib/utils/dates";
import { platformCan } from "@/lib/permissions/platform";
import { ctxFor } from "@/server/context";
import { listContactRequestsDetailed, platformRoleOf } from "@/server/pg/services";

export const metadata: Metadata = { title: "Messages" };

const FILTERS = [
  { key: undefined, label: "Tous" },
  { key: "NEW", label: "À traiter" },
  { key: "HANDLED", label: "Traités" },
] as const;

export default async function AdminMessagesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status: raw } = await searchParams;
  const status = raw === "NEW" || raw === "HANDLED" ? raw : undefined;
  const user = await requireUser("/admin/messages");
  const ctx = ctxFor(user.id);
  const all = (await guard(async () => (await listContactRequestsDetailed(ctx))));
  const messages = status ? all.filter((m) => m.status === status) : all;
  const fresh = all.filter((m) => m.status === "NEW").length;
  const canHandle = platformCan((await platformRoleOf(user.id)), "message.handle");
  return (
    <>
      <PageHeader title="Messages" description={`Reçus par le formulaire de contact du site : ${fresh} à traiter sur ${all.length}. Répondez au visiteur par e-mail ou téléphone, puis notez la réponse ici.`} />
      <nav aria-label="Filtrer les messages" className="mb-4 flex gap-1.5">
        {FILTERS.map((f) => (
          <Link key={f.label} href={f.key ? `/admin/messages?status=${f.key}` : "/admin/messages"} aria-current={status === f.key ? "page" : undefined} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", status === f.key ? "bg-primary-soft text-primary-soft-foreground" : "text-muted-foreground hover:bg-muted")}>
            {f.label}
          </Link>
        ))}
      </nav>
      <Card>
        {messages.length === 0 ? (
          <EmptyState icon={<Inbox />} title={status === "NEW" ? "Tout est traité" : "Aucun message"} description={status === "NEW" ? "Aucun message en attente." : "Les messages du formulaire de contact apparaissent ici."} />
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
                {m.status === "HANDLED" && (
                  <div className="max-w-3xl rounded-lg bg-muted px-3 py-2 text-sm">
                    <p className="text-xs text-muted-foreground">
                      Traité par {m.handledByName ?? "l'équipe"}
                      {m.handledAt ? ` le ${formatDateTime(m.handledAt)}` : ""}
                    </p>
                    {m.reply && <p className="mt-1">{m.reply}</p>}
                  </div>
                )}
                <div className="pt-1">
                  <MessageActions id={m.id} name={m.name} handled={m.status === "HANDLED"} canHandle={canHandle} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
