/**
 * Réglages de la version de démonstration (lus côté serveur uniquement).
 * - En développement : tout est actif.
 * - En production : activé explicitement par KOTI_DEMO_MODE=1 (instance de test partagée).
 */
const isDev = process.env.NODE_ENV !== "production";

/** Bandeau « démonstration », page /guide et comptes de démo sur la page de connexion. */
export const isDemoMode = () => isDev || process.env.KOTI_DEMO_MODE === "1";

/** Bouton « Réinitialiser la démo » : désactivé par défaut sur une instance partagée entre testeurs. */
export const allowDemoReset = () => isDev || process.env.KOTI_ALLOW_DEMO_RESET === "1";
