"use client";

/** Dernier filet : erreur dans la mise en page racine elle-même (elle remplace toute la page, donc son propre <html>). */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", textAlign: "center", margin: 0, padding: 16 }}>
        <div style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: 22, margin: "0 0 12px" }}>Service momentanément indisponible</h1>
          <p style={{ color: "#5b6b62", lineHeight: 1.55, margin: "0 0 20px" }}>KOTI rencontre un problème. Vos données ne sont pas perdues : réessayez dans quelques instants.</p>
          <button type="button" onClick={reset} style={{ background: "#15803d", color: "#fff", border: 0, borderRadius: 8, padding: "12px 20px", fontWeight: 600, cursor: "pointer" }}>
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
