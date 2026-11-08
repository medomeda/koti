"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { idSchema, invitationSchema, tokenSchema } from "@/lib/validations";
import { authed } from "./_shared";
import { acceptInvitation, cancelInvitation, createInvitation, refuseInvitation, removeMember } from "@/server/pg/services";

export async function inviteMemberAction(raw: unknown) {
  return authed(invitationSchema, raw, async (input, ctx) => {
    const { token } = (await createInvitation(ctx, input));
    revalidatePath(`/tontines/${input.tontineId}/members`);
    // Le lien n'est renvoyé qu'à l'administrateur qui vient de créer l'invitation.
    return { path: `/invite/${token}` };
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
