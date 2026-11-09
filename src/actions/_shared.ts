import "server-only";
import type { z } from "zod";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { isBarredFromClientSpace } from "@/lib/permissions/platform";
import { ctxFor, type Ctx } from "@/server/context";
import { isDatabaseUnavailable } from "@/server/db/availability";
import { logError, logWarn } from "@/server/log";
import { AppError } from "@/server/errors";

export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

/**
 * Traduit une erreur en réponse pour l'utilisateur. Une erreur métier (AppError) porte son propre message.
 * Toute autre erreur reçoit un message GÉNÉRIQUE avec un code de référence ; le détail complet est dans les journaux
 * du serveur, sous ce même code.
 */
export function toFailure(err: unknown, context: Record<string, unknown> = {}): ActionResult<never> {
  if (err instanceof AppError) {
    if (err.code === "UNAUTHENTICATED") return { ok: false, error: "Votre session a expiré. Reconnectez-vous." };
    return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
  }
  if (isDatabaseUnavailable(err)) {
    logWarn("action", "base de données injoignable", context, err);
    return { ok: false, error: "Service momentanément indisponible. Réessayez dans quelques instants." };
  }
  const ref = logError("action", err, context);
  return { ok: false, error: `Une erreur inattendue est survenue. Réessayez ; si cela se reproduit, communiquez le code ${ref} à l'équipe KOTI.` };
}

/**
 * Enveloppe commune des Server Actions privées :
 * 1. session obligatoire ; 2. validation Zod de l'entrée (jamais de confiance dans le client) ;
 * 3. le service applique permissions + transaction ; 4. résultat typé, erreurs normalisées.
 */
export async function authed<S extends z.ZodType, T>(schema: S, raw: unknown, run: (input: z.output<S>, ctx: Ctx, user: SessionUser) => T | Promise<T>, options: { allowStaff?: boolean } = {}): Promise<ActionResult<Awaited<T>>> {
  const user = await getSession();
  if (!user) return { ok: false, error: "Votre session a expiré. Reconnectez-vous." };
  // Les actions de l'espace client sont refusées aux comptes de l'équipe KOTI (voir `staffMayUseClientSpace`).
  if (!options.allowStaff && isBarredFromClientSpace(user.platformRole)) return { ok: false, error: "Les comptes de l'équipe KOTI n'ont pas d'espace client. Utilisez un compte client." };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Certains champs sont invalides.", fieldErrors: fieldErrorsOf(parsed.error) };
  try {
    return { ok: true, data: await run(parsed.data, ctxFor(user.id), user) };
  } catch (err) {
    return toFailure(err, { userId: user.id });
  }
}

/**
 * Limiteur simple en mémoire (anti force brute). Phase backend : rate limit de Better Auth.
 * `rateLimit` compte chaque appel ; `failureLimiter` ne compte que les échecs (connexion).
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

function hit(key: string, windowMs: number) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    const fresh = { count: 1, resetAt: now + windowMs };
    attempts.set(key, fresh);
    return fresh;
  }
  entry.count++;
  return entry;
}

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  return hit(key, windowMs).count <= max;
}

export function failureLimiter(key: string, max: number, windowMs: number) {
  return {
    blocked: () => {
      const e = attempts.get(key);
      return !!e && e.resetAt > Date.now() && e.count >= max;
    },
    fail: () => void hit(key, windowMs),
    reset: () => void attempts.delete(key),
  };
}

/** N'autorise que des redirections internes (évite les redirections ouvertes). */
export function safeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.length > 512) return fallback;
  // Rejette caractères de contrôle et antislash (« /\t/evil.com » deviendrait « //evil.com »).
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return fallback;
  try {
    const url = new URL(next, "http://koti.local");
    return url.origin === "http://koti.local" ? url.pathname + url.search + url.hash : fallback;
  } catch {
    return fallback;
  }
}
