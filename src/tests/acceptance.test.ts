import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayISO } from "@/lib/utils/dates";
import { acceptInvitation, createInvitation, listMyInvitations, previewInvitation, refuseInvitation } from "@/modules/invitations/invitation.service";
import { listMembers, removeMember } from "@/modules/members/member.service";
import { listNotifications } from "@/modules/notifications/notification.service";
import { declarePayment, getObligationHistory, listMyObligations, listTontineObligations, rejectPayment, validatePayment } from "@/modules/payments/payment.service";
import { listRotation, reorderRotation } from "@/modules/rotations/rotation.service";
import { changeTontineStatus, createTontine, getTontineOverview, listMyTontines, updateTontine } from "@/modules/tontines/tontine.service";
import { authenticate, signUp } from "@/modules/users/user.service";
import { ctxFor } from "@/server/context";
import "@/server/db/seed";
import { read, resetDatabase } from "@/server/db/store";
import { runScheduledJobs } from "@/server/jobs";

const userId = (email: string) => read((s) => s.users.find((u) => u.email === email)!.id);
const T = todayISO();

beforeEach(() => resetDatabase());

function newTontine(owner: string, overrides: Partial<Parameters<typeof createTontine>[1]> = {}) {
  return createTontine(ctxFor(owner), {
    name: "Tontine Test",
    description: "",
    contributionAmount: 10_000,
    frequency: "WEEKLY",
    startDate: addDays(T, -1),
    expectedMemberCount: 4,
    rotationMode: "MANUAL",
    ...overrides,
  });
}

describe("Scénario 1 — création", () => {
  it("un nouvel utilisateur crée une tontine et en devient administrateur", () => {
    const id = signUp({ fullName: "Nouvel Utilisateur", email: "nouveau@test.ci", phone: "+2250600000001", password: "Secret123" });
    expect(authenticate("nouveau@test.ci", "Secret123")).toBe(id);
    expect(authenticate("nouveau@test.ci", "mauvais")).toBeNull();
    const tid = newTontine(id, { name: "Tontine Famille" });
    const cards = listMyTontines(ctxFor(id));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: tid, role: "ADMIN", memberCount: 1, status: "DRAFT" });
  });

  it("refuse un e-mail déjà utilisé", () => {
    expect(() => signUp({ fullName: "Doublon", email: "ahmed@koti.demo", phone: "+2250600000002", password: "Secret123" })).toThrow(/existe déjà/);
  });
});

describe("Scénario 2 — invitation", () => {
  it("l'invitée accepte et devient membre ; le jeton n'est utilisable qu'une fois", () => {
    const ahmed = userId("ahmed@koti.demo");
    const mariam = userId("mariam@koti.demo");
    const tid = newTontine(ahmed);
    const { token } = createInvitation(ctxFor(ahmed), { tontineId: tid, email: "mariam@koti.demo", phone: null });
    expect(previewInvitation(token)?.status).toBe("PENDING");
    expect(listMyInvitations(ctxFor(mariam)).some((i) => i.tontineName === "Tontine Test")).toBe(true);
    acceptInvitation(ctxFor(mariam), { token });
    expect(listMembers(ctxFor(mariam), tid).members.map((m) => m.name)).toContain("Mariam Koné");
    expect(() => acceptInvitation(ctxFor(mariam), { token })).toThrow();
    expect(read((s) => s.invitations.every((i) => i.tokenHash !== token))).toBe(true);
  });

  it("un autre compte ne peut pas utiliser l'invitation", () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = newTontine(ahmed);
    const { token } = createInvitation(ctxFor(ahmed), { tontineId: tid, email: "mariam@koti.demo", phone: null });
    expect(() => acceptInvitation(ctxFor(userId("awa@koti.demo")), { token })).toThrow(/autre contact/);
  });

  it("une invitation expirée est refusée", () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = newTontine(ahmed);
    const { token } = createInvitation(ctxFor(ahmed), { tontineId: tid, email: "mariam@koti.demo", phone: null });
    const later = new Date(Date.now() + 8 * 86_400_000);
    expect(() => acceptInvitation(ctxFor(userId("mariam@koti.demo"), later), { token })).toThrow(/expiré/);
  });

  it("un membre ne peut pas inviter ; refus d'invitation notifié à l'admin", () => {
    const ahmed = userId("ahmed@koti.demo");
    const mariam = userId("mariam@koti.demo");
    const tid = newTontine(ahmed);
    const { token } = createInvitation(ctxFor(ahmed), { tontineId: tid, email: "mariam@koti.demo", phone: null });
    acceptInvitation(ctxFor(mariam), { token });
    expect(() => createInvitation(ctxFor(mariam), { tontineId: tid, email: "awa@koti.demo", phone: null })).toThrow(/droits/);
    const inv2 = createInvitation(ctxFor(ahmed), { tontineId: tid, email: "awa@koti.demo", phone: null });
    refuseInvitation(ctxFor(userId("awa@koti.demo")), { token: inv2.token });
    expect(listNotifications(ctxFor(ahmed)).some((n) => n.type === "INVITATION_REFUSED")).toBe(true);
  });
});

