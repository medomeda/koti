import { addDays, addMonthsAnchored, parseISODate, weekdayOf } from "@/lib/utils/dates";
import type { Frequency, FrequencyConfig, ISODate } from "@/types/domain";

/**
 * Moteur de fréquence (EPIC 08). Fonction pure : à partir de la date de démarrage,
 * renvoie la date d'échéance de la période n (1-indexée).
 *
 * - WEEKLY : démarrage + 7 × (n − 1) jours.
 * - TWICE_WEEKLY : les deux jours choisis, à partir du démarrage inclus.
 * - MONTHLY : même jour que le démarrage, borné à la fin du mois (31 → 28/29 févr.).
 * - YEARLY : même date chaque année ; un démarrage au 29 févr. tombe le 28 févr. les années non bissextiles.
 */
export function dueDateForPeriod(frequency: Frequency, startDate: ISODate, periodNumber: number, config: FrequencyConfig = {}): ISODate {
  if (!Number.isInteger(periodNumber) || periodNumber < 1) throw new RangeError("Le numéro de période commence à 1.");
  const k = periodNumber - 1;
  switch (frequency) {
    case "WEEKLY":
      return addDays(startDate, 7 * k);
    case "MONTHLY":
      return addMonthsAnchored(startDate, k);
    case "YEARLY":
      return addMonthsAnchored(startDate, 12 * k);
    case "TWICE_WEEKLY":
      return twiceWeeklyDate(startDate, k, config);
  }
}

function twiceWeeklyDate(startDate: ISODate, k: number, config: FrequencyConfig): ISODate {
  const days = config.weekdays;
  if (!days || days[0] === days[1]) throw new Error("Deux jours distincts sont requis pour la fréquence « deux fois par semaine ».");
  const set = new Set<number>(days);
  // Premier jour éligible à partir du démarrage, puis on avance par paires (2 occurrences par semaine).
  let first = startDate;
  while (!set.has(weekdayOf(first))) first = addDays(first, 1);
  const second = (() => {
    let d = addDays(first, 1);
    while (!set.has(weekdayOf(d))) d = addDays(d, 1);
    return d;
  })();
  const base = k % 2 === 0 ? first : second;
  return addDays(base, 7 * Math.floor(k / 2));
}

/** Toutes les dates d'échéance d'un cycle de `count` périodes. */
export function scheduleDates(frequency: Frequency, startDate: ISODate, count: number, config: FrequencyConfig = {}): ISODate[] {
  return Array.from({ length: count }, (_, i) => dueDateForPeriod(frequency, startDate, i + 1, config));
}

/** Nombre de périodes dont l'échéance tombe au plus tard à `until` (borné à `maxPeriods`). */
export function periodsDueBy(frequency: Frequency, startDate: ISODate, until: ISODate, maxPeriods: number, config: FrequencyConfig = {}): number {
  const limit = parseISODate(until).getTime();
  let n = 0;
  while (n < maxPeriods && parseISODate(dueDateForPeriod(frequency, startDate, n + 1, config)).getTime() <= limit) n++;
  return n;
}
