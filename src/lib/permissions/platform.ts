import type { PlatformRole } from "@/types/domain";

/**
 * Permissions de la PLATEFORME (équipe KOTI), distinctes de celles des tontines (permissions/index.ts).
 * - SUPPORT : consulte tout (en agrégats) et peut laisser des notes internes ;
 * - SUPER_ADMIN : en plus, agit sur les comptes (suspension, activation des offres), les offres et les annonces ;
 * - messages de contact : traités par le support comme par le super-admin.
 * Le détail des paiements des membres n'est jamais exposé à l'équipe, quel que soit le rôle.
 */
export const PLATFORM_PERMISSIONS = {
  "admin.view": ["SUPPORT", "SUPER_ADMIN"],
  "client.note": ["SUPPORT", "SUPER_ADMIN"],
  "client.suspend": ["SUPER_ADMIN"],
  "client.plan": ["SUPER_ADMIN"],
  "plan.edit": ["SUPER_ADMIN"],
  "message.handle": ["SUPPORT", "SUPER_ADMIN"],
  "announcement.manage": ["SUPER_ADMIN"],
  "team.manage": ["SUPER_ADMIN"],
} as const satisfies Record<string, readonly PlatformRole[]>;

export type PlatformPermission = keyof typeof PLATFORM_PERMISSIONS;

export function platformCan(role: PlatformRole | null | undefined, permission: PlatformPermission): boolean {
  if (!role) return false;
  return (PLATFORM_PERMISSIONS[permission] as readonly PlatformRole[]).includes(role);
}

export const isStaff = (role: PlatformRole | null | undefined) => role === "SUPPORT" || role === "SUPER_ADMIN";

/**
 * Politique d'accès des comptes de l'équipe KOTI à l'ESPACE CLIENT (tontines, paiements, abonnement personnel).
 * Décision du 08/11/2026 : **aucun** (option A) — un compte d'équipe n'a que l'administration ; pour voir l'application
 * comme un client, on utilise un compte client distinct. Cette fonction est le point unique de la règle : elle est lue par
 * la redirection de l'espace client, le bouton du site public et les gardes des services.
 * Options gardées en réserve (changer ici suffit) :
 *  - B : tous les rôles d'équipe gardent un espace client (`return true`) ;
 *  - C : seul le SUPER_ADMIN le garde (`return role === "SUPER_ADMIN"`), pour les tests et démonstrations.
 */
export function staffMayUseClientSpace(role: PlatformRole | null | undefined): boolean {
  void role;
  return false;
}

/** Vrai si ce compte doit être tenu hors de l'espace client. */
export const isBarredFromClientSpace = (role: PlatformRole | null | undefined) => isStaff(role) && !staffMayUseClientSpace(role);
