import { beforeEach, describe, expect, it } from "vitest";
import { safeNext } from "@/actions/_shared";
import { addDays, todayISO } from "@/lib/utils/dates";
import { ctxFor } from "@/server/context";
import type { DbState } from "@/server/db/store";
import * as pg from "@/server/pg/services";
import { afterAll, beforeAll } from "vitest";
import { useConnection, type Connection } from "@/server/db/client";
import { hasTestDb, openTestDb } from "./helpers";
import { resetWithDemo, snapshot } from "./pg-harness";

let conn: Connection;
let demo: DbState;
const snap = <T,>(fn: (s: DbState) => T) => snapshot(conn, fn);

describe.skipIf(!hasTestDb)("Parité PostgreSQL : review-regressions.test.ts", () => {
beforeAll(async () => { conn = await openTestDb(); useConnection(conn); });
afterAll(async () => { useConnection(null); await conn?.close(); });

const userId = (email: string) => demo.users.find((u) => u.email === email)!.id;
const T = todayISO();
const DAY = 86_400_000;
beforeEach(async () => { demo = await resetWithDemo(conn); });

const tontine = async (owner: string, over: Partial<Parameters<typeof pg.createTontine>[1]> = {}) =>
  (await pg.createTontine(ctxFor(owner), { name: "Test", description: "", contributionAmount: 1000, frequency: "WEEKLY", startDate: T, expectedMemberCount: 3, rotationMode: "MANUAL", ...over }));

describe("redirections internes uniquement", () => {
  it.each(["//evil.com", "/\t/evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/%0a/evil"])("reste sur le site : %j", (v) => {
    const r = safeNext(v);
    expect(r.startsWith("/") && !r.startsWith("//")).toBe(true);
    expect(new URL(r, "http://koti.local").origin).toBe("http://koti.local");
  });
  it("conserve un chemin interne", async () => expect(safeNext("/invite/abc?x=1")).toBe("/invite/abc?x=1"));
});

describe("invitations par téléphone", () => {
  it("un tiers qui s'attribue le numéro ne voit ni n'accepte l'invitation sans le jeton", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const awa = userId("awa@koti.demo");
    const tid = (await tontine(ahmed));
    const { invitationId } = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: null, phone: "+2250600009999" }));
    (await pg.updateProfile(ctxFor(awa), { fullName: "Awa Diallo", phone: "+2250600009999" }));
    expect((await pg.listMyInvitations(ctxFor(awa))).some((i) => i.id === invitationId)).toBe(false);
    await expect((async () => (await pg.acceptInvitation(ctxFor(awa), { invitationId })))()).rejects.toThrow(/autre contact/);
  });
});

describe("capacité et tours de main", () => {
  it("refuse une adhésion au-delà du nombre prévu", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = (await tontine(ahmed, { expectedMemberCount: 2 }));
    const a = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: "mariam@koti.demo", phone: null }));
    const b = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: "awa@koti.demo", phone: null }));
    (await pg.acceptInvitation(ctxFor(userId("mariam@koti.demo")), { token: a.token }));
    await expect((async () => (await pg.acceptInvitation(ctxFor(userId("awa@koti.demo")), { token: b.token })))()).rejects.toThrow(/complète/);
  });

  it("un nouveau membre reprend la place libérée dans le cycle", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = (await tontine(ahmed, { startDate: addDays(T, 7) }));
    for (const who of ["mariam", "koffi"]) {
      const { token } = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: `${who}@koti.demo`, phone: null }));
      (await pg.acceptInvitation(ctxFor(userId(`${who}@koti.demo`)), { token }));
    }
    const koffi = (await pg.listMembers(ctxFor(ahmed), tid)).members.find((m) => m.name.startsWith("Koffi"))!;
    (await pg.removeMember(ctxFor(ahmed), { tontineId: tid, memberId: koffi.id, reason: "Départ" }));
    const { token } = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: "awa@koti.demo", phone: null }));
    (await pg.acceptInvitation(ctxFor(userId("awa@koti.demo")), { token }));
    const awaSlot = (await pg.listRotation(ctxFor(ahmed), tid)).rows.find((r) => r.name === "Awa Diallo")!;
    expect(awaSlot.position).toBe(3);
  });
});

