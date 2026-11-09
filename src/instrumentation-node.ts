/** Démarrage du serveur Node (voir instrumentation.ts). */
export async function registerNode() {
  const { logError, logInfo } = await import("@/server/log");
  // Arrêt brutal du processus : la cause est consignée avant la sortie (n'empêche pas l'arrêt).
  process.on("uncaughtExceptionMonitor", (err) => logError("process", err, undefined, { message: "exception non interceptée : le processus s'arrête" }));
  if (process.env.KOTI_AUTO_MIGRATE !== "1") return;
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const { getDb } = await import("@/server/db/client");
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  logInfo("startup", "migrations de la base appliquées");
}
