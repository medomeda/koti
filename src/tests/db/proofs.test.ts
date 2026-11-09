import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ctxFor } from "@/server/context";
import { useConnection, type Connection } from "@/server/db/client";
import { paymentProofs } from "@/server/db/schema";
import type { DbState } from "@/server/db/store";
import * as pg from "@/server/pg/services";
import { assertProofUsable, compressProofImage, MAX_STORED_BYTES, purgeOrphanProofs, readProof, saveProof } from "@/server/proofs";
import { eq } from "drizzle-orm";
import { hasTestDb, openTestDb } from "./helpers";
import { resetWithDemo, snapshot } from "./pg-harness";

let conn: Connection;
let demo: DbState;
beforeAll(async () => { conn = await openTestDb(); useConnection(conn); });
afterAll(async () => { useConnection(null); await conn?.close(); });

/** Grande image « photo » (bruit) : lourde avant compression. */
async function bigPhoto(w = 3000, h = 2200) {
  const raw = Buffer.alloc(w * h * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919 + ((i >> 3) % 251)) & 255;
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
}

describe("Compression des justificatifs", () => {
  it("réduit une grosse photo (≤ 1 600 px, WebP, ≤ 300 Ko) et retire les métadonnées", async () => {
    const input = await bigPhoto();
    expect(input.length).toBeGreaterThan(1_500_000);
    const out = await compressProofImage(input);
    expect(out.data.length).toBeLessThanOrEqual(MAX_STORED_BYTES);
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(1600);
    const meta = await sharp(out.data).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
  });
  it("refuse un fichier qui n'est pas une image, un SVG et un fichier trop lourd", async () => {
    await expect(compressProofImage(Buffer.from("%PDF-1.4 pas une image"))).rejects.toThrow(/image lisible/);
    await expect(compressProofImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'))).rejects.toThrow(/Format non accepté|image lisible/);
    await expect(compressProofImage(Buffer.alloc(9 * 1024 * 1024, 1))).rejects.toThrow(/trop lourde/);
  });
});

describe.skipIf(!hasTestDb)("Justificatifs, transparence et options de la tontine (PostgreSQL)", () => {
  beforeEach(async () => { demo = await resetWithDemo(conn); });

  /** Une échéance à payer d'un membre simple (non administrateur) d'une tontine active. */
  async function aDueObligation() {
    return snapshot(conn, (s) => {
      for (const t of s.tontines.filter((x) => x.status === "ACTIVE")) {
        const admin = s.tontineMembers.find((m) => m.tontineId === t.id && m.role === "ADMIN")!;
        for (const o of s.contributionObligations) {
          if (o.tontineId !== t.id || (o.status !== "PENDING" && o.status !== "REJECTED")) continue;
          const m = s.tontineMembers.find((x) => x.id === o.memberId)!;
          if (m.role === "MEMBER" && m.status === "ACTIVE") return { tontineId: t.id, obligationId: o.id, memberUserId: m.userId, adminUserId: admin.userId };
        }
      }
      throw new Error("aucune échéance disponible");
    });
  }
  const declare = (userId: string, obligationId: string, proofId?: string) =>
    pg.declarePayment(ctxFor(userId), { obligationId, amount: 10_000, paymentDate: new Date().toISOString().slice(0, 10), paymentMethod: "MOBILE_MONEY", reference: "TX-SECRET-1", comment: "note privée", ...(proofId ? { proofId } : {}) });
  const setOptions = (adminId: string, tontineId: string, o: { paymentProofMode: "OFF" | "OPTIONAL" | "REQUIRED"; membersSeePayments: boolean }) => pg.updateTontineOptions(ctxFor(adminId), { tontineId, ...o });

  it("un justificatif envoyé est compressé, stocké, joint à la déclaration, et lisible seulement par son auteur et l'administrateur", async () => {
    const x = await aDueObligation();
    const saved = await saveProof(x.memberUserId, x.obligationId, await bigPhoto());
    expect(saved.sizeBytes).toBeLessThanOrEqual(MAX_STORED_BYTES);
    const paymentId = await declare(x.memberUserId, x.obligationId, saved.id);
    expect(await snapshot(conn, (s) => s.payments.find((p) => p.id === paymentId)!.proofId)).toBe(saved.id);
    expect(await readProof(x.memberUserId, saved.id, conn.db)).not.toBeNull();
    expect(await readProof(x.adminUserId, saved.id, conn.db)).not.toBeNull();
    const other = demo.users.find((u) => u.id !== x.memberUserId && u.id !== x.adminUserId && u.platformRole === "USER")!.id;
    expect(await readProof(other, saved.id, conn.db)).toBeNull();
    // Déjà joint : impossible de le réutiliser pour une autre déclaration.
    await expect(assertProofUsable(x.memberUserId, saved.id, x.obligationId, conn.db)).rejects.toThrow(/déjà utilisé|introuvable/);
  });

  it("le justificatif d'un autre membre ne peut pas être joint", async () => {
    const x = await aDueObligation();
    const theirs = await saveProof(x.memberUserId, x.obligationId, await bigPhoto(800, 600));
    const intruder = demo.users.find((u) => u.id !== x.memberUserId && u.platformRole === "USER")!.id;
    await expect(assertProofUsable(intruder, theirs.id, x.obligationId, conn.db)).rejects.toThrow(/introuvable|invalide|utilisé/);
  });

  it("mode OBLIGATOIRE : déclaration refusée sans justificatif ; mode AUCUN : envoi refusé", async () => {
    const x = await aDueObligation();
    await setOptions(x.adminUserId, x.tontineId, { paymentProofMode: "REQUIRED", membersSeePayments: false });
    await expect(declare(x.memberUserId, x.obligationId)).rejects.toThrow(/exige un justificatif/);
    const saved = await saveProof(x.memberUserId, x.obligationId, await bigPhoto(800, 600));
    await expect(declare(x.memberUserId, x.obligationId, saved.id)).resolves.toBeTruthy();
    await setOptions(x.adminUserId, x.tontineId, { paymentProofMode: "OFF", membersSeePayments: false });
    await expect(saveProof(x.memberUserId, x.obligationId, await bigPhoto(800, 600))).rejects.toThrow(/n'utilise pas de justificatif/);
  });

  it("seul l'administrateur change les options ; elles sont journalisées", async () => {
    const x = await aDueObligation();
    await expect(setOptions(x.memberUserId, x.tontineId, { paymentProofMode: "OFF", membersSeePayments: true })).rejects.toThrow(/droits|introuvable/i);
    await setOptions(x.adminUserId, x.tontineId, { paymentProofMode: "REQUIRED", membersSeePayments: true });
    const t = await snapshot(conn, (s) => ({ t: s.tontines.find((z) => z.id === x.tontineId)!, log: s.auditLogs.filter((a) => a.action === "tontine.options").length }));
    expect(t.t).toMatchObject({ paymentProofMode: "REQUIRED", membersSeePayments: true });
    expect(t.log).toBe(1);
  });

  it("transparence : désactivée, un membre ne voit que ses lignes ; activée, il voit celles des autres sans référence ni justificatif", async () => {
    const x = await aDueObligation();
    const saved = await saveProof(x.memberUserId, x.obligationId, await bigPhoto(800, 600));
    await declare(x.memberUserId, x.obligationId, saved.id);
    const viewer = await snapshot(conn, (s) => {
      const m = s.tontineMembers.find((z) => z.tontineId === x.tontineId && z.role === "MEMBER" && z.userId !== x.memberUserId && z.status === "ACTIVE")!;
      return m.userId;
    });
    const before = await pg.listTontineObligations(ctxFor(viewer), x.tontineId);
    expect(before.sharing).toBe(false);
    expect(before.summary).toBeNull();
    expect(before.rows.every((r) => r.memberId === before.rows[0]!.memberId)).toBe(true);

    await setOptions(x.adminUserId, x.tontineId, { paymentProofMode: "OPTIONAL", membersSeePayments: true });
    const after = await pg.listTontineObligations(ctxFor(viewer), x.tontineId);
    expect(after.sharing).toBe(true);
    expect(new Set(after.rows.map((r) => r.memberId)).size).toBeGreaterThan(1);
    const theirs = after.rows.find((r) => r.id === x.obligationId)!;
    expect(theirs.status).toBe("DECLARED");
    expect(theirs.lastPayment).toMatchObject({ amount: 10_000, reference: "", comment: "", proofId: null });
    expect(after.summary).not.toBeNull();
    // L'historique détaillé d'un autre membre reste fermé.
    await expect(pg.getObligationHistory(ctxFor(viewer), x.obligationId)).rejects.toThrow();
    // Ce membre-là garde sa référence et son justificatif ; l'administrateur aussi.
    const own = (await pg.listTontineObligations(ctxFor(x.memberUserId), x.tontineId)).rows.find((r) => r.id === x.obligationId)!;
    expect(own.lastPayment).toMatchObject({ reference: "TX-SECRET-1", proofId: saved.id });
    const adm = (await pg.listTontineObligations(ctxFor(x.adminUserId), x.tontineId)).rows.find((r) => r.id === x.obligationId)!;
    expect(adm.lastPayment).toMatchObject({ reference: "TX-SECRET-1", proofId: saved.id });
  });

  it("la purge supprime les justificatifs jamais joints (plus de 24 h) et garde les autres", async () => {
    const x = await aDueObligation();
    const orphan = await saveProof(x.memberUserId, x.obligationId, await bigPhoto(800, 600));
    const kept = await saveProof(x.memberUserId, x.obligationId, await bigPhoto(800, 600));
    await declare(x.memberUserId, x.obligationId, kept.id);
    expect(await purgeOrphanProofs(24, conn.db)).toBe(0); // trop récents
    await conn.db.update(paymentProofs).set({ createdAt: new Date(Date.now() - 48 * 3_600_000) });
    expect(await purgeOrphanProofs(24, conn.db)).toBe(1);
    expect(await conn.db.select().from(paymentProofs).where(eq(paymentProofs.id, orphan.id))).toHaveLength(0);
    expect(await conn.db.select().from(paymentProofs).where(eq(paymentProofs.id, kept.id))).toHaveLength(1);
  });
});
