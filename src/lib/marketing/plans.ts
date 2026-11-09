/**
 * Offres commerciales. Source unique : le site vitrine l'affiche aujourd'hui, les quotas
 * (étape 2 du chantier SaaS) l'appliqueront côté serveur. Prix FICTIFS (version de démonstration).
 */
import type { PlanId } from "@/types/domain";

export type { PlanId };

export interface Plan {
  id: PlanId;
  name: string;
  /** Prix mensuel en FCFA (0 = gratuit). */
  monthlyPrice: number;
  tagline: string;
  limits: { tontines: number; membersPerTontine: number; ticketsPerTontine: number; multipleTickets: boolean };
  /** `requires` : la ligne ne s'affiche que si la limite correspondante est activée dans l'offre. */
  features: Array<{ label: string; soon?: boolean; requires?: "multipleTickets" }>;
  highlighted?: boolean;
  cta: string;
}

export const PLANS: Plan[] = [
  {
    id: "FREE",
    name: "Découverte",
    monthlyPrice: 0,
    tagline: "Pour lancer une première tontine entre proches.",
    limits: { tontines: 1, membersPerTontine: 10, ticketsPerTontine: 10, multipleTickets: false },
    features: [{ label: "Suivi des cotisations et validation des paiements" }, { label: "Ordre des tours de main" }, { label: "Invitations par lien" }, { label: "Application installable sur téléphone" }, { label: "Tickets multiples : plusieurs parts par membre", requires: "multipleTickets" }],
    cta: "Commencer gratuitement",
  },
  {
    id: "PRO",
    name: "Organisateur",
    monthlyPrice: 5000,
    tagline: "Pour celles et ceux qui animent plusieurs tontines.",
    limits: { tontines: 5, membersPerTontine: 50, ticketsPerTontine: 100, multipleTickets: true },
    features: [
      { label: "Tout ce que contient Découverte" },
      { label: "Tickets multiples : plusieurs parts par membre", requires: "multipleTickets" },
      { label: "Rappels automatiques par e-mail et SMS", soon: true },
      { label: "Justificatifs de paiement", soon: true },
    ],
    highlighted: true,
    cta: "Essayer l'offre Organisateur",
  },
  {
    id: "ASSOCIATION",
    name: "Association",
    monthlyPrice: 15000,
    tagline: "Pour les grands groupes et les associations de quartier.",
    limits: { tontines: 25, membersPerTontine: 200, ticketsPerTontine: 400, multipleTickets: true },
    features: [{ label: "Tout ce que contient Organisateur" }, { label: "Support prioritaire" }, { label: "Accompagnement à la prise en main" }],
    cta: "Parler à l'équipe",
  },
];

export const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "KOTI garde-t-il l'argent des cotisations ?",
    a: "Non. KOTI ne reçoit, ne conserve et ne transfère aucun fonds. Les membres paient comme d'habitude (espèces, Mobile Money, virement) puis déclarent leur paiement dans KOTI. L'organisateur le vérifie et le valide.",
  },
  {
    q: "Qui peut voir les paiements de la tontine ?",
    a: "L'organisateur voit les paiements de tous les membres de sa tontine. Chaque membre ne voit que ses propres cotisations. Une tontine est un espace indépendant : personne n'a accès à celles des autres.",
  },
  {
    q: "Un membre peut-il avoir plusieurs parts dans la même tontine ?",
    a: "Oui, avec l'offre Organisateur. L'organisateur attribue des tickets avant le démarrage. Chaque ticket cotise à chaque échéance et reçoit son propre tour de main. Le nombre de tickets est figé au démarrage.",
  },
  {
    q: "Mes membres doivent-ils créer un compte ?",
    a: "Oui, c'est gratuit pour eux. Vous les invitez par un lien personnel (envoyé par WhatsApp, SMS ou e-mail) et ils créent leur compte en quelques secondes. Seul l'organisateur choisit une offre.",
  },
  {
    q: "Puis-je l'utiliser sur mon téléphone ?",
    a: "Oui. KOTI s'installe sur l'écran d'accueil comme une application, sur Android et sur iPhone, et reste léger à l'usage.",
  },
  {
    q: "Que se passe-t-il si un membre quitte la tontine ?",
    a: "Son historique de paiements est conservé. Ses échéances à venir non payées sont retirées et ses tours de main à venir sont libérés. L'organisateur peut inviter quelqu'un pour reprendre la place.",
  },
  {
    q: "Comment payer une offre payante ?",
    a: "L'offre Découverte est gratuite. Pour une offre payante, contactez-nous : l'équipe KOTI vous indique comment régler (Mobile Money ou virement) et active votre offre dès réception du paiement. Le paiement en ligne arrivera plus tard.",
  },
];
