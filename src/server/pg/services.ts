import "server-only";
import * as admin from "@/modules/admin/admin.service";
import * as support from "@/modules/admin/support.service";
import * as team from "@/modules/admin/team.service";
import * as audit from "@/modules/audit/audit.service";
import * as billing from "@/modules/billing/billing.service";
import * as contact from "@/modules/leads/contact.service";
import * as invitations from "@/modules/invitations/invitation.service";
import * as members from "@/modules/members/member.service";
import * as notifications from "@/modules/notifications/notification.service";
import * as payments from "@/modules/payments/payment.service";
import * as rotations from "@/modules/rotations/rotation.service";
import * as tickets from "@/modules/tickets/ticket.service";
import * as tontines from "@/modules/tontines/tontine.service";
import { ensureObligations } from "@/modules/contributions/contribution.service";
import { runScheduledJobs as runJobs } from "@/server/jobs";
import type { Ctx } from "@/server/context";
import { getDb } from "@/server/db/client";
import { pgRead, pgTx, type Scope } from "@/server/db/uow";
import { invitationRef, tontineOfObligation, tontineOfPayment } from "@/server/db/uow/resolve";
import { reads, readsVia, writes, writesVia } from "@/server/db/uow/wrap";
import { runOnState } from "@/server/db/store";

/**
 * Façade PostgreSQL de tous les services métier (phase 2).
 * Chaque fonction exécute la logique métier existante sur les données chargées depuis PostgreSQL pour un périmètre
 * précis (voir `server/db/uow`), puis écrit la différence. L'interface passera d'un coup sur ces fonctions au
 * basculement ; les mêmes noms et les mêmes arguments, mais asynchrones.
 */

// Périmètres usuels.
const onTontine = (ctx: Ctx, tontineId: string): Scope => ({ tontines: [tontineId], people: [ctx.userId] });
const ofUser = (ctx: Ctx): Scope => ({ users: [ctx.userId] });

/* ------------------------------------------------------------------ Comptes (déjà asynchrones, sur PostgreSQL) */
export { authenticate, changePassword, signUp, updateProfile } from "@/modules/users/user.pg";

/* ------------------------------------------------------------------ Tontines */
export const createTontine = writes(tontines.createTontine, (ctx) => ofUser(ctx));
export const updateTontine = writes(tontines.updateTontine, (ctx, i) => onTontine(ctx, i.tontineId));
export const changeTontineStatus = writes(tontines.changeTontineStatus, (ctx, tontineId) => onTontine(ctx, tontineId));
export const listMyTontines = reads(tontines.listMyTontines, (ctx) => ofUser(ctx));
export const getTontineAccess = reads(tontines.getTontineAccess, (ctx, id) => onTontine(ctx, id));
export const getTontineOverview = reads(tontines.getTontineOverview, (ctx, id) => onTontine(ctx, id));

/** Rattrapage des échéances : une transaction par tontine active (verrou par tontine, idempotent). */
export async function syncUserTontines(ctx: Ctx): Promise<void> {
  const mine = await pgRead(ofUser(ctx), (s) => s.tontineMembers.filter((m) => m.userId === ctx.userId && m.status === "ACTIVE").map((m) => m.tontineId));
  for (const id of mine) {
    await pgTx(onTontine(ctx, id), (s) =>
      runOnState(s, () => {
        const t = s.tontines.find((x) => x.id === id);
        if (t?.status === "ACTIVE") ensureObligations(s, ctx, t);
      }),
    );
  }
}

/* ------------------------------------------------------------------ Membres, tickets, rotation */
export const listMembers = reads(members.listMembers, (ctx, id) => onTontine(ctx, id));
export const removeMember = writes(members.removeMember, (ctx, i) => onTontine(ctx, i.tontineId));
export const createTicket = writes(tickets.createTicket, (ctx, i) => onTontine(ctx, i.tontineId));
export const deleteTicket = writes(tickets.deleteTicket, (ctx, i) => onTontine(ctx, i.tontineId));
export const listMemberTickets = reads(tickets.listMemberTickets, (ctx, tontineId) => onTontine(ctx, tontineId));
export const listRotation = reads(rotations.listRotation, (ctx, id) => onTontine(ctx, id));
export const reorderRotation = writes(rotations.reorderRotation, (ctx, i) => onTontine(ctx, i.tontineId));

/* ------------------------------------------------------------------ Invitations */
export const createInvitation = writes(invitations.createInvitation, (ctx, i) => onTontine(ctx, i.tontineId));
export const cancelInvitation = writes(invitations.cancelInvitation, (ctx, i) => onTontine(ctx, i.tontineId));
export const listTontineInvitations = reads(invitations.listTontineInvitations, (ctx, id) => onTontine(ctx, id));
export const listMyInvitations = reads(invitations.listMyInvitations, (ctx) => ({ users: [ctx.userId], invited: true }));

/** Les opérations sur une invitation reçoivent un jeton ou un identifiant : on retrouve d'abord sa tontine. */
const ofInvitation = async (ctx: Ctx, ref: { token: string } | { invitationId: string }): Promise<Scope> => {
  const found = await invitationRef(ref);
  // Invitation inconnue : le service lève lui-même « introuvable » (périmètre minimal, rien n'est écrit).
  return found ? { tontines: [found.tontineId], people: [ctx.userId] } : { people: [ctx.userId] };
};
export const acceptInvitation = writesVia(invitations.acceptInvitation, ofInvitation);
export const refuseInvitation = writesVia(invitations.refuseInvitation, ofInvitation);
export const previewInvitation = readsVia(invitations.previewInvitation, async (token) => {
  const found = await invitationRef({ token });
  return found ? { tontines: [found.tontineId] } : {};
});

