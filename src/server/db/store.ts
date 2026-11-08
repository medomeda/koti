import "server-only";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { migrateV2ToV3, migrateV3ToV4, migrateV4ToV5, migrateV5ToV6, migrateV6ToV7, migrateV7ToV8, migrateV8ToV9 } from "./migrations";
import type {
  AdminNote,
  Announcement,
  StaffInvitation,
  AuditLog,
  ContactRequest,
  ContributionObligation,
  ContributionPeriod,
  Invoice,
  Invitation,
  Notification,
  Payment,
  PlanSetting,
  RotationCycle,
  RotationSlot,
  Subscription,
  Tontine,
  TontineMember,
  TontineTicket,
  User,
  UserProfile,
} from "@/types/domain";

/**
 * Base de données SIMULÉE (phase frontend).
 *
 * Remplace PostgreSQL + Drizzle le temps de construire l'UI. Les services métier n'y accèdent
 * qu'au travers de `tx()` (lecture/écriture atomique) et `read()` : le jour de la bascule,
 * `tx()` devient `db.transaction()` et les tableaux deviennent des tables, sans changer
 * les règles métier ni les écrans.
 *
 * L'état vit côté serveur uniquement (jamais envoyé tel quel au navigateur) et est
 * persisté dans un fichier JSON local pour survivre aux redémarrages en développement.
 */

export interface Credential {
  userId: string;
  /** scrypt — format « scrypt$N$r$p$salt$hash » */
  passwordHash: string;
}

