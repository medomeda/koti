import "server-only";
import { addDays } from "@/lib/utils/dates";
import { addClientNote, grantTrial, suspendUser } from "@/modules/admin/admin.service";
import { changePlan, runBilling } from "@/modules/billing/billing.service";
import { acceptInvitation, createInvitation } from "@/modules/invitations/invitation.service";
import { declarePayment, validatePayment } from "@/modules/payments/payment.service";
import { createTicket } from "@/modules/tickets/ticket.service";
import { changeTontineStatus, createTontine } from "@/modules/tontines/tontine.service";
import { registerUser } from "@/modules/users/user.service";
import type { Ctx } from "@/server/context";
import type { ContactTopic, Frequency, PaymentMethod, PlanId } from "@/types/domain";
import type { DbState } from "./store";

/**
 * Activité fictive de la PLATEFORME (étape 3 du chantier SaaS) : une soixantaine de clients inscrits
 * sur 12 mois, leurs offres, leurs tontines, des paiements validés, des factures, des messages de contact.
 * Comme le reste de la démo, tout est produit en REJOUANT les vraies opérations métier sur une horloge simulée.
 */
export interface PlatformSeedEnv {
  s: DbState;
  today: string;
  hash: string;
  at: (date: string, hour?: number) => Date;
  random: () => number;
  /** Identifiants des comptes de l'équipe KOTI (pour signer les actions d'administration). */
  operatorId: string;
  supportId: string;
}

const FIRST = ["Adama", "Salimata", "Moussa", "Mariama", "Ousmane", "Kadiatou", "Brice", "Estelle", "Jean-Marc", "Nadège", "Sékou", "Christelle", "Désiré", "Affoué", "Yacouba", "Pélagie", "Lassina", "Habiba", "Franck", "Rosine", "Souleymane", "Odette", "Aboubacar", "Clémence", "Emmanuel", "Tanoh", "Marie-Laure"];
const LAST = ["Koné", "Diabaté", "Yao", "Kouadio", "Bamba", "Soro", "Cissé", "Traoré", "N'Dri", "Ouédraogo", "Sylla", "Doumbia", "Konaté", "Gnagne", "Fofana", "Tiémoko", "Aka", "Zadi", "Brou", "Coulibaly"];
const PREFIX = ["Tontine", "Épargne", "Cercle", "Caisse", "Association"];
const SUFFIX = ["des Amis", "du Quartier", "Solidaire", "des Collègues", "Famille", "du Marché", "Entraide", "du Dimanche", "Prospérité", "Espoir", "de l'Église", "des Mamans"];
const slug = (v: string) => v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z]+/g, "");

const pick = <T,>(arr: T[], r: () => number) => arr[Math.floor(r() * arr.length)]!;
const between = (min: number, max: number, r: () => number) => min + Math.floor(r() * (max - min + 1));

export interface PlatformSeedResult {
  /** Tontines démarrées à « régler » (paiements validés) après la génération des échéances. */
  settle: Array<{ tontineId: string; adminId: string; payRate: number }>;
  clientIds: string[];
  organizerIds: string[];
}

