import { describe, expect, it } from "vitest";
import { addMonthsAnchored, isISODate, isLeapYear } from "@/lib/utils/dates";
import { dueDateForPeriod, periodsDueBy, scheduleDates } from "./frequency";

describe("moteur de fréquence", () => {
  it("hebdomadaire : +7 jours, y compris à cheval sur deux années", () => {
    expect(scheduleDates("WEEKLY", "2026-12-26", 3)).toEqual(["2026-12-26", "2027-01-02", "2027-01-09"]);
  });

  it("mensuelle : fin de mois bornée puis ancrage conservé", () => {
    expect(scheduleDates("MONTHLY", "2027-01-31", 4)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });

  it("mensuelle : février bissextile", () => {
    expect(dueDateForPeriod("MONTHLY", "2028-01-31", 2)).toBe("2028-02-29");
  });

  it("annuelle : un 29 février tombe le 28 les années non bissextiles", () => {
    expect(scheduleDates("YEARLY", "2028-02-29", 5)).toEqual(["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  });

  it("deux fois par semaine : alterne les deux jours à partir du démarrage", () => {
    // 2026-11-02 est un lundi ; jours choisis : mardi (2) et vendredi (5).
    expect(scheduleDates("TWICE_WEEKLY", "2026-11-02", 5, { weekdays: [2, 5] })).toEqual(["2026-11-03", "2026-11-06", "2026-11-10", "2026-11-13", "2026-11-17"]);
  });

  it("deux fois par semaine : le démarrage compte s'il tombe sur un jour choisi", () => {
    // 2026-11-06 est un vendredi.
    expect(scheduleDates("TWICE_WEEKLY", "2026-11-06", 3, { weekdays: [2, 5] })).toEqual(["2026-11-06", "2026-11-10", "2026-11-13"]);
  });

  it("deux fois par semaine : refuse deux jours identiques", () => {
    expect(() => dueDateForPeriod("TWICE_WEEKLY", "2026-11-02", 1, { weekdays: [2, 2] })).toThrow();
  });

  it("refuse un numéro de période invalide", () => {
    expect(() => dueDateForPeriod("WEEKLY", "2026-11-02", 0)).toThrow(RangeError);
  });

  it("compte les périodes échues", () => {
    expect(periodsDueBy("WEEKLY", "2026-10-01", "2026-10-15", 10)).toBe(3);
    expect(periodsDueBy("WEEKLY", "2026-10-01", "2026-09-30", 10)).toBe(0);
    expect(periodsDueBy("WEEKLY", "2026-01-01", "2027-01-01", 4)).toBe(4);
  });
});

describe("utilitaires de dates", () => {
  it("années bissextiles", () => {
    expect([2024, 2026, 2028, 2100, 2000].map(isLeapYear)).toEqual([true, false, true, false, true]);
  });
  it("ajout de mois négatif", () => {
    expect(addMonthsAnchored("2026-03-31", -1)).toBe("2026-02-28");
  });
  it("validation de date ISO", () => {
    expect(isISODate("2026-02-29")).toBe(false);
    expect(isISODate("2028-02-29")).toBe(true);
    expect(isISODate("2026-1-1")).toBe(false);
  });
});
