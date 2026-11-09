/** Démarrage du serveur Node (voir instrumentation.ts). */
export async function registerNode() {
  const { logError, logInfo } = await import("@/server/log");
  // Arrêt brutal du processus : la cause est consignée avant la sortie (n'empêche pas l'arrêt).
  process.on("uncaughtExceptionMonitor", (err) => logError("process", err, undefined, { message: "exception non interceptée : le processus s'arrête" }));
  if (process.env.KOTI_AUTO_MIGRATE === "1") {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { getDb } = await import("@/server/db/client");
    await migrate(getDb(), { migrationsFolder: "./drizzle" });
    logInfo("startup", "migrations de la base appliquées");
  }
  // Première installation : création du Super administrateur à partir des variables KOTI_BOOTSTRAP_ADMIN_*.
  if (process.env.KOTI_BOOTSTRAP_ADMIN_EMAIL && process.env.DATABASE_URL) {
    const { ensureBootstrapAdmin } = await import("@/server/db/bootstrap");
    await ensureBootstrapAdmin();
  }
}