/* ------------------------------------------------------------------ Paiements */
const ofObligation = async (ctx: Ctx, obligationId: string): Promise<Scope> => {
  const t = await tontineOfObligation(obligationId);
  return t ? onTontine(ctx, t) : { people: [ctx.userId] };
};
const ofPayment = async (ctx: Ctx, paymentId: string): Promise<Scope> => {
  const t = await tontineOfPayment(paymentId);
  return t ? onTontine(ctx, t) : { people: [ctx.userId] };
};
export const listMyObligations = reads(payments.listMyObligations, (ctx) => ofUser(ctx));
export const listTontineObligations = reads(payments.listTontineObligations, (ctx, id) => onTontine(ctx, id));
export const getObligationHistory = readsVia(payments.getObligationHistory, (ctx, obligationId) => ofObligation(ctx, obligationId));
export const declarePayment = writesVia(payments.declarePayment, (ctx, i) => ofObligation(ctx, i.obligationId));
export const validatePayment = writesVia(payments.validatePayment, (ctx, paymentId) => ofPayment(ctx, paymentId));
export const rejectPayment = writesVia(payments.rejectPayment, (ctx, i) => ofPayment(ctx, i.paymentId));

/* ------------------------------------------------------------------ Notifications et audit */
const ofNotifications = (ctx: Ctx): Scope => ({ users: [ctx.userId], notifications: true });
export const listNotifications = reads(notifications.listNotifications, (ctx) => ofNotifications(ctx));
export const unreadCount = reads(notifications.unreadCount, (ctx) => ({ people: [ctx.userId], notifications: true }));
export const markRead = writes(notifications.markRead, (ctx) => ({ people: [ctx.userId], notifications: true }));
export const markAllRead = writes(notifications.markAllRead, (ctx) => ({ people: [ctx.userId], notifications: true }));
export const listTontineAudit = reads(audit.listTontineAudit, (ctx, tontineId) => ({ ...onTontine(ctx, tontineId), audit: true }));

/* ------------------------------------------------------------------ Abonnement */
export const changePlan = writes(billing.changePlan, (ctx) => ({ users: [ctx.userId], invoices: "all" }));
export const getAccount = reads(billing.getAccount, (ctx) => ({ users: [ctx.userId], invoices: true }));
export const getPublicPlans = reads(billing.getPublicPlans, () => ({}));

/* ------------------------------------------------------------------ Vitrine */
export const submitContactRequest = writes(contact.submitContactRequest, () => ({ contacts: true }));
export const countNewContactRequests = reads(contact.countNewContactRequests, () => ({ contacts: true }));

/* ------------------------------------------------------------------ Tâches planifiées */
export const runScheduledJobs = writes(runJobs, () => ({ everything: true }));

/* ------------------------------------------------------------------ Administration de la plateforme */
const staff = (ctx: Ctx): Scope => ({ everything: true, people: [ctx.userId] });
export const getPlatformOverview = reads(admin.getPlatformOverview, staff);
export const listClients = reads(admin.listClients, staff);
export const getClient = reads(admin.getClient, staff);
export const listAdminTontines = reads(admin.listAdminTontines, staff);
export const listPlatformSubscriptions = reads(admin.listPlatformSubscriptions, staff);
export const listContactRequests = reads(admin.listContactRequests, staff);
export const countNewMessages = reads(admin.countNewMessages, staff);
export const platformRoleOf = reads(admin.platformRoleOf, (userId) => ({ people: [userId] }));
export const listPlansAdmin = reads(admin.listPlansAdmin, staff);
export const previewPlanImpact = reads(admin.previewPlanImpact, staff);
const onClient = (ctx: Ctx, userId: string): Scope => ({ users: [userId], people: [ctx.userId], sessions: true, invoices: "all" });
export const suspendUser = writes(admin.suspendUser, (ctx, i) => onClient(ctx, i.userId));
export const reactivateUser = writes(admin.reactivateUser, (ctx, i) => onClient(ctx, i.userId));
export const changeClientPlan = writes(admin.changeClientPlan, (ctx, i) => onClient(ctx, i.userId));
export const grantTrial = writes(admin.grantTrial, (ctx, i) => onClient(ctx, i.userId));
export const addClientNote = writes(admin.addClientNote, (ctx, i) => onClient(ctx, i.userId));
export const updatePlan = writes(admin.updatePlan, staff);
export const resetPlan = writes(admin.resetPlan, staff);

export const listContactRequestsDetailed = reads(support.listContactRequestsDetailed, staff);
export const handleContactRequest = writes(support.handleContactRequest, staff);
export const reopenContactRequest = writes(support.reopenContactRequest, staff);
export const activeAnnouncements = reads(support.activeAnnouncements, () => ({ announcements: true }));
export const listAnnouncements = reads(support.listAnnouncements, staff);
export const createAnnouncement = writes(support.createAnnouncement, staff);
export const setAnnouncementActive = writes(support.setAnnouncementActive, staff);
export const listPlatformAudit = reads(support.listPlatformAudit, (ctx) => ({ everything: true, people: [ctx.userId] }));

export const listTeam = reads(team.listTeam, staff);
export const inviteStaff = writes(team.inviteStaff, staff);
export const revokeStaffInvitation = writes(team.revokeStaffInvitation, staff);
export const previewStaffInvitation = reads(team.previewStaffInvitation, () => ({ staff: true }));
export const acceptStaffInvitation = writes(team.acceptStaffInvitation, (ctx) => ({ staff: true, people: [ctx.userId] }));
export const changeStaffRole = writes(team.changeStaffRole, (ctx, i) => ({ users: [i.userId], people: [ctx.userId], sessions: true }));
export const setStaffStatus = writes(team.setStaffStatus, (ctx, i) => ({ users: [i.userId], people: [ctx.userId], sessions: true }));

export { getDb };
