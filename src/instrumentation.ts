/**
 * Démarrage du serveur : applique les migrations de la base si KOTI_AUTO_MIGRATE=1 (image Docker, Coolify).
 * En développement, on lance `npm run db:migrate` à la main. Les migrations sont idempotentes ; en cas d'échec
 * le serveur ne démarre pas (mieux vaut un déploiement en erreur qu'une application sur un schéma obsolète).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.KOTI_AUTO_MIGRATE !== "1") return;
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { getDb } = await import("@/server/db/client");
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  console.log("[koti] migrations de la base appliquées");
}
