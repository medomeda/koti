import "server-only";
import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { getDb, type Db, type Executor } from "../client";
import { ensureReady } from "../ready";
import { deliverPush } from "@/modules/push/push.service";
import { emptyState, SCHEMA_VERSION, type DbState } from "../store";
import { canonical, INSERT_ORDER, keyOf, REGISTRY, toDomain, toRow, type TableKey } from "./registry";

/**
 * Unité de travail PostgreSQL (phase 2).
 *
 * Principe : on CHARGE depuis PostgreSQL le sous-ensemble de données dont une opération a besoin (une tontine et
 * ses membres, tickets, tours, échéances… ; un utilisateur et ses tontines), on exécute la logique métier
 * existante, synchrone et déjà testée, sur cet état, puis on ÉCRIT la différence (lignes créées, modifiées,
 * supprimées) dans la même transaction. Les tontines et utilisateurs visés par une écriture sont verrouillés
 * (SELECT … FOR UPDATE) : deux opérations concurrentes sur la même tontine s'exécutent l'une après l'autre.
 * Les contraintes de la base (unicités, CHECK, clés étrangères) restent le dernier garde-fou.
 *
 * Limite assumée : les vues d'ensemble de la plateforme (`everything`) chargent toutes les données ; à remplacer
 * par des requêtes d'agrégat SQL avant un volume réel.
 */
export interface Scope {
  /** Tontines à charger (et à verrouiller en écriture). */
  tontines?: string[];
  /** Utilisateurs à charger (et à verrouiller en écriture) avec leurs adhésions et les tontines correspondantes. */
  users?: string[];
  /** Personnes dont on a seulement besoin du compte et du profil (auteur de l'action) : ni leurs tontines, ni verrou. */
  people?: string[];
  /** Comptes existants correspondant à ces e-mails / numéros (invitation : l'invité est-il déjà inscrit, déjà membre, membre de l'équipe ?). */
  lookup?: { emails?: Array<string | null>; phones?: Array<string | null> };
  /** Équipe KOTI : invitations d'équipe et comptes de l'équipe (aperçu public d'un lien d'invitation, acceptation). */
  staff?: boolean;
  /** Tout charger (administration de la plateforme, tests). */
  everything?: boolean;
  /** Journal d'audit, factures, notifications : chargés seulement à la demande ("dedupe" = clés d'idempotence seules). */
  audit?: boolean;
  /** true = factures des personnes qui agissent ; "all" = toutes (émission : le numéro suit le total, sous verrou). */
  invoices?: boolean | "all";
  /** Invitations adressées aux personnes qui agissent (par compte, e-mail ou téléphone), même sans adhésion. */
  invited?: boolean;
  notifications?: boolean | "dedupe";
  /** Annonces de la plateforme / messages du formulaire de contact : tables autonomes, chargées à la demande. */
  announcements?: boolean;
  contacts?: boolean;
  /** Sessions des utilisateurs chargés (pour les fermer : suspension, désactivation). */
  sessions?: boolean;
}

type Plain = Record<string, unknown>;
const any = <T>(v: T) => v as never;

async function select(ex: Executor, key: TableKey, where?: ReturnType<typeof inArray>): Promise<Plain[]> {
  const { table, columns } = REGISTRY[key];
  const q = (ex as Db).select().from(table as PgTable);
  const order = [columns.createdAt, columns.id].filter(Boolean).map((c) => asc(any(c)));
  const rows = (await (where ? q.where(where) : q).orderBy(...order)) as Plain[];
  return rows.map((r) => toDomain(key, r));
}

const col = (key: TableKey, prop: string) => any(REGISTRY[key].columns[prop]);
const uniq = <T>(xs: T[]) => [...new Set(xs)];

/** Verrouille les lignes visées, dans un ordre stable (évite les interblocages). */
async function lock(ex: Executor, scope: Scope) {
  // Traitements globaux (tâches planifiées…) : un seul à la fois sur toute la base.
  if (scope.everything) await (ex as Db).execute(sql`select pg_advisory_xact_lock(7352001)`);
  // Émission de factures : numérotation continue, une émission à la fois.
  if (scope.invoices === "all") await (ex as Db).execute(sql`select pg_advisory_xact_lock(7352002)`);
  for (const [key, ids] of [["users", scope.users], ["tontines", scope.tontines]] as const) {
    if (!ids?.length) continue;
    await (ex as Db).select({ id: col(key, "id") }).from(REGISTRY[key].table as PgTable).where(inArray(col(key, "id"), uniq(ids))).orderBy(asc(col(key, "id"))).for("update");
  }
}

