import type { ISODate, Weekday } from "@/types/domain";

/**
 * Arithmétique de dates calendaires (sans heure) en UTC pur, pour éviter tout décalage
 * lié au fuseau du serveur. Africa/Abidjan = UTC+0 toute l'année (pas d'heure d'été).
 */
export const APP_TIME_ZONE = "Africa/Abidjan";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  return toISODate(parseISODate(value)) === value;
}

export function parseISODate(value: ISODate): Date {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

/** Date calendaire du jour dans le fuseau de l'application. */
export function todayISO(now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/**
 * Ajoute des mois en conservant le jour d'ancrage, borné à la fin du mois.
 * Ex. ancrage 31 : 31 janv. → 28/29 févr. → 31 mars.
 */
export function addMonthsAnchored(start: ISODate, months: number, anchorDay?: number): ISODate {
  const d = parseISODate(start);
  const anchor = anchorDay ?? d.getUTCDate();
  const total = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const day = Math.min(anchor, daysInMonth(year, month));
  return toISODate(new Date(Date.UTC(year, month, day)));
}

export function weekdayOf(date: ISODate): Weekday {
  return parseISODate(date).getUTCDay() as Weekday;
}

export function diffInDays(from: ISODate, to: ISODate): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000);
}

const dateFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "2-digit", month: "long", year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "2-digit", month: "short" });
const dateTimeFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: APP_TIME_ZONE, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function formatDate(date: ISODate | null | undefined): string {
  return date ? dateFmt.format(parseISODate(date)) : "—";
}

export function formatShortDate(date: ISODate | null | undefined): string {
  return date ? shortDateFmt.format(parseISODate(date)) : "—";
}

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTimeFmt.format(new Date(value)) : "—";
}

/** « aujourd'hui », « demain », « dans 3 jours », « il y a 2 jours ». */
export function relativeDays(date: ISODate, today: ISODate): string {
  const n = diffInDays(today, date);
  if (n === 0) return "aujourd'hui";
  if (n === 1) return "demain";
  if (n === -1) return "hier";
  return n > 0 ? `dans ${n} jours` : `il y a ${-n} jours`;
}

export function timeAgo(value: string, now: Date = new Date()): string {
  const s = Math.max(0, Math.round((now.getTime() - new Date(value).getTime()) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return formatDateTime(value);
}
