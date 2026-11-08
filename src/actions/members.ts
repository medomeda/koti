"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { idSchema, invitationSchema, tokenSchema } from "@/lib/validations";
import { headers } from "next/headers";
import { formatDate } from "@/lib/utils/dates";
import { INVITATION_TTL_DAYS } from "@/modules/invitations/invitation.service";
import { appUrl, mailIsConfigured, sendMail } from "@/server/mail";
import { tontineInvitationMail } from "@/server/mail/templates";
import { authed } from "./_shared";
import { acceptInvitation, cancelInvitation, createInvitation, getTontineAccess, refuseInvitation, removeMember } from "@/server/pg/services";

export async function inviteMemberAction(raw: unknown) {
  return authed(invitationSchema, raw, async (input, ctx, user) => {
    const { token } = (await createInvitation(ctx, input));
    revalidatePath(`/tontines/${input.tontineId}/members`);
    // Invitation par e-mail : envoyée si un courrier est configuré. Un échec d'envoi n'annule pas l'invitation (le lien est affiché).
    let emailed = false;
    const email = input.email;
    if (email && mailIsConfigured()) {
      try {
        const { tontine } = await getTontineAccess(ctx, input.tontineId);
        const origin = (await headers()).get("origin") ?? undefined;
        const expires = new Date(ctx.now.getTime() + INVITATION_TTL_DAYS * 86_400_000).toISOString().slice(0, 10);
        await sendMail(tontineInvitationMail(email, { invitedBy: user.fullName, tontine: tontine.name, url: `${appUrl(origin)}/invite/${token}`, expiresOn: formatDate(expires) }));
        emailed = true;
      } catch {
        /* déjà journalisé par sendMail */
      }
    }
    // Le lien n'est renvoyé qu'à l'administrateur qui vient de créer l'invitation.
    return { path: `/invite/${token}`, emailed };
  });
}

export async function cancelInvitationAction(raw: unknown) {
  return authed(z.object({ tontineId: idSchema, invitationId: idSchema }), raw, async (input, ctx) => {
    (await cancelInvitation(ctx, input));
    revalidatePath(`/tontines/${input.tontineId}/members`);
  });
}

const respondSchema = z.union([z.object({ token: tokenSchema }), z.object({ invitationId: idSchema })]);

export async function acceptInvitationAction(raw: unknown) {
  return authed(respondSchema, raw, async (input, ctx) => {
    const tontineId = (await acceptInvitation(ctx, input));
    revalidatePath("/", "layout");
    return { tontineId };
  });
}

export async function refuseInvitationAction(raw: unknown) {
  return authed(respondSchema, raw, async (input, ctx) => {
    (await refuseInvitation(ctx, input));
    revalidatePath("/", "layout");
  });
}

export async function removeMemberAction(raw: unknown) {
  return authed(z.object({ tontineId: idSchema, memberId: idSchema, reason: z.string().trim().min(3, "Motif requis.").max(300) }), raw, async (input, ctx) => {
    (await removeMember(ctx, input));
    revalidatePath(`/tontines/${input.tontineId}`, "layout");
  });
}
