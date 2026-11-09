import "server-only";
import { and, count, eq, lt, sql } from "drizzle-orm";
import sharp from "sharp";
import { getDb, type Db } from "@/server/db/client";
import { contributionObligations, paymentProofs, tontineMembers, tontines } from "@/server/db/schema";
import { AppError, notFound } from "@/server/errors";

/**
 * Justificatifs de paiement (capture d'écran de Mobile Money, photo d'un reçu).
 *
 * - Envoi limité en taille, formats d'image courants uniquement ; l'image est TOUJOURS ré-encodée : réduite (1 600 px
 *   au plus), convertie en WebP, métadonnées (position GPS, appareil) supprimées. Un justificatif pèse ensuite ~50 à
 *   250 Ko, stocké dans la base (sauvegardé avec le reste) hors de l'état applicatif.
 * - Lisible uniquement par la personne qui l'a envoyé et par les administrateurs de la tontine, même si l'option
 *   « transparence » montre les paiements aux autres membres.
 * - Un justificatif envoyé mais jamais joint à une déclaration est purgé au bout de 24 heures.
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const MAX_STORED_BYTES = 300 * 1024;
const MAX_DIMENSION = 1600;
const MAX_PENDING_PER_USER = 10;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "avif"]);
const PROOF_MIME = "image/webp";
/** Justificatif jamais joint à une déclaration (colonnes qualifiées à la main : Drizzle n'ajoute pas le nom de table dans un select à table unique). */
const USED_NOT = sql`not exists (select 1 from payments p where p.proof_id = payment_proofs.id)`;

export interface CompressedProof {
  data: Buffer;
  width: number;
  height: number;
}

/** Réduit et ré-encode l'image. Lève une AppError claire si le fichier n'est pas une image acceptable. */
export async function compressProofImage(input: Buffer): Promise<CompressedProof> {
  if (input.length === 0) throw new AppError("VALIDATION", "Le fichier est vide.");
  if (input.length > MAX_UPLOAD_BYTES) throw new AppError("VALIDATION", `Image trop lourde (${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} Mo maximum).`);
  let format: string | undefined;
  try {
    format = (await sharp(input, { limitInputPixels: 80_000_000 }).metadata()).format;
  } catch {
    throw new AppError("VALIDATION", "Ce fichier n'est pas une image lisible.");
  }
  if (!format || !ACCEPTED_FORMATS.has(format)) throw new AppError("VALIDATION", "Format non accepté : envoyez une photo ou une capture d'écran (JPEG, PNG, WebP).");
  try {
    // On resserre la taille puis la qualité jusqu'à tenir dans MAX_STORED_BYTES.
    for (const [dimension, quality] of [[MAX_DIMENSION, 74], [MAX_DIMENSION, 60], [1280, 55], [1024, 48], [800, 40]] as const) {
      const { data, info } = await sharp(input, { limitInputPixels: 80_000_000 })
        .rotate() // applique l'orientation EXIF, puis les métadonnées sont retirées
        .resize({ width: dimension, height: dimension, fit: "inside", withoutEnlargement: true })
        .webp({ quality })
        .toBuffer({ resolveWithObject: true });
      if (data.length <= MAX_STORED_BYTES || dimension === 800) return { data, width: info.width, height: info.height };
    }
  } catch {
    throw new AppError("VALIDATION", "Cette image n'a pas pu être traitée. Essayez une autre capture ou une photo.");
  }
  throw new AppError("VALIDATION", "Cette image n'a pas pu être traitée.");
}

/** Ce que l'utilisateur peut joindre : sa propre échéance, tontine active ou suspendue, option activée. */
async function ownObligation(db: Db, userId: string, obligationId: string) {
  const [row] = await db
    .select({ tontineId: contributionObligations.tontineId, mode: tontines.paymentProofMode, status: tontines.status })
    .from(contributionObligations)
    .innerJoin(tontineMembers, eq(tontineMembers.id, contributionObligations.memberId))
    .innerJoin(tontines, eq(tontines.id, contributionObligations.tontineId))
    .where(and(eq(contributionObligations.id, obligationId), eq(tontineMembers.userId, userId), eq(tontineMembers.status, "ACTIVE")))
    .limit(1);
  return row;
}