export async function load(ex: Executor, scope: Scope): Promise<DbState> {
  const s = emptyState();
  const target = s as unknown as Record<TableKey, Plain[]>;
  if (scope.everything) {
    for (const key of INSERT_ORDER) if (key !== "accounts" && key !== "sessions") target[key] = await select(ex, key);
    return s;
  }

  const userIds = new Set([...(scope.users ?? []), ...(scope.people ?? [])]);
  if (scope.lookup) {
    const emails = (scope.lookup.emails ?? []).filter((e): e is string => !!e).map((e) => e.toLowerCase());
    const phones = (scope.lookup.phones ?? []).filter((p): p is string => !!p);
    if (emails.length) for (const u of await select(ex, "users", inArray(sql`lower(${col("users", "email")})`, emails))) userIds.add(u.id as string);
    if (phones.length) for (const p of await select(ex, "userProfiles", inArray(col("userProfiles", "phone"), phones))) userIds.add(p.userId as string);
  }
  const ecosystem = scope.users ?? [];
  const tontineIds = new Set(scope.tontines ?? []);

  // Les utilisateurs demandés entraînent leurs tontines (adhésions et tontines créées).
  if (ecosystem.length) {
    const ids = [...ecosystem];
    const memberships = await select(ex, "tontineMembers", inArray(col("tontineMembers", "userId"), ids));
    const created = await select(ex, "tontines", inArray(col("tontines", "creatorId"), ids));
    for (const m of memberships) tontineIds.add(m.tontineId as string);
    for (const t of created) tontineIds.add(t.id as string);
  }

  if (scope.invited) {
    const who = uniq([...(scope.users ?? []), ...(scope.people ?? [])]);
    if (who.length) {
      const us = await select(ex, "users", inArray(col("users", "id"), who));
      const ps = await select(ex, "userProfiles", inArray(col("userProfiles", "userId"), who));
      const emails = us.map((u) => u.email as string);
      const phones = ps.map((p) => p.phone as string);
      const conds = [inArray(col("invitations", "invitedUserId"), who), emails.length ? inArray(col("invitations", "invitedEmail"), emails) : undefined, phones.length ? inArray(col("invitations", "invitedPhone"), phones) : undefined].filter(Boolean);
      for (const inv of await select(ex, "invitations", or(...(conds as never[])))) tontineIds.add(inv.tontineId as string);
    }
  }

  const tids = [...tontineIds];
  if (tids.length) {
    const byTontine = (key: TableKey) => inArray(col(key, "tontineId"), tids);
    target.tontines = await select(ex, "tontines", inArray(col("tontines", "id"), tids));
    for (const key of ["tontineMembers", "tontineTickets", "rotationCycles", "invitations", "contributionPeriods", "contributionObligations", "rotationSlots"] as const) target[key] = await select(ex, key, byTontine(key));
    const obligationIds = target.contributionObligations.map((o) => o.id as string);
    if (obligationIds.length) target.payments = await select(ex, "payments", inArray(col("payments", "obligationId"), obligationIds));
    if (scope.audit) target.auditLogs = await select(ex, "auditLogs", byTontine("auditLogs"));
  }

  // Personnes concernées : demandées, membres, créateurs, invitants, auteurs des paiements.
  for (const m of target.tontineMembers) userIds.add(m.userId as string);
  for (const x of target.tontines) userIds.add(x.creatorId as string);
  for (const x of target.invitations) {
    userIds.add(x.invitedBy as string);
    if (x.invitedUserId) userIds.add(x.invitedUserId as string);
  }
  for (const x of target.payments) {
    userIds.add(x.declaredBy as string);
    if (x.validatedBy) userIds.add(x.validatedBy as string);
  }
  for (const x of target.tontineTickets) userIds.add(x.createdBy as string);
  const uids = [...userIds];
  // Notifications, factures et sessions : seulement celles des personnes qui agissent, jamais des autres membres.
  const actors = uniq([...(scope.users ?? []), ...(scope.people ?? [])]);
  if (uids.length) {
    target.users = await select(ex, "users", inArray(col("users", "id"), uids));
    target.userProfiles = await select(ex, "userProfiles", inArray(col("userProfiles", "userId"), uids));
    target.subscriptions = await select(ex, "subscriptions", inArray(col("subscriptions", "userId"), uids));
    if (scope.sessions) target.sessions = await select(ex, "sessions", inArray(col("sessions", "userId"), actors));
    if (scope.invoices === "all") target.invoices = await select(ex, "invoices");
    else if (scope.invoices) target.invoices = await select(ex, "invoices", inArray(col("invoices", "userId"), actors));
    if (scope.notifications === true) target.notifications = await select(ex, "notifications", inArray(col("notifications", "userId"), actors));
    else if (scope.notifications === "dedupe") {
      // Seules les clés d'idempotence servent à ne pas recréer un rappel : inutile de charger tout le reste.
      target.notifications = await select(ex, "notifications", and(inArray(col("notifications", "userId"), actors), isNotNull(col("notifications", "dedupeKey")))!);
    }
  }
  if (scope.staff) {
    target.staffInvitations = await select(ex, "staffInvitations");
    const staffUsers = await select(ex, "users", inArray(col("users", "platformRole"), ["SUPPORT", "SUPER_ADMIN"]));
    const have = new Set(target.users.map((u) => u.id as string));
    target.users.push(...staffUsers.filter((u) => !have.has(u.id as string)));
    const ids = target.users.map((u) => u.id as string);
    target.userProfiles = await select(ex, "userProfiles", inArray(col("userProfiles", "userId"), ids));
  }
  target.planSettings = await select(ex, "planSettings");
  if (scope.announcements) target.announcements = await select(ex, "announcements");
  if (scope.contacts) target.contactRequests = await select(ex, "contactRequests");
  s.version = SCHEMA_VERSION;
  return s;
}

