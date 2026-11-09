import "server-only";
import { runOnState, emptyState, type DbState } from "./store";
import { seedDemo } from "./seed";

/**
 * Jeu de démonstration en mémoire (mêmes données que la démo simulée) : les vraies opérations métier sont rejouées
 * sur un état vide. Sert à remplir PostgreSQL (tests, démo hébergée) via `insertAll`.
 */
export function buildDemoState(): DbState {
  const s = emptyState();
  // L'historique fictif (clients qui changent d'offre, factures mensuelles) suppose le paiement en ligne, quel que soit
  // le mode de l'instance. Opération synchrone : la variable est rétablie aussitôt.
  const previous = process.env.KOTI_ONLINE_PAYMENTS;
  process.env.KOTI_ONLINE_PAYMENTS = "1";
  try {
    runOnState(s, () => seedDemo(s));
  } finally {
    if (previous === undefined) delete process.env.KOTI_ONLINE_PAYMENTS;
    else process.env.KOTI_ONLINE_PAYMENTS = previous;
  }
  return s;
}