describe("Scénarios 3 & 4 — paiement, validation, refus", () => {
  function setup() {
    const ahmed = userId("ahmed@koti.demo");
    const mariam = userId("mariam@koti.demo");
    const tid = newTontine(ahmed);
    const { token } = createInvitation(ctxFor(ahmed), { tontineId: tid, email: "mariam@koti.demo", phone: null });
    acceptInvitation(ctxFor(mariam), { token });
    changeTontineStatus(ctxFor(ahmed), tid, "activate");
    const obligation = listTontineObligations(ctxFor(mariam), tid).rows[0]!;
    return { ahmed, mariam, tid, obligation };
  }
  const declare = (who: string, obligationId: string) =>
    declarePayment(ctxFor(who), { obligationId, amount: 10_000, paymentDate: T, paymentMethod: "MOBILE_MONEY", reference: "MM1", comment: "" });

  it("déclaration → DECLARED → validation → PAID, avec notifications", () => {
    const { ahmed, mariam, tid, obligation } = setup();
    // Mariam a rejoint après le démarrage : elle ne doit que les échéances postérieures à son adhésion.
    expect(listTontineObligations(ctxFor(mariam), tid).rows.every((r) => r.dueDate >= T)).toBe(true);
    expect(obligation.status).toBe("PENDING");
    const pid = declare(mariam, obligation.id);
    expect(listTontineObligations(ctxFor(mariam), tid).rows[0]!.status).toBe("DECLARED");
    expect(listNotifications(ctxFor(ahmed)).some((n) => n.type === "PAYMENT_DECLARED" && n.resourceId === pid)).toBe(true);
    expect(() => declare(mariam, obligation.id)).toThrow(/déjà en attente/);
    validatePayment(ctxFor(ahmed), pid);
    expect(() => validatePayment(ctxFor(ahmed), pid)).toThrow(/déjà été traité/);
    expect(listTontineObligations(ctxFor(mariam), tid).rows[0]!.status).toBe("PAID");
    expect(listNotifications(ctxFor(mariam)).some((n) => n.type === "PAYMENT_VALIDATED")).toBe(true);
  });

  it("refus avec motif, nouvelle déclaration, historique conservé", () => {
    const { ahmed, mariam, obligation } = setup();
    const p1 = declare(mariam, obligation.id);
    rejectPayment(ctxFor(ahmed), { paymentId: p1, reason: "Référence introuvable" });
    expect(listNotifications(ctxFor(mariam)).some((n) => n.type === "PAYMENT_REJECTED")).toBe(true);
    const p2 = declare(mariam, obligation.id);
    validatePayment(ctxFor(ahmed), p2);
    const history = getObligationHistory(ctxFor(mariam), obligation.id);
    expect(history.map((h) => h.status)).toEqual(["PAID", "REJECTED"]);
    expect(history[1]!.rejectionReason).toBe("Référence introuvable");
  });

  it("un membre ne peut ni valider ni déclarer pour autrui ; date future interdite", () => {
    const { ahmed, mariam, tid } = setup();
    const ahmedObligation = listTontineObligations(ctxFor(ahmed), tid).rows.find((r) => r.memberName === "Ahmed Traoré")!;
    expect(() => declare(mariam, ahmedObligation.id)).toThrow(/introuvable/);
    const pid = declare(ahmed, ahmedObligation.id);
    expect(() => validatePayment(ctxFor(mariam), pid)).toThrow(/droits/);
    const mine = listTontineObligations(ctxFor(mariam), tid).rows[0]!;
    expect(() => declarePayment(ctxFor(mariam), { obligationId: mine.id, amount: 10_000, paymentDate: addDays(T, 2), paymentMethod: "CASH", reference: "", comment: "" })).toThrow(/futur/);
  });
});

