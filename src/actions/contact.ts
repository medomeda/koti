"use server";

import { headers } from "next/headers";
import { contactSchema } from "@/lib/validations";
import { AppError } from "@/server/errors";
import { fieldErrorsOf, rateLimit, type ActionResult } from "./_shared";
import { submitContactRequest } from "@/server/pg/services";

async function clientKey(): Promise<string> {
  if (process.env.TRUST_PROXY !== "1") return "global";
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || h.get("x-real-ip") || "global";
}

/** Formulaire de contact public : validation Zod, limite par appareil, puis service. */
export async function submitContactAction(raw: unknown): Promise<ActionResult> {
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Certains champs sont invalides.", fieldErrors: fieldErrorsOf(parsed.error) };
  if (!rateLimit(`contact:${await clientKey()}`, 10, 60 * 60_000)) return { ok: false, error: "Trop de messages depuis cet appareil. Réessayez plus tard." };
  try {
    (await submitContactRequest(parsed.data));
    return { ok: true, data: undefined };
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message };
    console.error("[koti] contact en échec", err);
    return { ok: false, error: "Une erreur inattendue est survenue. Réessayez." };
  }
}