/** Copie profonde de l'état chargé, pour détecter ensuite ce qui a changé. */
function snapshotOf(s: DbState): Map<TableKey, Map<string, string>> {
  const snap = new Map<TableKey, Map<string, string>>();
  for (const key of INSERT_ORDER) {
    const rows = (s as unknown as Record<TableKey, Plain[]>)[key];
    snap.set(key, new Map(rows.map((r) => [keyOf(key, r), canonical(r)])));
  }
  return snap;
}

const CHUNK = 400;

/** Écrit la différence entre l'état chargé et l'état final : insertions, puis modifications, puis suppressions. */
async function persist(ex: Executor, before: Map<TableKey, Map<string, string>>, after: DbState) {
  const db = ex as Db;
  const deletions: Array<[TableKey, string[]]> = [];
  for (const key of INSERT_ORDER) {
    const { table, pk } = REGISTRY[key];
    const prev = before.get(key)!;
    const rows = (after as unknown as Record<TableKey, Plain[]>)[key];
    const seen = new Set<string>();
    const inserts: Plain[] = [];
    for (const r of rows) {
      const k = keyOf(key, r);
      seen.add(k);
      const was = prev.get(k);
      if (was === undefined) inserts.push(toRow(key, r));
      else if (was !== canonical(r)) {
        const values = toRow(key, r);
        await db.update(table as PgTable).set(values as never).where(and(...pk.map((p) => eq(col(key, p), any(r[p])))));
      }
    }
    for (let i = 0; i < inserts.length; i += CHUNK) await db.insert(table as PgTable).values(inserts.slice(i, i + CHUNK) as never);
    const gone = [...prev.keys()].filter((k) => !seen.has(k));
    if (gone.length) deletions.push([key, gone]);
  }
  // Suppressions : enfants avant parents.
  for (const [key, gone] of deletions.reverse()) {
    const { table, pk } = REGISTRY[key];
    for (const k of gone) {
      const parts = k.split("|");
      await db.delete(table as PgTable).where(and(...pk.map((p, i) => eq(col(key, p), any(parts[i])))));
    }
  }
}

const emptySnapshot = () => new Map<TableKey, Map<string, string>>(INSERT_ORDER.map((k) => [k, new Map()]));

/** Insère tout un état dans une base vide, dans la transaction `tx` déjà ouverte par l'appelant. */
export async function insertAllIn(tx: Executor, state: DbState): Promise<void> {
  await persist(tx, emptySnapshot(), state);
}

/** Insère tout un état dans une base vide (jeu de données de test), en une transaction. */
export async function insertAll(state: DbState, db: Db = getDb()): Promise<void> {
  await db.transaction((tx) => insertAllIn(tx, state));
}

/** Lecture : état cohérent (instantané) du périmètre demandé, sans verrou. */
export async function pgRead<T>(scope: Scope, fn: (s: Readonly<DbState>) => T, db: Db = getDb()): Promise<T> {
  await ensureReady();
  return db.transaction(async (tx) => fn(await load(tx, scope)), { isolationLevel: "repeatable read", accessMode: "read only" });
}

const RETRYABLE = new Set(["40001", "40P01"]);
const sqlState = (err: unknown) => (err as { code?: string; cause?: { code?: string } })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;

/**
 * Écriture : verrouille, charge, exécute `fn` sur l'état, écrit la différence. Tout est annulé si `fn` lève une
 * erreur ou si la base refuse une écriture. Rejouée jusqu'à 3 fois en cas d'interblocage ou de conflit de sérialisation :
 * `fn` ne doit donc avoir aucun effet hors base.
 */
export async function pgTx<T>(scope: Scope, fn: (s: DbState) => T, db: Db = getDb()): Promise<T> {
  await ensureReady();
  for (let attempt = 1; ; attempt++) {
    try {
      const { result, created } = await db.transaction(async (tx) => {
        await lock(tx, scope);
        const state = await load(tx, scope);
        const before = snapshotOf(state);
        const result = fn(state);
        await persist(tx, before, state);
        // Notifications internes créées par cette opération : leur push partira APRÈS validation de la transaction.
        const known = before.get("notifications")!;
        const created = state.notifications.filter((n) => !known.has(n.id)).map(({ id, userId, type, tontineId }) => ({ id, userId, type, tontineId }));
        return { result, created };
      });
      if (created.length) void deliverPush(created, db).catch((err) => console.error("[koti:push] livraison en échec", err instanceof Error ? err.message : err));
      return result;
    } catch (err) {
      const code = sqlState(err);
      if (attempt >= 3 || !code || !RETRYABLE.has(code)) throw err;
    }
  }
}
