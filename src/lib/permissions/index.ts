import type { MemberRole } from "@/types/domain";

/**
 * Matrice des permissions (PRD §5.4). Source unique : utilisée côté serveur par les services
 * (contrôle réel) et côté UI uniquement pour masquer des actions (confort, jamais sécurité).
 */
export const PERMISSIONS = {
  "tontine.view": ["ADMIN", "MEMBER"],
  "tontine.update": ["ADMIN"],
  "tontine.suspend": ["ADMIN"],
  "tontine.close": ["ADMIN"],
  "tontine.stats": ["ADMIN"],
  "member.view": ["ADMIN", "MEMBER"],
  "member.invite": ["ADMIN"],
  "member.remove": ["ADMIN"],
  "payment.viewAll": ["ADMIN"],
  "payment.viewOwn": ["ADMIN", "MEMBER"],
  "payment.declare": ["ADMIN", "MEMBER"],
  "payment.validate": ["ADMIN"],
  "payment.reject": ["ADMIN"],
  "rotation.view": ["ADMIN", "MEMBER"],
  "rotation.update": ["ADMIN"],
  "audit.view": ["ADMIN"],
} as const satisfies Record<string, readonly MemberRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: MemberRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly MemberRole[]).includes(role);
}
