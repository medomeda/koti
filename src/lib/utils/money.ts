/** Montants en XOF : entiers uniquement, jamais de flottants (PRD §7.6). */

const fmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export function formatFCFA(amount: number): string {
  // Intl utilise une espace fine insécable comme séparateur de milliers en fr-FR.
  return `${fmt.format(amount)} FCFA`;
}

export function formatCompactFCFA(amount: number): string {
  if (amount >= 1_000_000) return `${fmt.format(Math.round(amount / 100_000) / 10)} M FCFA`;
  return formatFCFA(amount);
}

export function sumAmounts(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
