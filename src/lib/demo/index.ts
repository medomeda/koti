/**
 * Réglages de la version de démonstration (lus côté serveur uniquement).
 * Rien n'est actif par défaut, ni en développement ni en production : la démonstration (bandeau, comptes fictifs,
 * page /guide, jeu de données importé dans une base vide) se demande explicitement avec KOTI_DEMO_MODE=1.
 */

/** Bandeau « démonstration », page /guide et comptes de démo sur la page de connexion. */
export const isDemoMode = () => process.env.KOTI_DEMO_MODE === "1";

/** Bouton « Réinitialiser la démo » : désactivé par défaut sur une instance partagée entre testeurs. */
export const allowDemoReset = () => process.env.KOTI_DEMO_MODE === "1" && process.env.KOTI_ALLOW_DEMO_RESET === "1";
