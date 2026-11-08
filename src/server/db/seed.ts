import "server-only";
import { hashPassword } from "@/lib/auth/password";
import { addDays, parseISODate, todayISO } from "@/lib/utils/dates";
import { ensureObligations } from "@/modules/contributions/contribution.service";
import { changePlan } from "@/modules/billing/billing.service";
import { acceptInvitation, createInvitation } from "@/modules/invitations/invitation.service";
import { declarePayment, rejectPayment, validatePayment } from "@/modules/payments/payment.service";
import { removeMember } from "@/modules/members/member.service";
import { reorderRotation } from "@/modules/rotations/rotation.service";
import { createTicket } from "@/modules/tickets/ticket.service";
import { changeTontineStatus, createTontine } from "@/modules/tontines/tontine.service";
import { registerUser } from "@/modules/users/user.service";
import { runScheduledJobs } from "@/server/jobs";
import type { Ctx } from "@/server/context";
import type { PaymentMethod } from "@/types/domain";
import { seedPlatformActivity, seedPlatformStructure, type PlatformSeedResult } from "./seed-platform";
import type { DbState } from "./store";

/**
 * Jeu de démonstration. Il est construit en REJOUANT les vraies opérations métier
 * (création, invitations, déclarations, validations…) sur une horloge simulée : les données
 * sont donc cohérentes (historiques, notifications, audit) et relatives à la date du jour.
 */
export const DEMO_PASSWORD = "Koti2026";

export const DEMO_ACCOUNTS = [
  { email: "ahmed@koti.demo", fullName: "Ahmed Traoré", phone: "+2250701020304", hint: "Admin de 3 tontines, membre de 3" },
  { email: "mariam@koti.demo", fullName: "Mariam Koné", phone: "+2250702030405", hint: "Admin « Tontine des Amies »" },
  { email: "koffi@koti.demo", fullName: "Koffi N'Guessan", phone: "+2250703040506", hint: "Membre, admin « Association Riviera »" },
  { email: "awa@koti.demo", fullName: "Awa Diallo", phone: "+2250704050607", hint: "Membre simple" },
] as const;

/** Équipe KOTI (espace d'administration de la plateforme). Mot de passe identique. */
export const DEMO_STAFF = [
  { email: "operateur@koti.demo", fullName: "Équipe KOTI (super-admin)", hint: "Espace d'administration : tous les droits" },
  { email: "support@koti.demo", fullName: "Support KOTI", hint: "Espace d'administration : consultation et notes" },
] as const;

const OTHERS = [
  { email: "ibrahim@koti.demo", fullName: "Ibrahim Ouattara", phone: "+2250705060708" },
  { email: "fatou@koti.demo", fullName: "Fatou Bamba", phone: "+2250706070809" },
  { email: "seydou@koti.demo", fullName: "Seydou Coulibaly", phone: "+2250707080910" },
  { email: "aminata@koti.demo", fullName: "Aminata Sangaré", phone: "+2250708091011" },
  { email: "yao@koti.demo", fullName: "Yao Kouassi", phone: "+2250709101112" },
  { email: "kadi@koti.demo", fullName: "Kadidiatou Touré", phone: "+2250710111213" },
];

/** Pseudo-aléatoire déterministe (le jeu reste identique d'un démarrage à l'autre). */
function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2 ** 31;
    return x / 2 ** 31;
  };
}

const at = (date: string, hour = 10): Date => new Date(parseISODate(date).getTime() + hour * 3600_000);

