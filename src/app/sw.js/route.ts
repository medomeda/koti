/**
 * Service worker de la PWA, servi par une route pour y injecter l'identifiant de build :
 * à chaque déploiement son contenu change, ce qui déclenche la mise à jour sur les appareils installés.
 *
 * Règles de cache (sécurité et fraîcheur des données financières) :
 * - fichiers techniques versionnés (/_next/static, /icons) : cache d'abord, ils ne changent jamais ;
 * - pages (navigation) : TOUJOURS le réseau ; page « hors ligne » si le réseau est absent ;
 *   aucune page contenant des données n'est jamais stockée sur l'appareil ;
 * - tout le reste (Server Actions, API, RSC) : non intercepté.
 * La nouvelle version attend l'accord de l'utilisateur (message SKIP_WAITING) : pas de rechargement surprise.
 */
const VERSION = process.env.KOTI_BUILD_ID ?? "dev";

const script = `
const VERSION = ${JSON.stringify(VERSION)};
const STATIC_CACHE = "koti-static-" + VERSION;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("koti-") && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
`;

export function GET() {
  return new Response(script, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'",
    },
  });
}
