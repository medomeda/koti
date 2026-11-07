import { beforeEach, describe, expect, it } from "vitest";
import { safeNext } from "@/actions/_shared";
import { addDays, todayISO } from "@/lib/utils/dates";
import { acceptInvitation, createInvitation, listMyInvitations } from "@/modules/invitations/invitation.service";
import { listMembers, removeMember } from "@/modules/members/member.service";
import { declarePayment, listTontineObligations, rejectPayment } from "@/modules/payments/payment.service";
import { listRotation } from "@/modules/rotations/rotation.service";
import { changeTontineStatus, createTontine, listMyTontines } from "@/modules/tontines/tontine.service";
import { updateProfile } from "@/modules/users/user.service";
import { ctxFor } from "@/server/context";
import "@/server/db/seed";
import { read, resetDatabase } from "@/server/db/store";

const userId = (email: string) => read((s) => s.users.find((u) => u.email === email)!.id);
const T = todayISO();
const DAY = 86_400_000;
beforeEach(() => resetDatabase());

const tontine = (owner: string, over: Partial<Parameters<typeof createTontine>[1]> = {}) =>
  createTontine(ctxFor(owner), { name: "Test", description: "", contributionAmount: 1000, frequency: "WEEKLY", startDate: T, expectedMemberCount: 3, rotationMode: "MANUAL", ...over });

describe("redirections internes uniquement", () => {
  it.each(["//evil.com", "/\t/evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/%0a/evil"])("reste sur le site : %j", (v) => {
    const r = safeNext(v);
    expect(r.startsWith("/") && !r.startsWith("//")).toBe(true);
    expect(new URL(r, "http://koti.local").origin).toBe("http://koti.local");
  });
  it("conserve un chemin interne", () => expect(safeNext("/invite/abc?x=1")).toBe("/invite/abc?x=1"));
});

describe("invitations par téléphone", () => {
  it("un tiers qui s'attribue le numéro ne voit ni n'accepte l'invitation sans le jeton", () => {
    const ahmed = userId("ahmed@koti.demo");
    const awa = userId("awa@koti.demo");
    const tid = tontine(ahmed);
    const { invitationId } = createInvitation(ctxFor(ahmed), { tontineId: tid, email: null, phone: "+2250600009999" });
    updateProfile(ctxFor(awa), { fullName: "Awa Diallo", phone: "+2250600009999" });
    expect(listMyInvitations(ctxFor(awa)).some((i) => i.id === invitationId)).toBe(false);
    expect(() => acceptInvitation(ctxFor(awa), { invitationId })).toThrow(/autre contact/);
  });
});

describe("capacité et tours de main", () => {
  it("refuse une adhésion au-delà du nombre prévu", () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = tontine(ahmed, { expectedMemberCount: 2 });
    const a = createInvitation(ctxFor(ahmed), { tontineId: tid, email: "mariam@koti.demo", phone: null });
    const b = createInvitation(ctxFor(ahmed), { tontineId: tid, email: "awa@koti.demo", phone: null });
    acceptInvitation(ctxFor(userId("mariam@koti.demo")), { token: a.token });
    expect(() => acceptInvitation(ctxFor(userId("awa@koti.demo")), { token: b.token })).toThrow(/complète/);
  });

  it("un nouveau membre reprend la place libérée dans le cycle", () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = tontine(ahmed, { startDate: addDays(T, 7) });
    for (const who of ["mariam", "koffi"]) {
      const { token } = createInvitation(ctxFor(ahmed), { tontineId: tid, email: `${who}@koti.demo`, phone: null });
      acceptInvitation(ctxFor(userId(`${who}@koti.demo`)), { token });
    }
    const koffi = listMembers(ctxFor(ahmed), tid).members.find((m) => m.name.startsWith("Koffi"))!;
    removeMember(ctxFor(ahmed), { tontineId: tid, memberId: koffi.id, reason: "Départ" });
    const { token } = createInvitation(ctxFor(ahmed), { tontineId: tid, email: "awa@koti.demo", phone: null });
    acceptInvitation(ctxFor(userId("awa@koti.demo")), { token });
    const awaSlot = listRotation(ctxFor(ahmed), tid).rows.find((r) => r.name === "Awa Diallo")!;
    expect(awaSlot.position).toBe(3);
  });
});

