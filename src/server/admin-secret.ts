import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Vérifie l'en-tête « Authorization: Bearer <CRON_SECRET> » des routes d'administration
 * (tâches planifiées, réinitialisation de la démo). Comparaison en temps constant ;
 * refus systématique si le secret n'est pas configuré ou trop court.
 */
export function hasAdminSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
