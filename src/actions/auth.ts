"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@/lib/validations";
import { isDatabaseUnavailable } from "@/server/db/availability";
import { AppError } from "@/server/errors";
import { getAuth, REALM_HEADER, requireEmailVerification } from "@/server/auth";
import { mailIsConfigured } from "@/server/mail";
import { failureLimiter, fieldErrorsOf, rateLimit, safeNext, type ActionResult } from "./_shared";
import { platformRoleOf, signUp } from "@/server/pg/services";
import { logError } from "@/server/log";

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

/** Ouvre la session (cookie posé par Better Auth). Renvoie l'id du compte ou un message d'erreur destiné à l'utilisateur. */
async function openSession(email: string, password: string, realm: "client" | "admin" = "client"): Promise<{ userId: string } | { error: string; invalidCredentials?: boolean; unverified?: boolean }> {
  try {
    const h = new Headers(await headers());
    h.set(REALM_HEADER, realm); // l'espace de connexion est décidé ici, jamais par le navigateur
    const res = await getAuth().api.signInEmail({ body: { email, password }, headers: h });
    return { userId: res.user.id };
  } catch (err) {
    // Base injoignable : ne pas faire passer une panne pour un mauvais mot de passe.
    if (isDatabaseUnavailable(err)) return { error: "Service momentanément indisponible. Réessayez dans quelques instants." };
    if (!(err instanceof APIError)) throw err;
    if (err.statusCode >= 500) return { error: "Service momentanément indisponible. Réessayez dans quelques instants." };
    const code = (err.body as { code?: string } | undefined)?.code;
    if (code === "EMAIL_NOT_VERIFIED") return { error: "Adresse e-mail non confirmée. Un nouveau lien de confirmation vient de vous être envoyé.", unverified: true };
    if (err.statusCode === 403) return { error: err.message || "Connexion refusée." };
    // Message volontairement générique : ne révèle pas si le compte existe.
    return { error: "E-mail ou mot de passe incorrect.", invalidCredentials: true };
  }
}

export async function loginAction(raw: unknown, next?: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Certains champs sont invalides.", fieldErrors: fieldErrorsOf(parsed.error) };
  const { email, password } = parsed.data;
  const byEmail = failureLimiter(`login:${email}`, 8, 15 * 60_000);
  const ip = await clientKey();
  const byIp = ip ? failureLimiter(`login-ip:${ip}`, 30, 15 * 60_000) : null;
  if (byEmail.blocked() || byIp?.blocked()) return { ok: false, error: "Trop de tentatives échouées. Patientez quelques minutes avant de réessayer." };
  const result = await openSession(email, password);
  if ("error" in result) {
    if (result.invalidCredentials) {
      byEmail.fail();
      byIp?.fail();
    }
    return { ok: false, error: result.error };
  }
  byEmail.reset();
  // Membre de l'équipe KOTI sans destination précise : directement l'espace d'administration.
  const target = safeNext(next);
  redirect(target === "/" && (await platformRoleOf(result.userId)) ? "/admin" : target);
}

/** Connexion à l'ADMINISTRATION : réservée aux comptes de l'équipe KOTI (un compte client reçoit le message générique). */
export async function adminLoginAction(raw: unknown, next?: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Certains champs sont invalides.", fieldErrors: fieldErrorsOf(parsed.error) };
  const { email, password } = parsed.data;
  const byEmail = failureLimiter(`admin-login:${email}`, 5, 15 * 60_000);
  const ip = await clientKey();
  const byIp = ip ? failureLimiter(`admin-login-ip:${ip}`, 20, 15 * 60_000) : null;
  if (byEmail.blocked() || byIp?.blocked()) return { ok: false, error: "Trop de tentatives échouées. Patientez quelques minutes avant de réessayer." };
  const result = await openSession(email, password, "admin");
  if ("error" in result) {
    if (result.invalidCredentials) {
      byEmail.fail();
      byIp?.fail();
    }
    return { ok: false, error: result.error };
  }
  byEmail.reset();
  const target = safeNext(next, "/admin");
  redirect(target.startsWith("/admin") ? target : "/admin");
}

export async function registerAction(raw: unknown, next?: string): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Certains champs sont invalides.", fieldErrors: fieldErrorsOf(parsed.error) };
  if (!rateLimit(`register:${(await clientKey()) ?? "global"}`, 50, 60 * 60_000)) return { ok: false, error: "Trop d'inscriptions depuis cet appareil. Réessayez plus tard." };
  try {
    await signUp(parsed.data);
  } catch (err) {
    if (err instanceof AppError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
    throw err;
  }
  const { email, password } = parsed.data;
  const auth = getAuth();
  // Confirmation d'adresse : envoyée dès qu'un courrier est configuré ; bloquante seulement si elle est exigée.
  if (mailIsConfigured()) {
    await auth.api.sendVerificationEmail({ body: { email, callbackURL: safeNext(next) }, headers: await headers() }).catch((err) => logError("auth.verification-email", err));
  }
  if (requireEmailVerification()) return { ok: true, data: undefined, message: "Compte créé. Un e-mail de confirmation vous a été envoyé : cliquez sur le lien pour activer votre accès, puis connectez-vous." };
  const session = await openSession(email, password);
  if ("error" in session) return { ok: false, error: session.error };
  redirect(safeNext(next));
}

/** La réponse est identique que le compte existe ou non (pas d'énumération de comptes). */
export async function forgotPasswordAction(raw: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Adresse e-mail invalide.", fieldErrors: fieldErrorsOf(parsed.error) };
  if (!rateLimit(`forgot:${parsed.data.email}`, 5, 15 * 60_000)) return { ok: false, error: "Trop de demandes. Réessayez plus tard." };
  await getAuth().api.requestPasswordReset({ body: { email: parsed.data.email, redirectTo: "/reset-password" }, headers: await headers() }).catch((err) => logError("auth.password-reset", err));
  return { ok: true, data: undefined, message: "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé. Il est valable une heure." };
}

/** Nouveau mot de passe avec le jeton reçu par e-mail. Toutes les sessions du compte sont fermées. */
export async function resetPasswordAction(raw: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Certains champs sont invalides.", fieldErrors: fieldErrorsOf(parsed.error) };
  if (!rateLimit(`reset:${(await clientKey()) ?? "global"}`, 20, 15 * 60_000)) return { ok: false, error: "Trop de tentatives. Réessayez plus tard." };
  try {
    await getAuth().api.resetPassword({ body: { newPassword: parsed.data.newPassword, token: parsed.data.token }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) return { ok: false, error: "Ce lien est invalide ou a expiré. Refaites une demande de réinitialisation." };
    throw err;
  }
  return { ok: true, data: undefined, message: "Mot de passe modifié. Vous pouvez vous connecter." };
}

export async function logoutAction() {
  await getAuth().api.signOut({ headers: await headers() }).catch(() => undefined);
  redirect("/login");
}

/** Déconnexion depuis l'administration : retour sur la page de connexion de l'administration. */
export async function adminLogoutAction() {
  await getAuth().api.signOut({ headers: await headers() }).catch(() => undefined);
  redirect("/admin/login");
}
