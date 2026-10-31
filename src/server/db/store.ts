import "server-only";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  AuditLog,
  ContributionObligation,
  ContributionPeriod,
  Invitation,
  Notification,
  Payment,
  RotationSlot,
  Tontine,
  TontineMember,
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
  invitations: Invitation[];
  contributionPeriods: ContributionPeriod[];
  contributionObligations: ContributionObligation[];
  payments: Payment[];
  rotationSlots: RotationSlot[];
  notifications: Notification[];
  auditLogs: AuditLog[];
  /** Verrous des tâches planifiées (protection contre les exécutions multiples). */
  jobRuns: Array<{ key: string; ranAt: string }>;
}

const SCHEMA_VERSION = 1;

export function emptyState(): DbState {
  return {
    version: SCHEMA_VERSION,
    users: [],
    credentials: [],
    sessions: [],
    userProfiles: [],
    tontines: [],
    tontineMembers: [],
    invitations: [],
    contributionPeriods: [],
    contributionObligations: [],
    payments: [],
    rotationSlots: [],
    notifications: [],
    auditLogs: [],
    jobRuns: [],
  };
}

type Holder = { state: DbState | null; seeding: boolean };
const g = globalThis as typeof globalThis & { __kotiDb?: Holder };
const holder: Holder = (g.__kotiDb ??= { state: null, seeding: false });

const persistEnabled = process.env.NODE_ENV !== "test" && process.env.KOTI_DEMO_PERSIST !== "0";
const dbPath = resolve(process.cwd(), process.env.KOTI_DEMO_DB_PATH ?? ".data/koti-demo.json");

let seeder: ((state: DbState) => void) | null = null;

/** Enregistré par le module de seed (évite une dépendance circulaire). */
export function registerSeeder(fn: (state: DbState) => void) {
  seeder = fn;
}

function load(): DbState {
  if (holder.state) return holder.state;
  if (persistEnabled && existsSync(dbPath)) {
    try {
      const parsed = JSON.parse(readFileSync(dbPath, "utf8")) as DbState;
      if (parsed.version === SCHEMA_VERSION) {
        holder.state = parsed;
        return parsed;
      }
    } catch {
      // Fichier corrompu : on repart d'un jeu de démonstration propre.
    }
  }
  const fresh = emptyState();
  holder.state = fresh;
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
  return fn(load());
}

/**
 * Transaction : travaille sur une copie, ne publie l'état qu'en cas de succès.
 * Toute exception annule l'ensemble des écritures (équivalent ROLLBACK).
 * Node exécute ce code de manière synchrone : aucune autre requête ne s'intercale.
 */
export function tx<T>(fn: (state: DbState) => T): T {
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
