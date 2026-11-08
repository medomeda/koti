import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// DATABASE_URL_TEST (base « koti_test ») pour les tests d'intégration PostgreSQL ; absent → ces tests sont ignorés.
config({ path: [".env.local"], quiet: true });

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)), "server-only": fileURLToPath(new URL("./src/tests/server-only-stub.ts", import.meta.url)) } },
  // Les tests PostgreSQL partagent une même base : fichiers exécutés l'un après l'autre.
  test: { environment: "node", env: { BETTER_AUTH_SECRET: "test-secret-0123456789abcdef0123456789abcdef", BETTER_AUTH_URL: "http://localhost:3700" }, include: ["src/**/*.test.ts"], fileParallelism: false },
});
