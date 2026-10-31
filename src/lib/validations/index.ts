import { z } from "zod";
import { isISODate } from "@/lib/utils/dates";
import { FREQUENCIES, PAYMENT_METHODS } from "@/types/domain";

// Messages d'erreur par défaut en français (les messages métier restent explicites ci-dessous).
z.config(z.locales.fr());

/**
 * Schémas Zod partagés : utilisés par les formulaires (React Hook Form) pour le confort,
 * et RE-VALIDÉS côté serveur dans chaque Server Action (seule validation qui fait foi).
 */

const trimmed = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, min <= 1 ? `${label} est requis.` : `${label} : ${min} caractères minimum.`)
    .max(max, `${label} : ${max} caractères maximum.`);

export const emailSchema = z.string().trim().toLowerCase().max(254).email("Adresse e-mail invalide.");

/** Téléphone international simple : chiffres, espaces, +, tirets. Normalisé sans espaces. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{8,20}$/, "Numéro de téléphone invalide (ex. +225 07 00 00 00 00).")
  .transform((v) => v.replace(/[ ()-]/g, ""));

const passwordSchema = z
  .string()
  .min(8, "8 caractères minimum.")
  .max(128, "128 caractères maximum.")
  .regex(/[A-Za-z]/, "Au moins une lettre.")
  .regex(/[0-9]/, "Au moins un chiffre.");

const isoDate = z.string().refine(isISODate, "Date invalide.");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Mot de passe requis.").max(128),
});

export const registerSchema = z
  .object({
    fullName: trimmed(2, 80, "Le nom complet"),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Les mots de passe ne correspondent pas." });

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const profileSchema = z.object({
  fullName: trimmed(2, 80, "Le nom complet"),
  phone: phoneSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Mot de passe actuel requis.").max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, { path: ["confirmPassword"], message: "Les mots de passe ne correspondent pas." });

const weekday = z.coerce.number().int().min(0).max(6);

export const tontineFormSchema = z
  .object({
    name: trimmed(3, 60, "Le nom"),
    description: z.string().trim().max(500, "500 caractères maximum."),
    contributionAmount: z.coerce
      .number({ message: "Montant requis." })
      .int("Le montant doit être un nombre entier.")
      .min(500, "Montant minimum : 500 FCFA.")
      .max(100_000_000, "Montant maximum : 100 000 000 FCFA."),
    frequency: z.enum(FREQUENCIES, { message: "Fréquence requise." }),
    weekday1: weekday.optional(),
    weekday2: weekday.optional(),
    startDate: isoDate,
    expectedMemberCount: z.coerce.number({ message: "Nombre requis." }).int().min(2, "Au moins 2 membres.").max(100, "100 membres maximum."),
    rotationMode: z.literal("MANUAL"),
  })
  .superRefine((d, ctx) => {
    if (d.frequency === "TWICE_WEEKLY") {
      if (d.weekday1 === undefined || d.weekday2 === undefined) {
        ctx.addIssue({ code: "custom", path: ["weekday2"], message: "Choisissez deux jours." });
      } else if (d.weekday1 === d.weekday2) {
        ctx.addIssue({ code: "custom", path: ["weekday2"], message: "Les deux jours doivent être distincts." });
      }
    }
  });
export type TontineFormInput = z.input<typeof tontineFormSchema>;
export type TontineFormValues = z.output<typeof tontineFormSchema>;

export const tontineUpdateSchema = z.object({
  tontineId: z.string().uuid(),
  name: trimmed(3, 60, "Le nom"),
  description: z.string().trim().max(500, "500 caractères maximum."),
});

export const invitationSchema = z
  .object({
    tontineId: z.string().uuid(),
    channel: z.enum(["EMAIL", "PHONE"]),
    email: z.string().trim().optional(),
    phone: z.string().trim().optional(),
  })
  .transform((d, ctx) => {
    if (d.channel === "EMAIL") {
      const r = emailSchema.safeParse(d.email ?? "");
      if (!r.success) {
        ctx.addIssue({ code: "custom", path: ["email"], message: "Adresse e-mail invalide." });
        return z.NEVER;
      }
      return { tontineId: d.tontineId, email: r.data, phone: null };
    }
    const r = phoneSchema.safeParse(d.phone ?? "");
    if (!r.success) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Numéro de téléphone invalide." });
      return z.NEVER;
    }
    return { tontineId: d.tontineId, email: null, phone: r.data };
  });

export const declarePaymentSchema = z.object({
  obligationId: z.string().uuid(),
  amount: z.coerce.number({ message: "Montant requis." }).int("Montant entier requis.").min(1, "Montant invalide.").max(1_000_000_000),
  paymentDate: isoDate,
  paymentMethod: z.enum(PAYMENT_METHODS, { message: "Mode de paiement requis." }),
  reference: z.string().trim().max(60, "60 caractères maximum."),
  comment: z.string().trim().max(500, "500 caractères maximum."),
});
export type DeclarePaymentInput = z.input<typeof declarePaymentSchema>;

export const rejectPaymentSchema = z.object({
  paymentId: z.string().uuid(),
  reason: trimmed(3, 300, "Le motif"),
});

export const reorderRotationSchema = z.object({
  tontineId: z.string().uuid(),
  memberIds: z.array(z.string().uuid()).min(1).max(200),
  reason: z.string().trim().max(300).optional(),
});

export const idSchema = z.string().uuid();
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{32,64}$/);
