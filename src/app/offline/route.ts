/**
 * Page « hors ligne » servie par le service worker quand le réseau est absent.
 * Autonome (styles en ligne, aucune dépendance) : elle doit s'afficher sans rien télécharger.
 */
const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#15803d">
<title>Hors ligne · KOTI</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: #f5f7f6; color: #101a15;
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px; box-sizing: border-box; }
  main { max-width: 360px; text-align: center; }
  .logo { width: 64px; height: 64px; margin: 0 auto 20px; }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { color: #56645d; font-size: 15px; line-height: 1.5; margin: 0 0 24px; }
  button { appearance: none; border: 0; border-radius: 10px; background: #15803d; color: #fff; font: inherit; font-weight: 600;
           padding: 12px 22px; min-height: 44px; cursor: pointer; }
  button:hover { background: #166534; }
  button:focus-visible { outline: 2px solid #16a34a; outline-offset: 2px; }
</style>
</head>
<body>
<main>
  <img class="logo" src="/icons/icon-192.png" alt="" width="64" height="64">
  <h1>Vous êtes hors ligne</h1>
  <p>KOTI a besoin d'une connexion pour afficher des informations à jour sur vos tontines et vos paiements. Vérifiez votre réseau puis réessayez.</p>
  <button type="button" onclick="location.reload()">Réessayer</button>
</main>
<script>window.addEventListener("online", () => location.reload());</script>
</body>
</html>`;

export function GET() {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
}
