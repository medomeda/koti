import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Vérification OPTIMISTE : redirige vers /login si aucun cookie de session n'est présent.
 * Ce n'est pas un contrôle de sécurité : chaque page, Server Action et Route Handler
 * revérifie la session et les permissions côté serveur.
 */
// Fichiers de la PWA (/sw.js, /offline, /manifest.webmanifest) : accessibles sans session, sans aucune donnée.
// Site vitrine : pages publiques. « / » n'en fait pas partie : sans session, il est réécrit vers la page d'accueil du site.
const PUBLIC = ["/login", "/register", "/forgot-password", "/reset-password", "/invite/", "/staff-invite/", "/api/", "/guide", "/sw.js", "/offline", "/manifest.webmanifest", "/bienvenue", "/fonctionnalites", "/tarifs", "/faq", "/contact", "/cgu", "/confidentialite"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();
  if (getSessionCookie(request, { cookiePrefix: "koti" })) return NextResponse.next();
  // Visiteur sur la racine : site vitrine (l'URL reste « / »).
  if (pathname === "/") return NextResponse.rewrite(new URL("/bienvenue", request.url));
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)"],
};