/** Compresse puis enregistre un justificatif pour une échéance de l'utilisateur. */
export async function saveProof(userId: string, obligationId: string, input: Buffer, db: Db = getDb()): Promise<{ id: string; sizeBytes: number }> {
  const target = await ownObligation(db, userId, obligationId);
  if (!target) throw notFound("Échéance introuvable.");
  if (target.mode === "OFF") throw new AppError("INVALID_STATE", "Cette tontine n'utilise pas de justificatif de paiement.");
  if (target.status !== "ACTIVE" && target.status !== "PAUSED") throw new AppError("INVALID_STATE", "Cette tontine n'accepte pas de déclaration dans son état actuel.");
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(paymentProofs)
    .where(and(eq(paymentProofs.uploadedBy, userId), USED_NOT));
  if (n >= MAX_PENDING_PER_USER) throw new AppError("INVALID_STATE", "Trop de justificatifs en attente : déclarez vos paiements ou réessayez plus tard.");
  const image = await compressProofImage(input);
  const [row] = await db
    .insert(paymentProofs)
    .values({ tontineId: target.tontineId, uploadedBy: userId, mimeType: PROOF_MIME, width: image.width, height: image.height, sizeBytes: image.data.length, data: image.data })
    .returning({ id: paymentProofs.id, sizeBytes: paymentProofs.sizeBytes });
  return row!;
}

/** Contrôle avant déclaration : le justificatif est celui de l'utilisateur, pour cette tontine, et pas déjà utilisé. */
export async function assertProofUsable(userId: string, proofId: string, obligationId: string, db: Db = getDb()): Promise<void> {
  const target = await ownObligation(db, userId, obligationId);
  const [proof] = await db
    .select({ tontineId: paymentProofs.tontineId, uploadedBy: paymentProofs.uploadedBy, used: sql<boolean>`exists (select 1 from payments p where p.proof_id = payment_proofs.id)` })
    .from(paymentProofs)
    .where(eq(paymentProofs.id, proofId))
    .limit(1);
  if (!target || !proof || proof.uploadedBy !== userId || proof.tontineId !== target.tontineId || proof.used) {
    throw new AppError("VALIDATION", "Justificatif introuvable ou déjà utilisé : envoyez-le à nouveau.", { proof: "Justificatif invalide." });
  }
}

/** Lecture d'un justificatif : son auteur ou un administrateur actif de la tontine, sinon rien (même réponse que s'il n'existait pas). */
export async function readProof(userId: string, proofId: string, db: Db = getDb()): Promise<{ data: Buffer; mimeType: string } | null> {
  const [row] = await db
    .select({ data: paymentProofs.data, mimeType: paymentProofs.mimeType, uploadedBy: paymentProofs.uploadedBy, tontineId: paymentProofs.tontineId })
    .from(paymentProofs)
    .where(eq(paymentProofs.id, proofId))
    .limit(1);
  if (!row) return null;
  if (row.uploadedBy !== userId) {
    const [admin] = await db
      .select({ id: tontineMembers.id })
      .from(tontineMembers)
      .where(and(eq(tontineMembers.tontineId, row.tontineId), eq(tontineMembers.userId, userId), eq(tontineMembers.role, "ADMIN"), eq(tontineMembers.status, "ACTIVE")))
      .limit(1);
    if (!admin) return null;
  }
  return { data: row.data, mimeType: row.mimeType };
}

/** Supprime les justificatifs envoyés mais jamais joints à une déclaration depuis plus de `hours` heures. */
export async function purgeOrphanProofs(hours = 24, db: Db = getDb()): Promise<number> {
  const cutoff = new Date(Date.now() - hours * 3_600_000);
  const rows = await db
    .delete(paymentProofs)
    .where(and(lt(paymentProofs.createdAt, cutoff), USED_NOT))
    .returning({ id: paymentProofs.id });
  return rows.length;
}

