"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addClientNote, changeClientPlan, grantTrial, previewPlanImpact, reactivateUser, resetPlan, suspendUser, updatePlan } from "@/modules/admin/admin.service";
import { idSchema } from "@/lib/validations";
import { authed } from "./_shared";

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
  return authed(z.object({ userId: idSchema, reason }), raw, (input, ctx) => {
    suspendUser(ctx, input);
    done(input.userId);
  });
}

export async function reactivateUserAction(raw: unknown) {
  return authed(z.object({ userId: idSchema, reason }), raw, (input, ctx) => {
    reactivateUser(ctx, input);
    done(input.userId);
  });
}

export async function changeClientPlanAction(raw: unknown) {
  return authed(z.object({ userId: idSchema, planId: plan, reason }), raw, (input, ctx) => {
    changeClientPlan(ctx, input);
    done(input.userId);
  });
}

export async function grantTrialAction(raw: unknown) {
  return authed(z.object({ userId: idSchema, planId: plan, days: z.coerce.number().int().min(1).max(90), reason }), raw, (input, ctx) => {
    grantTrial(ctx, input);
    done(input.userId);
  });
}

export async function addClientNoteAction(raw: unknown) {
  return authed(z.object({ userId: idSchema, text: z.string().trim().min(3, "Note trop courte.").max(1000, "1000 caractères maximum.") }), raw, (input, ctx) => {
    addClientNote(ctx, input);
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
  return authed(planInput, raw, (input, ctx) => previewPlanImpact(ctx, input));
}

export async function updatePlanAction(raw: unknown) {
  return authed(planInput.extend({ reason }), raw, (input, ctx) => {
    updatePlan(ctx, input);
    revalidatePath("/admin", "layout");
    revalidatePath("/tarifs");
    revalidatePath("/account");
  });
}

export async function resetPlanAction(raw: unknown) {
  return authed(z.object({ planId: plan, reason }), raw, (input, ctx) => {
    resetPlan(ctx, input);
    revalidatePath("/admin", "layout");
    revalidatePath("/tarifs");
    revalidatePath("/account");
  });
}