/** Phase A : comptes, offres, tontines, invitations, tickets, démarrages. Avant la génération des échéances. */
export function seedPlatformStructure(env: PlatformSeedEnv): PlatformSeedResult {
  const { s, today: T, hash, at, random: r } = env;
  const c = (userId: string, date: string, hour = 10): Ctx => ({ userId, now: at(date, hour) });
  const N = 54;

  // 1. Comptes répartis sur 12 mois, plus nombreux ces derniers mois (croissance).
  const people = Array.from({ length: N }, (_, i) => {
    const daysAgo = Math.max(4, Math.floor(350 * Math.pow(r(), 1.5)));
    const first = FIRST[i % FIRST.length]!;
    const last = LAST[(i * 7 + 3) % LAST.length]!;
    return { i, daysAgo, first, last };
  }).sort((a, b) => b.daysAgo - a.daysAgo);

  const users = people.map((p, k) => {
    const signup = addDays(T, -p.daysAgo);
    const id = registerUser(s, {
      fullName: `${p.first} ${p.last}`,
      email: `${slug(p.first)}.${slug(p.last)}${p.i}@exemple.ci`,
      phone: `+2250799${String(100000 + k).slice(-6)}`,
      password: "",
      passwordHash: hash,
      now: at(signup, 8 + (k % 9)),
    });
    s.users.find((u) => u.id === id)!.emailVerified = true;
    return { id, signup, daysAgo: p.daysAgo, k };
  });

  // 2. Organisateurs : plus probable pour les comptes anciens.
  const organizers = users.filter((u) => r() < (u.daysAgo > 40 ? 0.7 : 0.25));
  const settle: PlatformSeedResult["settle"] = [];
  let downgraded = 0;

  for (const o of organizers) {
    const roll = r();
    let plan: PlanId = roll < 0.55 ? "FREE" : roll < 0.88 ? "PRO" : "ASSOCIATION";
    // Parcours réalistes : certains n'iront jamais jusqu'au démarrage, d'autres démarrent sans qu'un paiement soit validé.
    const abandons = r() < 0.25;
    const noPay = r() < 0.15;
    const willDowngrade = plan === "PRO" && o.daysAgo > 170 && downgraded < 4 && r() < 0.5;
    if (willDowngrade) downgraded++;
    if (plan !== "FREE") {
      const upgradeDate = addDays(o.signup, between(1, 12, r));
      if (upgradeDate <= T) changePlan(c(o.id, upgradeDate, 11), plan);
      else plan = "FREE";
    }
    const count = plan === "FREE" || willDowngrade ? 1 : between(1, 3, r);
    for (let k = 0; k < count; k++) {
      const createDate = addDays(o.signup, 2 + k * 22 + between(0, 9, r));
      if (createDate > addDays(T, -4)) continue;
      const startDate = addDays(createDate, between(8, 16, r));
      const frequency: Frequency = r() < 0.7 || startDate < addDays(T, -100) ? "MONTHLY" : "WEEKLY";
      const expected = plan === "FREE" ? between(4, 8, r) : plan === "PRO" ? between(5, 10, r) : between(8, 12, r);
      const multiple = plan !== "FREE" && !willDowngrade && r() < 0.35;
      const tontineId = createTontine(c(o.id, createDate, 9), {
        name: `${pick(PREFIX, r)} ${pick(SUFFIX, r)}`,
        description: "",
        contributionAmount: pick([5000, 10000, 10000, 20000, 25000, 50000], r),
        frequency,
        startDate,
        expectedMemberCount: expected,
        rotationMode: "MANUAL",
        multipleTicketsAllowed: multiple,
        maxTicketsPerMember: multiple ? 2 : 1,
      });

      // Invitations acceptées par des comptes déjà inscrits.
      const pool = users.filter((u) => u.id !== o.id && u.signup <= addDays(createDate, 1));
      const wanted = Math.min(between(2, 5, r), expected - 1, pool.length);
      const chosen = new Set<string>();
      while (chosen.size < wanted) chosen.add(pick(pool, r).id);
      for (const memberId of chosen) {
        const inviteDate = addDays(createDate, 1);
        const acceptDate = addDays(inviteDate, between(0, 2, r));
        const { token } = createInvitation(c(o.id, inviteDate, 10), { tontineId, email: s.users.find((u) => u.id === memberId)!.email, phone: null });
        acceptInvitation(c(memberId, acceptDate > T ? T : acceptDate, 15), { token });
      }
      if (multiple && r() < 0.7) {
        const adminMember = s.tontineMembers.find((m) => m.tontineId === tontineId && m.userId === o.id)!.id;
        createTicket(c(o.id, addDays(createDate, 2), 10), { tontineId, memberId: adminMember });
      }
      if (!abandons && startDate <= addDays(T, -5) && r() < 0.9) {
        changeTontineStatus(c(o.id, addDays(startDate, -1), 12), tontineId, "activate");
        if (!noPay) settle.push({ tontineId, adminId: o.id, payRate: 0.55 + 0.4 * r() });
      }
    }
    if (willDowngrade) {
      const downDate = addDays(o.signup, between(95, 125, r));
      if (downDate < T) {
        runBilling(s, at(addDays(downDate, -1), 10)); // émet les factures de la période payante avant le retour au gratuit
        changePlan(c(o.id, downDate, 10), "FREE");
      }
    }
  }
  return { settle, clientIds: users.map((u) => u.id), organizerIds: organizers.map((o) => o.id) };
}

const METHODS: PaymentMethod[] = ["MOBILE_MONEY", "MOBILE_MONEY", "CASH", "BANK_TRANSFER"];

