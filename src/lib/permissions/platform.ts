import type { PlatformRole } from "@/types/domain";

/**
 * Permissions de la PLATEFORME (équipe KOTI), distinctes de celles des tontines (permissions/index.ts).
 * - SUPPORT : consulte tout (en agrégats) et peut laisser des notes internes ;
 * - SUPER_ADMIN : en plus, agit sur les comptes (suspension, offre, essai offert), les offres et les annonces ;
 * - messages de contact : traités par le support comme par le super-admin.
 * Le détail des paiements des membres n'est jamais exposé à l'équipe, quel que soit le rôle.
 */
export const PLATFORM_PERMISSIONS = {
  "admin.view": ["SUPPORT", "SUPER_ADMIN"],
  "client.note": ["SUPPORT", "SUPER_ADMIN"],
  "client.suspend": ["SUPER_ADMIN"],
  "client.plan": ["SUPER_ADMIN"],
  "client.trial": ["SUPER_ADMIN"],
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