export interface SessionRow {
  /** SHA-256 du jeton de session : le jeton brut n'est jamais stocké. */
  tokenHash: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

export interface DbState {
  version: number;
  users: User[];
  credentials: Credential[];
  sessions: SessionRow[];
  userProfiles: UserProfile[];
  tontines: Tontine[];
  tontineMembers: TontineMember[];
  tontineTickets: TontineTicket[];
  rotationCycles: RotationCycle[];
  invitations: Invitation[];
  contributionPeriods: ContributionPeriod[];
  contributionObligations: ContributionObligation[];
  payments: Payment[];
  rotationSlots: RotationSlot[];
  notifications: Notification[];
  auditLogs: AuditLog[];
  /** Messages reçus par le formulaire de contact du site vitrine. */
  contactRequests: ContactRequest[];
  /** Abonnements (un par client) et factures simulées. */
  subscriptions: Subscription[];
  invoices: Invoice[];
  /** Notes internes de l'équipe KOTI sur les clients (espace d'administration). */
  adminNotes: AdminNote[];
  /** Réglages d'offres modifiés depuis l'administration (vide = valeurs d'origine). */
  planSettings: PlanSetting[];
  announcements: Announcement[];
  staffInvitations: StaffInvitation[];
  /** Verrous des tâches planifiées (protection contre les exécutions multiples). */
  jobRuns: Array<{ key: string; ranAt: string }>;
}

export const SCHEMA_VERSION = 9;

export function emptyState(): DbState {
  return {
    version: SCHEMA_VERSION,
    users: [],
    credentials: [],
    sessions: [],
    userProfiles: [],
    tontines: [],
    tontineMembers: [],
    tontineTickets: [],
    rotationCycles: [],
    invitations: [],
    contributionPeriods: [],
    contributionObligations: [],
    payments: [],
    rotationSlots: [],
    notifications: [],
    auditLogs: [],
    contactRequests: [],
    subscriptions: [],
    invoices: [],
    adminNotes: [],
    planSettings: [],
    announcements: [],
    staffInvitations: [],
    jobRuns: [],
  };
}

type Holder = { state: DbState | null; seeding: boolean; afterLoadDone?: boolean };
const g = globalThis as typeof globalThis & { __kotiDb?: Holder };
const holder: Holder = (g.__kotiDb ??= { state: null, seeding: false });

const persistEnabled = process.env.NODE_ENV !== "test" && process.env.KOTI_DEMO_PERSIST !== "0";
const dbPath = resolve(/* turbopackIgnore: true */ process.cwd(), process.env.KOTI_DEMO_DB_PATH ?? ".data/koti-demo.json");

let seeder: ((state: DbState) => void) | null = null;

let afterLoad: ((state: DbState) => boolean) | null = null;

/**
 * Enregistré par le module de seed : complète un état déjà existant (fichier relu ou migré) sans rien écraser.
 * Doit être idempotent et renvoyer true si l'état a été modifié (il est alors réécrit sur disque).
 */
export function registerAfterLoad(fn: (state: DbState) => boolean) {
  afterLoad = fn;
}

/** Enregistré par le module de seed (évite une dépendance circulaire). */
export function registerSeeder(fn: (state: DbState) => void) {
  seeder = fn;
}

function completeExisting(state: DbState) {
  if (holder.afterLoadDone || !afterLoad) return;
  holder.afterLoadDone = true;
  if (afterLoad(state)) persist(state);
}

function load(): DbState {
  if (holder.state?.version === SCHEMA_VERSION) {
    completeExisting(holder.state);
    return holder.state;
  }
  holder.state = null;
  if (persistEnabled && existsSync(dbPath)) {
    let parsed: { version?: number } | null = null;
    try {
      parsed = JSON.parse(readFileSync(dbPath, "utf8")) as { version?: number };
    } catch {
      // Fichier corrompu : on repart d'un jeu de démonstration propre.
    }
    if (parsed?.version === SCHEMA_VERSION) {
      holder.state = parsed as DbState;
      completeExisting(holder.state);
      return holder.state;
    }
    if (parsed && typeof parsed.version === "number" && parsed.version >= 2 && parsed.version < SCHEMA_VERSION) {
      // Migration NON destructive : sauvegarde du fichier d'origine, puis conversion version par version.
      // Une ambiguïté interrompt le démarrage (exception) au lieu de régénérer la démo : le fichier reste intact.
      const backup = `${dbPath}.v${parsed.version}.bak`;
      if (!existsSync(backup)) copyFileSync(dbPath, backup);
      let migrated: { version: number } = { ...parsed, version: parsed.version };
      if (migrated.version === 2) migrated = migrateV2ToV3(migrated);
      if (migrated.version === 3) migrated = migrateV3ToV4(migrated);
      if (migrated.version === 4) migrated = migrateV4ToV5(migrated);
      if (migrated.version === 5) migrated = migrateV5ToV6(migrated);
      if (migrated.version === 6) migrated = migrateV6ToV7(migrated);
      if (migrated.version === 7) migrated = migrateV7ToV8(migrated);
      if (migrated.version === 8) migrated = migrateV8ToV9(migrated);
      holder.state = migrated as DbState;
      persist(holder.state);
      completeExisting(holder.state);
      return holder.state;
    }
  }
  const fresh = emptyState();
  holder.state = fresh;
  holder.afterLoadDone = true;
  if (seeder) {
    holder.seeding = true;
    try {
      seeder(fresh);
    } finally {
      holder.seeding = false;
    }
    persist(fresh);
  }
  return fresh;
}

function persist(state: DbState) {
  if (!persistEnabled || holder.seeding) return;
  try {
    mkdirSync(dirname(dbPath), { recursive: true });
    const tmp = `${dbPath}.tmp`;
    writeFileSync(tmp, JSON.stringify(state), { mode: 0o600 });
    renameSync(tmp, dbPath);
  } catch (err) {
    console.error("[koti] persistance de la base de démonstration impossible", err);
  }
}

/** Lecture seule. Ne jamais muter l'objet renvoyé. */
export function read<T>(fn: (state: Readonly<DbState>) => T): T {
  return fn(overrideState ?? load());
}

/**
 * Exécute du code métier synchrone sur un état fourni (chargé depuis PostgreSQL par l'unité de travail) :
 * pendant l'appel, `read()` et `tx()` travaillent sur cet état au lieu du magasin simulé.
 * Sûr parce que le code appelé est synchrone : rien ne peut s'intercaler (pas de partage entre requêtes).
 */
export function runOnState<T>(state: DbState, fn: () => T): T {
  if (overrideState) throw new Error("runOnState ne peut pas être imbriqué.");
  overrideState = state;
  try {
    return fn();
  } finally {
    overrideState = null;
  }
}
let overrideState: DbState | null = null;

/**
 * Transaction : travaille sur une copie, ne publie l'état qu'en cas de succès.
 * Toute exception annule l'ensemble des écritures (équivalent ROLLBACK).
 * Node exécute ce code de manière synchrone : aucune autre requête ne s'intercale.
 */
export function tx<T>(fn: (state: DbState) => T): T {
  if (overrideState) return fn(overrideState); // l'unité de travail PostgreSQL gère transaction, verrous et écriture
  const current = load();
  if (holder.seeding) return fn(current);
  const draft = structuredClone(current);
  const result = fn(draft);
  holder.state = draft;
  persist(draft);
  return result;
}

/** Réinitialise le jeu de démonstration. */
export function resetDatabase() {
  holder.state = null;
  if (persistEnabled && existsSync(dbPath)) {
    try {
      writeFileSync(dbPath, "");
    } catch {
      /* ignoré */
    }
  }
  load();
}
