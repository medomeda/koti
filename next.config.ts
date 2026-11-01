import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/**
 * Identifiant unique de chaque build : injecté dans le service worker (/sw.js) pour que
 * les applications installées détectent une nouvelle version après chaque déploiement.
 * Coolify fournit SOURCE_COMMIT au build ; sinon, horodatage.
 */
const buildId = (process.env.SOURCE_COMMIT || "").slice(0, 12) || Date.now().toString(36);

const nextConfig: NextConfig = {
  env: { KOTI_BUILD_ID: buildId },
  // Serveur autonome : utilisé par l'image Docker (Dockerfile).
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
