"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { idSchema, invitationSchema, tokenSchema } from "@/lib/validations";
import { acceptInvitation, cancelInvitation, createInvitation, refuseInvitation } from "@/modules/invitations/invitation.service";
import { removeMember } from "@/modules/members/member.service";
import { authed } from "./_shared";

export async function inviteMemberAction(raw: unknown) {
  return authed(invitationSchema, raw, (input, ctx) => {
    const { token } = createInvitation(ctx, input);
    revalidatePath(`/tontines/${input.tontineId}/members`);
    // Le lien n'est renvoyé qu'à l'administrateur qui vient de créer l'invitation.
    return { path: `/invite/${token}` };
  });
}

export async function cancelInvitationAction(raw: unknown) {
  return authed(z.object({ tontineId: idSchema, invitationId: idSchema }), raw, (input, ctx) => {
    cancelInvitation(ctx, input);
    revalidatePath(`/tontines/${input.tontineId}/members`);
  });
}

const respondSchema = z.union([z.object({ token: tokenSchema }), z.object({ invitationId: idSchema })]);

export async function acceptInvitationAction(raw: unknown) {
  return authed(respondSchema, raw, (input, ctx) => {
    const tontineId = acceptInvitation(ctx, input);
    revalidatePath("/", "layout");
    return { tontineId };
  });
}

export async function refuseInvitationAction(raw: unknown) {
  return authed(respondSchema, raw, (input, ctx) => {
    refuseInvitation(ctx, input);
    revalidatePath("/", "layout");
  });
}

export async function removeMemberAction(raw: unknown) {
  return authed(z.object({ tontineId: idSchema, memberId: idSchema, reason: z.string().trim().min(3, "Motif requis.").max(300) }), raw, (input, ctx) => {
    removeMember(ctx, input);
    revalidatePath(`/tontines/${input.tontineId}`, "layout");
  });
}
