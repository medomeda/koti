import type { Instrumentation } from "next";

/**
 * Démarrage du serveur : applique les migrations de la base si KOTI_AUTO_MIGRATE=1 (image Docker, Coolify).
 * En développement, on lance `npm run db:migrate` à la main. Les migrations sont idempotentes ; en cas d'échec
 * le serveur ne démarre pas (mieux vaut un déploiement en erreur qu'une application sur un schéma obsolète).
 */
export async function register() {
  // Le code propre à Node (process.on, migrations) vit dans un fichier à part : il n'est jamais analysé pour l'Edge Runtime.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await (await import("./instrumentation-node")).registerNode();
  }
}

/**
 * Toute erreur non gérée côté serveur (page, action, route d'API, rendu) passe ici : l'utilisateur ne voit qu'un message
 * générique, l'administrateur trouve ici l'erreur complète, la requête concernée et le code (`digest`) affiché à l'écran.
 */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { logError } = await import("@/server/log");
  const { isDatabaseUnavailable } = await import("@/server/db/availability");
  const header = (name: string) => {
    const v = request.headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  const e = err as { digest?: string };
  logError(
    "request",
    err,
    {
      method: request.method,
      path: request.path.split("?")[0],
      route: context.routePath,
      routeType: context.routeType,
      router: context.routerKind,
      render: context.renderSource,
      userAgent: header("user-agent")?.slice(0, 160),
      forwardedFor: header("x-forwarded-for")?.split(",").at(-1)?.trim(),
    },
    { ref: e.digest, message: isDatabaseUnavailable(err) ? "base de données injoignable" : undefined },
  );
};
