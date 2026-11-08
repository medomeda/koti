import "server-only";
import { runOnState, emptyState, type DbState } from "./store";
import { seedDemo, ensureDemoStaff } from "./seed";

/**
 * Jeu de démonstration en mémoire (mêmes données que la démo simulée) : les vraies opérations métier sont rejouées
 * sur un état vide. Sert à remplir PostgreSQL (tests, démo hébergée) via `insertAll`.
 */
export function buildDemoState(): DbState {
  const s = emptyState();
  runOnState(s, () => {
    seedDemo(s);
    ensureDemoStaff(s);
  });
  return s;
}