describe("Scénario 5 — plusieurs tontines", () => {
  it("Ahmed voit ses tontines avec le bon rôle dans chacune", () => {
    const cards = listMyTontines(ctxFor(userId("ahmed@koti.demo")));
    const byName = Object.fromEntries(cards.map((c) => [c.name, c.role]));
    expect(byName["Tontine Famille"]).toBe("ADMIN");
    expect(byName["Tontine des Amies"]).toBe("MEMBER");
    expect(byName["Projet Tabaski 2027"]).toBe("ADMIN");
    expect(cards.length).toBeGreaterThanOrEqual(5);
  });
});

describe("Scénario 6 — cloisonnement", () => {
  it("un non-membre n'accède à aucune donnée d'une tontine, même avec son identifiant", () => {
    const koffi = userId("koffi@koti.demo");
    const amies = listMyTontines(ctxFor(userId("mariam@koti.demo"))).find((c) => c.name === "Tontine des Amies")!.id;
    expect(() => getTontineOverview(ctxFor(koffi), amies)).toThrow(/introuvable/);
    expect(() => listMembers(ctxFor(koffi), amies)).toThrow(/introuvable/);
    expect(() => listTontineObligations(ctxFor(koffi), amies)).toThrow(/introuvable/);
    expect(() => listRotation(ctxFor(koffi), amies)).toThrow(/introuvable/);
    expect(() => updateTontine(ctxFor(koffi), { tontineId: amies, name: "Piratée", description: "" })).toThrow(/introuvable/);
  });

  it("un membre retiré perd l'accès mais son historique est conservé", () => {
    const ahmed = userId("ahmed@koti.demo");
    const seydou = userId("seydou@koti.demo");
    const famille = listMyTontines(ctxFor(ahmed)).find((c) => c.name === "Tontine Famille")!.id;
    // Seydou passe en dernier : son tour est à venir et doit être annulé.
    const removed = listMembers(ctxFor(ahmed), famille).members.find((m) => m.name === "Seydou Coulibaly")!;
    const paidBefore = read((s) => s.payments.filter((p) => s.contributionObligations.find((o) => o.id === p.obligationId)?.memberId === removed.id).length);
    removeMember(ctxFor(ahmed), { tontineId: famille, memberId: removed.id, reason: "Départ volontaire" });
    expect(() => getTontineOverview(ctxFor(seydou), famille)).toThrow();
    expect(read((s) => s.payments.filter((p) => s.contributionObligations.find((o) => o.id === p.obligationId)?.memberId === removed.id).length)).toBe(paidBefore);
    expect(listRotation(ctxFor(ahmed), famille).rows.find((r) => r.memberId === removed.id)?.status).toBe("CANCELLED");
  });
});

describe("Scénario 7 — paiements personnels", () => {
  it("la page Paiements ne contient que les obligations de l'utilisateur", () => {
    const mariam = userId("mariam@koti.demo");
    const myMemberIds = read((s) => new Set(s.tontineMembers.filter((m) => m.userId === mariam).map((m) => m.id)));
    const { toPay, pending, history } = listMyObligations(ctxFor(mariam));
    for (const row of [...toPay, ...pending, ...history]) expect(myMemberIds.has(row.memberId)).toBe(true);
    const famille = listMyTontines(ctxFor(mariam)).find((c) => c.name === "Tontine Famille")!.id;
    const { rows, stats } = listTontineObligations(ctxFor(mariam), famille);
    expect(stats).toBeNull();
    expect(rows.every((r) => r.memberName === "Mariam Koné")).toBe(true);
  });
});

