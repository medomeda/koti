/**
 * Réglages de la version de démonstration (lus côté serveur uniquement).
 * PHASE DE TEST : la démonstration (bandeau, comptes fictifs, page /guide, jeu de données importé dans une base vide)
 * est ACTIVE PAR DÉFAUT, en développement comme en production. Pour passer en production réelle : KOTI_DEMO_MODE=0.
 */
const isDev = process.env.NODE_ENV !== "production";

/** Bandeau « démonstration », page /guide et comptes de démo sur la page de connexion. */
export const isDemoMode = () => process.env.KOTI_DEMO_MODE !== "0";

/** Bouton « Réinitialiser la démo » : toujours en développement ; sur une instance partagée entre testeurs, seulement avec KOTI_ALLOW_DEMO_RESET=1. */
export const allowDemoReset = () => isDemoMode() && (isDev || process.env.KOTI_ALLOW_DEMO_RESET === "1");