export function seedDemo(s: DbState) {
  const T = todayISO();
  const now = new Date();
  const hash = hashPassword(DEMO_PASSWORD);
  const ids: Record<string, string> = {};
  for (const u of [...DEMO_ACCOUNTS, ...OTHERS]) {
    ids[u.email.split("@")[0]!] = registerUser(s, { fullName: u.fullName, email: u.email, phone: u.phone, password: "", passwordHash: hash, now: at(addDays(T, -150)) });
  }
  // Équipe KOTI : opérateur de la plateforme (espace d'administration, étape 3 du chantier SaaS).
  ids.operateur = registerUser(s, { fullName: "Équipe KOTI", email: "operateur@koti.demo", phone: "+2250700000000", password: "", passwordHash: hash, now: at(addDays(T, -200)) });
  s.users.find((u) => u.id === ids.operateur)!.platformRole = "SUPER_ADMIN";
  ids.support = registerUser(s, { fullName: "Support KOTI", email: "support@koti.demo", phone: "+2250700000001", password: "", passwordHash: hash, now: at(addDays(T, -190)) });
  s.users.find((u) => u.id === ids.support)!.platformRole = "SUPPORT";
  for (const u of s.users) u.emailVerified = true;
  const c = (who: string, date: string, hour = 10): Ctx => ({ userId: ids[who]!, now: at(date, hour) });
  const random = rng(42);
  const methods: PaymentMethod[] = ["MOBILE_MONEY", "MOBILE_MONEY", "CASH", "BANK_TRANSFER"];
  // Ahmed organise 3 tontines dont une à tickets multiples : offre « Organisateur » (essai puis factures mensuelles).
  changePlan(c("ahmed", addDays(T, -110)), "PRO");

  const invite = (admin: string, tontineId: string, who: string, date: string) => {
    const { token } = createInvitation(c(admin, date), { tontineId, email: `${who}@koti.demo`, phone: null });
    acceptInvitation(c(who, addDays(date, 1)), { token });
  };

  const memberIdOf = (tontineId: string, who: string) => s.tontineMembers.find((m) => m.tontineId === tontineId && m.userId === ids[who])!.id;
  /** Premier ticket (TKT le plus ancien) d'un membre. */
  const ticketIdOf = (tontineId: string, who: string) => s.tontineTickets.filter((tk) => tk.memberId === memberIdOf(tontineId, who) && tk.status === "ACTIVE").sort((a, b) => a.ticketNumber - b.ticketNumber)[0]!.id;

  /** Règle les obligations échues selon un scénario par membre. */
  const settle = (tontineId: string, admin: string, scenario: (who: string, periodNumber: number, isPast: boolean) => "paid" | "late" | "declared" | "rejected" | "rejected-then-paid" | "skip") => {
    const byMember = Object.entries(ids);
    const obligations = s.contributionObligations.filter((o) => o.tontineId === tontineId).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    for (const o of obligations) {
      const who = byMember.find(([, uid]) => s.tontineMembers.find((m) => m.id === o.memberId)?.userId === uid)![0];
      const period = s.contributionPeriods.find((p) => p.id === o.periodId)!;
      const isPast = o.dueDate < T;
      const action = scenario(who, period.periodNumber, isPast);
      if (action === "skip" || action === "late") continue;
      const payDate = isPast ? addDays(o.dueDate, -Math.floor(random() * 3)) : T;
      const method = methods[Math.floor(random() * methods.length)]!;
      const ref = method === "MOBILE_MONEY" ? `MM${Math.floor(100000 + random() * 899999)}` : "";
      const declare = (d: string) => declarePayment(c(who, d, 9), { obligationId: o.id, amount: o.expectedAmount, paymentDate: d, paymentMethod: method, reference: ref, comment: "" });
      const pid = declare(payDate);
      if (action === "declared") continue;
      const nextDay = addDays(payDate, 1);
      const reviewDate = isPast && nextDay <= T ? nextDay : T;
      if (action === "rejected" || action === "rejected-then-paid") {
        rejectPayment(c(admin, reviewDate, 18), { paymentId: pid, reason: "Montant non reçu sur le compte Mobile Money. Merci de vérifier la référence." });
        if (action === "rejected") continue;
        const pid2 = declare(reviewDate);
        validatePayment(c(admin, reviewDate, 20), pid2);
        continue;
      }
      validatePayment(c(admin, reviewDate, 19), pid);
    }
  };

  // 1. Tontine Famille — Ahmed admin, hebdomadaire, active depuis 6 semaines.
  const famille = createTontine(c("ahmed", addDays(T, -50)), {
    name: "Tontine Famille",
    description: "La tontine de la grande famille Traoré. Cotisation chaque samedi, remise de la cagnotte le jour même.",
    contributionAmount: 10_000,
    frequency: "WEEKLY",
    startDate: addDays(T, -40),
    expectedMemberCount: 8,
    rotationMode: "MANUAL",
  });
  for (const [i, who] of ["mariam", "koffi", "awa", "ibrahim", "fatou", "seydou", "aminata"].entries()) invite("ahmed", famille, who, addDays(T, -49 + i));
  reorderRotation(c("ahmed", addDays(T, -42)), { tontineId: famille, ticketIds: ["mariam", "ahmed", "awa", "koffi", "fatou", "ibrahim", "aminata", "seydou"].map((w) => ticketIdOf(famille, w)) });
  changeTontineStatus(c("ahmed", addDays(T, -41)), famille, "activate");

  // 2. Épargne Bureau — Ahmed admin, mensuelle.
  const bureau = createTontine(c("ahmed", addDays(T, -100)), {
    name: "Épargne Bureau",
    description: "Tontine entre collègues du service comptabilité.",
    contributionAmount: 50_000,
    frequency: "MONTHLY",
    startDate: addDays(T, -85),
    expectedMemberCount: 6,
    rotationMode: "MANUAL",
  });
  for (const [i, who] of ["koffi", "yao", "kadi", "aminata", "ibrahim"].entries()) invite("ahmed", bureau, who, addDays(T, -98 + i));
  changeTontineStatus(c("ahmed", addDays(T, -90)), bureau, "activate");

  // 3. Tontine des Amies — Mariam admin, deux fois par semaine (mardi, vendredi). Ahmed membre.
  const amies = createTontine(c("mariam", addDays(T, -30)), {
    name: "Tontine des Amies",
    description: "Petite tontine du mardi et du vendredi.",
    contributionAmount: 5_000,
    frequency: "TWICE_WEEKLY",
    weekday1: 2,
    weekday2: 5,
    startDate: addDays(T, -21),
    expectedMemberCount: 10,
    rotationMode: "MANUAL",
  });
  for (const [i, who] of ["ahmed", "awa", "fatou", "kadi", "aminata"].entries()) invite("mariam", amies, who, addDays(T, -29 + i));
  changeTontineStatus(c("mariam", addDays(T, -22)), amies, "activate");

  // 4. Projet Tabaski 2027 — Ahmed admin, brouillon (démarrage dans 2 semaines).
  const tabaski = createTontine(c("ahmed", addDays(T, -5)), {
    name: "Projet Tabaski 2027",
    description: "On prépare la fête ensemble : 12 mois, 12 bénéficiaires.",
    contributionAmount: 25_000,
    frequency: "MONTHLY",
    startDate: addDays(T, 15),
    expectedMemberCount: 12,
    rotationMode: "MANUAL",
    multipleTicketsAllowed: true,
    maxTicketsPerMember: 3,
  });
  invite("ahmed", tabaski, "mariam", addDays(T, -4));
  // Tickets multiples : Ahmed (admin) et Mariam détiennent chacun 2 tickets avant le démarrage.
  createTicket(c("ahmed", addDays(T, -4)), { tontineId: tabaski, memberId: memberIdOf(tabaski, "ahmed") });
  createTicket(c("ahmed", addDays(T, -4)), { tontineId: tabaski, memberId: memberIdOf(tabaski, "mariam") });
  createInvitation(c("ahmed", addDays(T, -3)), { tontineId: tabaski, email: "seydou@koti.demo", phone: null });
  createInvitation(c("ahmed", addDays(T, -1)), { tontineId: tabaski, email: "nouveau.membre@exemple.ci", phone: null });
  createInvitation(c("ahmed", addDays(T, -2)), { tontineId: tabaski, email: null, phone: "+2250799887766" });

  // 5. Association Riviera — Koffi admin, invitation en attente pour Ahmed.
  const riviera = createTontine(c("koffi", addDays(T, -60)), {
    name: "Association Quartier Riviera",
    description: "Tontine de l'association des résidents.",
    contributionAmount: 20_000,
    frequency: "MONTHLY",
    startDate: addDays(T, -45),
    expectedMemberCount: 5,
    rotationMode: "MANUAL",
  });
  for (const who of ["yao", "seydou"]) invite("koffi", riviera, who, addDays(T, -58));
  changeTontineStatus(c("koffi", addDays(T, -50)), riviera, "activate");

  // 6. Collègues Plateau — Yao admin, Ahmed membre, suspendue.
  const plateau = createTontine(c("yao", addDays(T, -80)), {
    name: "Collègues Plateau",
    description: "Suspendue pendant les congés.",
    contributionAmount: 15_000,
    frequency: "WEEKLY",
    startDate: addDays(T, -70),
    expectedMemberCount: 4,
    rotationMode: "MANUAL",
  });
  for (const who of ["ahmed", "kadi", "ibrahim"]) invite("yao", plateau, who, addDays(T, -79));
  changeTontineStatus(c("yao", addDays(T, -72)), plateau, "activate");

  // Activité fictive de la plateforme (clients, offres, tontines) : désactivée dans les tests unitaires, sauf demande explicite.
  const withPlatform = process.env.NODE_ENV !== "test" || process.env.KOTI_SEED_PLATFORM === "1";
  const platformEnv = { s, today: T, hash, at, random: rng(1337), operatorId: ids.operateur!, supportId: ids.support! };
  let platform: PlatformSeedResult | null = null;
  if (withPlatform) platform = seedPlatformStructure(platformEnv);

  // Génération des échéances jusqu'à aujourd'hui (horloge = maintenant), sans rappels à ce stade.
  for (const t of s.tontines) ensureObligations(s, { userId: "system", now }, t);

  settle(famille, "ahmed", (who, n, past) => {
    if (!past) return who === "mariam" || who === "fatou" ? "declared" : "skip";
    if (who === "ibrahim" && n >= 5) return "late";
    if (who === "seydou" && n === 3) return "rejected-then-paid";
    if (who === "fatou" && n === 6) return "declared";
    if (who === "koffi" && n === 6) return "rejected";
    return "paid";
  });
  settle(bureau, "ahmed", (who, _n, past) => (past ? (who === "kadi" ? "declared" : "paid") : "skip"));
  settle(amies, "mariam", (who, n, past) => {
    if (!past) return "skip";
    if (who === "ahmed" && n === 6) return "late";
    if (who === "ahmed" && n === 5) return "rejected";
    if (who === "awa" && n >= 5) return "late";
    return "paid";
  });
  settle(riviera, "koffi", (_w, _n, past) => (past ? "paid" : "skip"));
  // Seydou quitte l'association : son futur tour est libéré, ce qui permet d'inviter Ahmed à le reprendre
  // (une fois la tontine démarrée, le nombre de tours est figé : on ne peut que reprendre une place libérée).
  removeMember(c("koffi", addDays(T, -2)), { tontineId: riviera, memberId: memberIdOf(riviera, "seydou"), reason: "Départ de l'association" });
  createInvitation(c("koffi", addDays(T, -1)), { tontineId: riviera, email: "ahmed@koti.demo", phone: null });
  settle(plateau, "yao", (who, _n, past) => (past ? (who === "kadi" ? "late" : "paid") : "skip"));
  changeTontineStatus(c("yao", addDays(T, -3)), plateau, "pause");
  if (platform) seedPlatformActivity(platformEnv, platform);

  // Rappels et alertes (idempotents) à la date du jour.
  runScheduledJobs(now, { force: true });

  // Quelques notifications déjà lues pour un rendu réaliste.
  for (const n of s.notifications) if (n.createdAt < at(addDays(T, -7)).toISOString()) n.readAt = n.createdAt;
}
