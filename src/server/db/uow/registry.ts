import { getTableColumns, type Column } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import * as t from "../schema";
import type { DbState } from "../store";

/** Les tableaux de l'état applicatif qui correspondent à une table PostgreSQL. */
export type TableKey = Exclude<keyof DbState, "version">;

export interface TableDef {
  table: PgTable;
  /** Colonnes de la clé primaire (noms de propriété Drizzle). */
  pk: string[];
  /** Propriétés optionnelles côté domaine (undefined) mais NULL en base. */
  optional?: string[];
  columns: Record<string, Column>;
}

const def = (table: PgTable, pk: string[], optional?: string[]): TableDef => ({ table, pk, optional, columns: getTableColumns(table) as Record<string, Column> });

export const REGISTRY: Record<TableKey, TableDef> = {
  users: def(t.users, ["id"]),
  userProfiles: def(t.userProfiles, ["userId"]),
  credentials: def(t.credentials, ["userId"]),
  sessions: def(t.sessions, ["tokenHash"]),
  subscriptions: def(t.subscriptions, ["id"]),
  invoices: def(t.invoices, ["id"]),
  planSettings: def(t.planSettings, ["planId"]),
  adminNotes: def(t.adminNotes, ["id"]),
  contactRequests: def(t.contactRequests, ["id"], ["handledBy", "handledAt", "reply"]),
  announcements: def(t.announcements, ["id"]),
  staffInvitations: def(t.staffInvitations, ["id"]),
  tontines: def(t.tontines, ["id"]),
  tontineMembers: def(t.tontineMembers, ["id"]),
  rotationCycles: def(t.rotationCycles, ["id"]),
  tontineTickets: def(t.tontineTickets, ["id"]),
  invitations: def(t.invitations, ["id"]),
  contributionPeriods: def(t.contributionPeriods, ["id"]),
  contributionObligations: def(t.contributionObligations, ["id"]),
  payments: def(t.payments, ["id"]),
  rotationSlots: def(t.rotationSlots, ["id"]),
  notifications: def(t.notifications, ["id"]),
  auditLogs: def(t.auditLogs, ["id"]),
  jobRuns: def(t.jobRuns, ["key"]),
};

/** Ordre d'insertion respectant les clés étrangères (les suppressions suivent l'ordre inverse). */
export const INSERT_ORDER: TableKey[] = [
  "users", "userProfiles", "credentials", "sessions", "subscriptions", "invoices", "planSettings", "adminNotes", "contactRequests", "announcements", "staffInvitations",
  "tontines", "tontineMembers", "rotationCycles", "tontineTickets", "invitations", "contributionPeriods", "contributionObligations", "payments", "rotationSlots", "notifications", "auditLogs", "jobRuns",
];

type Plain = Record<string, unknown>;

/** Ligne PostgreSQL → objet du domaine (instants en chaîne ISO 8601, NULL → absent pour les champs optionnels). */
export function toDomain(key: TableKey, row: Plain): Plain {
  const { columns, optional } = REGISTRY[key];
  const out: Plain = {};
  for (const prop of Object.keys(columns)) {
    const v = row[prop];
    if (v instanceof Date) out[prop] = v.toISOString();
    else if (v === null && optional?.includes(prop)) continue;
    else out[prop] = v;
  }
  return out;
}

/** Objet du domaine → valeurs de ligne (chaîne ISO → Date pour les colonnes d'instant, absent → NULL). */
export function toRow(key: TableKey, obj: Plain): Plain {
  const { columns } = REGISTRY[key];
  const out: Plain = {};
  for (const [prop, col] of Object.entries(columns)) {
    const v = obj[prop];
    if (v === undefined) out[prop] = null;
    else if (col.dataType === "date" && typeof v === "string") out[prop] = new Date(v);
    else out[prop] = v;
  }
  return out;
}

/** Représentation canonique (clés triées) pour détecter les lignes modifiées. */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Plain).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
}

export const keyOf = (key: TableKey, obj: Plain) => REGISTRY[key].pk.map((p) => String(obj[p])).join("|");