describe("cycle de vie", () => {
  it("la reprise après suspension ne crée pas d'échéances rétroactives", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = (await tontine(ahmed));
    (await pg.changeTontineStatus(ctxFor(ahmed), tid, "activate"));
    (await pg.changeTontineStatus(ctxFor(ahmed), tid, "pause"));
    const later = new Date(Date.now() + 15 * DAY);
    (await pg.changeTontineStatus(ctxFor(ahmed, later), tid, "resume"));
    const lates = await snap((s) => s.contributionObligations.filter((o) => o.tontineId === tid && o.dueDate > T && o.dueDate < addDays(T, 15)).length);
    expect(lates).toBe(0);
  });

  it("une pause courte ne fait pas perdre l'échéance suivante", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = (await tontine(ahmed));
    // Le cycle compte autant de tours que de tickets au démarrage : on réunit les 3 membres prévus.
    for (const who of ["mariam", "koffi"]) {
      const { token } = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: `${who}@koti.demo`, phone: null }));
      (await pg.acceptInvitation(ctxFor(userId(`${who}@koti.demo`)), { token }));
    }
    (await pg.changeTontineStatus(ctxFor(ahmed), tid, "activate"));
    (await pg.changeTontineStatus(ctxFor(ahmed), tid, "pause"));
    (await pg.changeTontineStatus(ctxFor(ahmed, new Date(Date.now() + DAY)), tid, "resume"));
    const next = await snap((s) => s.contributionObligations.filter((o) => o.tontineId === tid && o.dueDate === addDays(T, 7)).length);
    expect(next).toBe(3); // une obligation par ticket (3 membres, 1 ticket chacun)
  });

  it("refuse la clôture tant que des déclarations attendent", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const famille = (await pg.listMyTontines(ctxFor(ahmed))).find((t) => t.name === "Tontine Famille")!.id;
    await expect((async () => (await pg.changeTontineStatus(ctxFor(ahmed), famille, "close", "Fin du cycle")))()).rejects.toThrow(/attendent/);
  });
});

describe("affichage et visibilité", () => {
  it("un refus reste identifiable même une fois l'échéance passée", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const mariam = userId("mariam@koti.demo");
    const tid = (await tontine(ahmed, { startDate: addDays(T, -10), expectedMemberCount: 4 }));
    const { token } = (await pg.createInvitation(ctxFor(ahmed), { tontineId: tid, email: "mariam@koti.demo", phone: null }));
    (await pg.acceptInvitation(ctxFor(mariam, new Date(Date.now() - 20 * DAY)), { token }));
    (await pg.changeTontineStatus(ctxFor(ahmed), tid, "activate"));
    const o = (await pg.listTontineObligations(ctxFor(mariam), tid)).rows.find((r) => r.status === "LATE")!;
    const pid = (await pg.declarePayment(ctxFor(mariam), { obligationId: o.id, amount: 1000, paymentDate: T, paymentMethod: "CASH", reference: "", comment: "" }));
    (await pg.rejectPayment(ctxFor(ahmed), { paymentId: pid, reason: "Non reçu" }));
    const after = (await pg.listTontineObligations(ctxFor(mariam), tid)).rows.find((r) => r.id === o.id)!;
    expect(after.status).toBe("LATE");
    expect(after.rejected).toBe(true);
  });

  it("un membre ne voit pas les anciens membres", async () => {
    const ahmed = userId("ahmed@koti.demo");
    const famille = (await pg.listMyTontines(ctxFor(ahmed))).find((t) => t.name === "Tontine Famille")!.id;
    const seydou = (await pg.listMembers(ctxFor(ahmed), famille)).members.find((m) => m.name.startsWith("Seydou"))!;
    (await pg.removeMember(ctxFor(ahmed), { tontineId: famille, memberId: seydou.id, reason: "Départ" }));
    expect((await pg.listMembers(ctxFor(userId("awa@koti.demo")), famille, { includeFormer: true })).members.some((m) => m.status !== "ACTIVE")).toBe(false);
    expect((await pg.listMembers(ctxFor(ahmed), famille, { includeFormer: true })).members.some((m) => m.status === "REMOVED")).toBe(true);
  });
});

});
