import "server-only";
import { ne } from "drizzle-orm";
import { hashPassword } from "@/lib/auth/password";
import { registerUser } from "@/modules/users/user.pg";
import { logInfo, logWarn } from "@/server/log";
import { getDb, transaction } from "./client";
import { users } from "./schema";

/**
 * Premier compte d'administration d'une instance de production (la base démarre vide, sans compte de démonstration).
 * Variables : KOTI_BOOTSTRAP_ADMIN_EMAIL et KOTI_BOOTSTRAP_ADMIN_PASSWORD (facultatives : KOTI_BOOTSTRAP_ADMIN_NAME,
 * KOTI_BOOTSTRAP_ADMIN_PHONE). Un Super administrateur est créé SEULEMENT s'il n'existe encore aucun compte d'équipe :
 * ensuite, les variables sont ignorées (on peut retirer le mot de passe de la configuration).
 */
export async function ensureBootstrapAdmin(): Promise<void> {
  const email = process.env.KOTI_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.KOTI_BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) return;
  if (password.length < 12) {
    logWarn("bootstrap", "KOTI_BOOTSTRAP_ADMIN_PASSWORD est trop court (12 caractères minimum) : aucun compte créé");
    return;
  }
  const passwordHash = hashPassword(password); // hors transaction : opération coûteuse
  const created = await transaction(async (tx) => {
    const staff = await tx.select({ id: users.id }).from(users).where(ne(users.platformRole, "USER")).limit(1);
    if (staff.length > 0) return false;
    await registerUser(tx, {
      fullName: process.env.KOTI_BOOTSTRAP_ADMIN_NAME?.trim() || "Administrateur KOTI",
      email,
      phone: process.env.KOTI_BOOTSTRAP_ADMIN_PHONE?.trim() ?? "",
      passwordHash,
      now: new Date(),
      platformRole: "SUPER_ADMIN",
      emailVerified: true,
    });
    return true;
  }, getDb());
  if (created) logInfo("bootstrap", "premier compte Super administrateur créé", { email });
}
