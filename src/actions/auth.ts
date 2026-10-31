"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createSession, destroySession } from "@/lib/auth/session";
import { forgotPasswordSchema, loginSchema, registerSchema } from "@/lib/validations";
import { authenticate, signUp } from "@/modules/users/user.service";
import { AppError } from "@/server/errors";
import { failureLimiter, fieldErrorsOf, rateLimit, safeNext, type ActionResult } from "./_shared";

/**
 * IP client, uniquement derrière UN proxy de confiance (TRUST_PROXY=1, ex. Traefik de Coolify).
 * On prend la DERNIÈRE entrée de X-Forwarded-For : c'est celle ajoutée par le proxy ;
 * les précédentes peuvent être fournies (falsifiées) par le client.
 */
async function clientKey(): Promise<string | null> {
  if (process.env.TRUST_PROXY !== "1") return null;
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",").at(-1)?.trim() || h.get("x-real-ip") || null;
}

export async function loginAction(raw: unknown, next?: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Certains champs sont invalides.", fieldErrors: fieldErrorsOf(parsed.error) };
  const { email, password } = parsed.data;
  const byEmail = failureLimiter(`login:${email}`, 8, 15 * 60_000);
  const ip = await clientKey();
  const byIp = ip ? failureLimiter(`login-ip:${ip}`, 30, 15 * 60_000) : null;
  if (byEmail.blocked() || byIp?.blocked()) return { ok: false, error: "Trop de tentatives échouées. Patientez quelques minutes avant de réessayer." };
  const userId = authenticate(email, password);
  if (!userId) {
    byEmail.fail();
    byIp?.fail();
    // Message volontairement générique : ne révèle pas si le compte existe.
    return { ok: false, error: "E-mail ou mot de passe incorrect." };
  }
  byEmail.reset();
  await createSession(userId);
  redirect(safeNext(next));
}

export async function registerAction(raw: unknown, next?: string): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Certains champs sont invalides.", fieldErrors: fieldErrorsOf(parsed.error) };
  if (!rateLimit(`register:${(await clientKey()) ?? "global"}`, 50, 60 * 60_000)) return { ok: false, error: "Trop d'inscriptions depuis cet appareil. Réessayez plus tard." };
  let userId: string;
  try {
    userId = signUp(parsed.data);
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    throw err;
  }
  await createSession(userId);
  redirect(safeNext(next));
}

/** Phase frontend : aucun e-mail n'est envoyé. La réponse est identique que le compte existe ou non. */
export async function forgotPasswordAction(raw: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Adresse e-mail invalide.", fieldErrors: fieldErrorsOf(parsed.error) };
  if (!rateLimit(`forgot:${parsed.data.email}`, 5, 15 * 60_000)) return { ok: false, error: "Trop de demandes. Réessayez plus tard." };
  return { ok: true, data: undefined, message: "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé." };
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