describe("Scénario 8 — tours de main", () => {
  it("ordre unique, dates cohérentes, réorganisation libre en brouillon", () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = newTontine(ahmed, { startDate: addDays(T, 10) });
    for (const who of ["mariam", "awa", "koffi"]) {
      const { token } = createInvitation(ctxFor(ahmed), { tontineId: tid, email: `${who}@koti.demo`, phone: null });
      acceptInvitation(ctxFor(userId(`${who}@koti.demo`)), { token });
    }
    const before = listRotation(ctxFor(ahmed), tid).rows;
    const reversed = [...before].reverse().map((r) => r.memberId);
    reorderRotation(ctxFor(ahmed), { tontineId: tid, memberIds: reversed });
    const after = listRotation(ctxFor(ahmed), tid).rows;
    expect(after.map((r) => r.memberId)).toEqual(reversed);
    expect(new Set(after.map((r) => r.position)).size).toBe(after.length);
    expect(after.map((r) => r.scheduledDate)).toEqual([0, 7, 14, 21].map((d) => addDays(addDays(T, 10), d)));
    expect(() => reorderRotation(ctxFor(userId("mariam@koti.demo")), { tontineId: tid, memberIds: reversed })).toThrow(/droits/);
  });

  it("après démarrage : motif obligatoire et tours passés figés", () => {
    const ahmed = userId("ahmed@koti.demo");
    const famille = listMyTontines(ctxFor(ahmed)).find((c) => c.name === "Tontine Famille")!.id;
    const rows = listRotation(ctxFor(ahmed), famille).rows;
    const upcoming = rows.filter((r) => r.status === "UPCOMING").map((r) => r.memberId);
    expect(() => reorderRotation(ctxFor(ahmed), { tontineId: famille, memberIds: [...upcoming].reverse() })).toThrow(/motif/i);
    expect(() => reorderRotation(ctxFor(ahmed), { tontineId: famille, memberIds: rows.map((r) => r.memberId) })).toThrow(/modifié/);
    reorderRotation(ctxFor(ahmed), { tontineId: famille, memberIds: [...upcoming].reverse(), reason: "Demande d'Aminata" });
    const after = listRotation(ctxFor(ahmed), famille).rows;
    expect(after.filter((r) => r.status === "COMPLETED").map((r) => r.memberId)).toEqual(rows.filter((r) => r.status === "COMPLETED").map((r) => r.memberId));
  });
});

describe("Échéances et tâches planifiées", () => {
  it("la génération est idempotente et les rappels ne sont pas dupliqués", () => {
    const count = () => read((s) => [s.contributionObligations.length, s.notifications.length]);
    const before = count();
    runScheduledJobs(new Date(), { force: true });
    runScheduledJobs(new Date(), { force: true });
    expect(count()).toEqual(before);
  });

  it("une tontine suspendue ne génère plus d'échéances", () => {
    const ahmed = userId("ahmed@koti.demo");
    const tid = newTontine(ahmed, { startDate: addDays(T, -1) });
    changeTontineStatus(ctxFor(ahmed), tid, "activate");
    changeTontineStatus(ctxFor(ahmed), tid, "pause");
    const n = read((s) => s.contributionObligations.filter((o) => o.tontineId === tid).length);
    runScheduledJobs(new Date(Date.now() + 30 * 86_400_000), { force: true });
    expect(read((s) => s.contributionObligations.filter((o) => o.tontineId === tid).length)).toBe(n);
  });

  it("les paramètres financiers sont verrouillés après démarrage", () => {
    const ahmed = userId("ahmed@koti.demo");
    const famille = listMyTontines(ctxFor(ahmed)).find((c) => c.name === "Tontine Famille")!.id;
    expect(() =>
      updateTontine(ctxFor(ahmed), { tontineId: famille, name: "X Famille", description: "", financial: { name: "X", description: "", contributionAmount: 1, frequency: "WEEKLY", startDate: T, expectedMemberCount: 3, rotationMode: "MANUAL" } }),
    ).toThrow(/verrouillés/);
  });

  it("une transaction en échec n'écrit rien (rollback)", () => {
    const ahmed = userId("ahmed@koti.demo");
    const before = read((s) => s.auditLogs.length);
    expect(() => changeTontineStatus(ctxFor(ahmed), "00000000-0000-4000-8000-000000000000", "pause")).toThrow();
    expect(read((s) => s.auditLogs.length)).toBe(before);
  });
});
