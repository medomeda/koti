"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { emailSchema, idSchema, tokenSchema } from "@/lib/validations";
import { authed } from "./_shared";
import { acceptStaffInvitation, addClientNote, changeClientPlan, changeStaffRole, createAnnouncement, grantTrial, handleContactRequest, inviteStaff, previewPlanImpact, reactivateUser, reopenContactRequest, resetPlan, revokeStaffInvitation, setAnnouncementActive, setStaffStatus, suspendUser, updatePlan } from "@/server/pg/services";

/**
 * Actions de l'espace d'administration. Chaque appel revérifie, côté serveur, que l'utilisateur est un membre
 * actif de l'équipe KOTI avec la permission requise (voir requirePlatform) : masquer un bouton ne suffit jamais.
 */
const reason = z.string().trim().min(3, "Motif requis (3 caractères minimum).").max(300);
const plan = z.enum(["FREE", "PRO", "ASSOCIATION"]);
const done = (userId: string) => {
  revalidatePath(`/admin/clients/${userId}`);
  revalidatePath("/admin", "layout");
};

export async function suspendUserAction(raw: unknown) {
  return authed(z.object({ userId: idSchema, reason }), raw, async (input, ctx) => {
    (await suspendUser(ctx, input));
    done(input.userId);
  });
}

export async function reactivateUserAction(raw: unknown) {
  return authed(z.object({ userId: idSchema, reason }), raw, async (input, ctx) => {
    (await reactivateUser(ctx, input));
    done(input.userId);
  });
}

export async function changeClientPlanAction(raw: unknown) {
  return authed(z.object({ userId: idSchema, planId: plan, reason }), raw, async (input, ctx) => {
    (await changeClientPlan(ctx, input));
    done(input.userId);
  });
}

export async function grantTrialAction(raw: unknown) {
  return authed(z.object({ userId: idSchema, planId: plan, days: z.coerce.number().int().min(1).max(90), reason }), raw, async (input, ctx) => {
    (await grantTrial(ctx, input));
    done(input.userId);
  });
}

export async function addClientNoteAction(raw: unknown) {
  return authed(z.object({ userId: idSchema, text: z.string().trim().min(3, "Note trop courte.").max(1000, "1000 caractères maximum.") }), raw, async (input, ctx) => {
    (await addClientNote(ctx, input));
    done(input.userId);
  });
}

const planInput = z.object({
  planId: plan,
  name: z.string().trim().min(2, "2 caractères minimum.").max(40, "40 caractères maximum."),
  tagline: z.string().trim().max(120, "120 caractères maximum."),
  monthlyPrice: z.coerce.number({ message: "Montant requis." }).int("Montant entier requis."),
  limits: z.object({
    tontines: z.coerce.number({ message: "Nombre requis." }).int("Nombre entier requis."),
    membersPerTontine: z.coerce.number({ message: "Nombre requis." }).int("Nombre entier requis."),
    ticketsPerTontine: z.coerce.number({ message: "Nombre requis." }).int("Nombre entier requis."),
    multipleTickets: z.boolean(),
  }),
});

/** Aperçu de l'impact d'un réglage d'offre (lecture seule, rien n'est enregistré). */
export async function previewPlanAction(raw: unknown) {
  return authed(planInput, raw, async (input, ctx) => (await previewPlanImpact(ctx, input)));
}

export async function updatePlanAction(raw: unknown) {
  return authed(planInput.extend({ reason }), raw, async (input, ctx) => {
    (await updatePlan(ctx, input));
    revalidatePath("/admin", "layout");
    revalidatePath("/tarifs");
    revalidatePath("/account");
  });
}

export async function resetPlanAction(raw: unknown) {
  return authed(z.object({ planId: plan, reason }), raw, async (input, ctx) => {
    (await resetPlan(ctx, input));
    revalidatePath("/admin", "layout");
    revalidatePath("/tarifs");
    revalidatePath("/account");
  });
}

/* ------------------------------------------------------------------ Étape 4 : messages, annonces */

export async function handleContactRequestAction(raw: unknown) {
  return authed(z.object({ id: idSchema, reply: z.string().trim().max(1000, "1000 caractères maximum.") }), raw, async (input, ctx) => {
    (await handleContactRequest(ctx, input));
    revalidatePath("/admin", "layout");
  });
}

export async function reopenContactRequestAction(raw: unknown) {
  return authed(z.object({ id: idSchema, reason }), raw, async (input, ctx) => {
    (await reopenContactRequest(ctx, input));
    revalidatePath("/admin", "layout");
  });
}

export async function createAnnouncementAction(raw: unknown) {
  return authed(
    z.object({
      title: z.string().trim().min(3, "Titre trop court.").max(80, "80 caractères maximum."),
      message: z.string().trim().min(3, "Message trop court.").max(300, "300 caractères maximum."),
      tone: z.enum(["info", "warning", "success"]),
      // Date de fin au format AAAA-MM-JJ (fin de journée UTC), vide = jusqu'au retrait.
      endDate: z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Date invalide."),
    }),
    raw,
    async (input, ctx) => {
      (await createAnnouncement(ctx, { title: input.title, message: input.message, tone: input.tone, endsAt: input.endDate ? `${input.endDate}T23:59:59.000Z` : null }));
      revalidatePath("/admin", "layout");
      revalidatePath("/", "layout");
    },
  );
}

export async function setAnnouncementActiveAction(raw: unknown) {
  return authed(z.object({ id: idSchema, active: z.boolean() }), raw, async (input, ctx) => {
    (await setAnnouncementActive(ctx, input));
    revalidatePath("/admin", "layout");
    revalidatePath("/", "layout");
  });
}

/* ------------------------------------------------------------------ Équipe KOTI */

const staffRole = z.enum(["SUPPORT", "SUPER_ADMIN"]);

export async function inviteStaffAction(raw: unknown) {
  return authed(z.object({ email: emailSchema, role: staffRole }), raw, async (input, ctx) => {
    const { token } = (await inviteStaff(ctx, input));
    revalidatePath("/admin/equipe");
    return { token };
  });
}

export async function revokeStaffInvitationAction(raw: unknown) {
  return authed(z.object({ id: idSchema }), raw, async (input, ctx) => {
    (await revokeStaffInvitation(ctx, input));
    revalidatePath("/admin/equipe");
  });
}

export async function changeStaffRoleAction(raw: unknown) {
  return authed(z.object({ userId: idSchema, role: staffRole, reason }), raw, async (input, ctx) => {
    (await changeStaffRole(ctx, input));
    revalidatePath("/admin", "layout");
  });
}

export async function setStaffStatusAction(raw: unknown) {
  return authed(z.object({ userId: idSchema, active: z.boolean(), reason }), raw, async (input, ctx) => {
    (await setStaffStatus(ctx, input));
    revalidatePath("/admin", "layout");
  });
}

/** Accepte une invitation d'équipe avec le compte connecté (l'e-mail doit correspondre). */
export async function acceptStaffInvitationAction(raw: unknown) {
  return authed(z.object({ token: tokenSchema }), raw, async (input, ctx) => {
    (await acceptStaffInvitation(ctx, input.token));
    revalidatePath("/", "layout");
  });
}