/** Phase B : paiements validés, suspensions, notes internes, essai offert, messages de contact. Après les échéances. */
export function seedPlatformActivity(env: PlatformSeedEnv, res: PlatformSeedResult) {
  const { s, today: T, at, random: r } = env;
  const c = (userId: string, date: string, hour = 10): Ctx => ({ userId, now: at(date, hour) });

  // Paiements : la plupart des échéances échues sont déclarées puis validées, certaines restent en retard.
  for (const t of res.settle) {
    const obligations = s.contributionObligations.filter((o) => o.tontineId === t.tontineId && o.dueDate < T).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    for (const o of obligations) {
      if (r() > t.payRate) continue;
      const member = s.tontineMembers.find((m) => m.id === o.memberId);
      if (!member || member.status !== "ACTIVE") continue;
      const payDate = addDays(o.dueDate, -between(0, 2, r));
      const pid = declarePayment(c(member.userId, payDate, 9), { obligationId: o.id, amount: o.expectedAmount, paymentDate: payDate, paymentMethod: pick(METHODS, r), reference: "", comment: "" });
      validatePayment(c(t.adminId, addDays(payDate, 1) <= T ? addDays(payDate, 1) : T, 18), pid);
    }
  }

  // Essai offert par l'équipe à un client gratuit (se termine dans environ un jour : alerte du tableau de bord).
  const freeOrganizer = res.organizerIds.find((id) => s.subscriptions.find((x) => x.userId === id)?.planId === "FREE" && s.tontines.filter((t) => t.creatorId === id).length === 1 && !s.subscriptions.find((x) => x.userId === id)!.trialUsed);
  if (freeOrganizer) grantTrial(c(env.operatorId, addDays(T, -29), 10), { userId: freeOrganizer, planId: "PRO", days: 30, reason: "Geste commercial après un échange avec le client." });

  // Suspensions (comptes qui ne sont pas organisateurs actifs) et notes internes.
  const suspendable = res.clientIds.filter((id) => !res.organizerIds.includes(id));
  for (const [i, id] of suspendable.slice(0, 2).entries()) {
    suspendUser(c(env.operatorId, addDays(T, -(20 + i * 17)), 14), { userId: id, reason: i === 0 ? "Plusieurs signalements de messages abusifs." : "Compte en doublon : demande du titulaire." });
  }
  const noted = res.organizerIds.slice(0, 6);
  const NOTES = ["Premier contact par téléphone : très motivé, gère déjà deux tontines en dehors de KOTI.", "Demande une offre pour son association (environ 60 personnes).", "A signalé une confusion sur les tickets multiples : à surveiller.", "Intéressé par les rappels SMS dès leur lancement.", "Relance de facture non nécessaire : paiement mobile reçu (simulation).", "Souhaite une démonstration pour son quartier."];
  noted.forEach((id, i) => addClientNote(c(i % 2 === 0 ? env.supportId : env.operatorId, addDays(T, -(5 + i * 9)), 16), { userId: id, text: NOTES[i % NOTES.length]! }));

  // Messages de contact du site : étalés sur l'année, les plus anciens sont déjà traités.
  const CONTACTS: Array<[string, ContactTopic, string]> = [
    ["Aïcha Bamba", "QUESTION", "Bonjour, KOTI fonctionne-t-il avec Orange Money ? Je voudrais suivre la tontine de mon quartier."],
    ["Paul Gnagne", "DEMO", "Nous sommes une association de 40 personnes. Pouvez-vous nous faire une démonstration ?"],
    ["Fatoumata Diallo", "SUPPORT", "Je n'arrive pas à rejoindre la tontine : mon lien d'invitation affiche une erreur."],
    ["Kouamé Yao", "QUESTION", "Peut-on avoir plusieurs tickets dans la même tontine ?"],
    ["Mariam Sylla", "PARTNERSHIP", "Nous sommes une coopérative d'épargne à Bouaké, intéressés par un partenariat."],
    ["Joseph Aka", "QUESTION", "Quelle différence entre l'offre Organisateur et Association ?"],
    ["Nadia Konaté", "DEMO", "Pouvez-vous présenter KOTI à notre groupe WhatsApp samedi ?"],
    ["Ibrahim Fofana", "SUPPORT", "J'ai oublié mon mot de passe et l'e-mail de réinitialisation n'arrive pas."],
    ["Rose Zadi", "OTHER", "Bravo pour l'application ! Une suggestion : exporter l'historique en PDF."],
    ["Yves Brou", "QUESTION", "Les données sont-elles sauvegardées ? Qui peut voir mes paiements ?"],
    ["Awa Tiémoko", "DEMO", "Tontine de 12 collègues, nous souhaitons essayer avant de choisir une offre."],
    ["Daouda Ouédraogo", "SUPPORT", "Mon organisateur dit avoir validé mon paiement mais je vois encore « en attente »."],
    ["Estelle Coulibaly", "QUESTION", "Peut-on changer l'ordre des tours après le démarrage ?"],
    ["Serge N'Dri", "PARTNERSHIP", "Nous éditons une application de Mobile Money et voudrions discuter d'une intégration."],
  ];
  CONTACTS.forEach(([name, topic, message], i) => {
    const daysAgo = Math.round(330 - i * (320 / CONTACTS.length) + r() * 6);
    s.contactRequests.push({
      id: crypto.randomUUID(),
      name,
      email: `${slug(name)}@exemple.ci`,
      phone: "",
      topic,
      message,
      status: i < CONTACTS.length - 4 ? "HANDLED" : "NEW",
      createdAt: at(addDays(T, -Math.max(1, daysAgo)), 9 + (i % 8)).toISOString(),
    });
  });
}