describe("cycle de vie", () => {
  it("la reprise après suspension ne crée pas d'échéances rétroactives", () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = tontine(ahmed);
    changeTontineStatus(ctxFor(ahmed), tid, "activate");
    changeTontineStatus(ctxFor(ahmed), tid, "pause");
    const later = new Date(Date.now() + 15 * DAY);
    changeTontineStatus(ctxFor(ahmed, later), tid, "resume");
    const lates = read((s) => s.contributionObligations.filter((o) => o.tontineId === tid && o.dueDate > T && o.dueDate < addDays(T, 15)).length);
    expect(lates).toBe(0);
  });

  it("une pause courte ne fait pas perdre l'échéance suivante", () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = tontine(ahmed);
    // Le cycle compte autant de tours que de tickets au démarrage : on réunit les 3 membres prévus.
    for (const who of ["mariam", "koffi"]) {
      const { token } = createInvitation(ctxFor(ahmed), { tontineId: tid, email: `${who}@koti.demo`, phone: null });
      acceptInvitation(ctxFor(userId(`${who}@koti.demo`)), { token });
    }
    changeTontineStatus(ctxFor(ahmed), tid, "activate");
    changeTontineStatus(ctxFor(ahmed), tid, "pause");
    changeTontineStatus(ctxFor(ahmed, new Date(Date.now() + DAY)), tid, "resume");
    const next = read((s) => s.contributionObligations.filter((o) => o.tontineId === tid && o.dueDate === addDays(T, 7)).length);
    expect(next).toBe(3); // une obligation par ticket (3 membres, 1 ticket chacun)
  });

  it("refuse la clôture tant que des déclarations attendent", () => {
    const ahmed = userId("ahmed@koti.demo");
    const famille = listMyTontines(ctxFor(ahmed)).find((t) => t.name === "Tontine Famille")!.id;
    expect(() => changeTontineStatus(ctxFor(ahmed), famille, "close", "Fin du cycle")).toThrow(/attendent/);
  });
});

describe("affichage et visibilité", () => {
  it("un refus reste identifiable même une fois l'échéance passée", () => {
    const ahmed = userId("ahmed@koti.demo");
    const mariam = userId("mariam@koti.demo");
    const tid = tontine(ahmed, { startDate: addDays(T, -10), expectedMemberCount: 4 });
    const { token } = createInvitation(ctxFor(ahmed), { tontineId: tid, email: "mariam@koti.demo", phone: null });
    acceptInvitation(ctxFor(mariam, new Date(Date.now() - 20 * DAY)), { token });
    changeTontineStatus(ctxFor(ahmed), tid, "activate");
    const o = listTontineObligations(ctxFor(mariam), tid).rows.find((r) => r.status === "LATE")!;
    const pid = declarePayment(ctxFor(mariam), { obligationId: o.id, amount: 1000, paymentDate: T, paymentMethod: "CASH", reference: "", comment: "" });
    rejectPayment(ctxFor(ahmed), { paymentId: pid, reason: "Non reçu" });
    const after = listTontineObligations(ctxFor(mariam), tid).rows.find((r) => r.id === o.id)!;
    expect(after.status).toBe("LATE");
    expect(after.rejected).toBe(true);
  });

  it("un membre ne voit pas les anciens membres", () => {
    const ahmed = userId("ahmed@koti.demo");
    const famille = listMyTontines(ctxFor(ahmed)).find((t) => t.name === "Tontine Famille")!.id;
    const seydou = listMembers(ctxFor(ahmed), famille).members.find((m) => m.name.startsWith("Seydou"))!;
    removeMember(ctxFor(ahmed), { tontineId: famille, memberId: seydou.id, reason: "Départ" });
    expect(listMembers(ctxFor(userId("awa@koti.demo")), famille, { includeFormer: true }).members.some((m) => m.status !== "ACTIVE")).toBe(false);
    expect(listMembers(ctxFor(ahmed), famille, { includeFormer: true }).members.some((m) => m.status === "REMOVED")).toBe(true);
  });
});
