import { NextResponse, type NextRequest } from "next/server";

/**
 * Vérification OPTIMISTE : redirige vers /login si aucun cookie de session n'est présent.
 * Ce n'est pas un contrôle de sécurité : chaque page, Server Action et Route Handler
 * revérifie la session et les permissions côté serveur.
 */
const PUBLIC = ["/login", "/register", "/forgot-password", "/reset-password", "/invite/", "/api/"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();
  if (request.cookies.has("koti_session")) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)"],
};
