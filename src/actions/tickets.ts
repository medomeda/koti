"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { idSchema } from "@/lib/validations";
import { createTicket, deleteTicket } from "@/modules/tickets/ticket.service";
import { authed } from "./_shared";

/** Attribution d'un ticket supplémentaire : tous les contrôles (droits, DRAFT, plafond) sont refaits côté serveur. */
export async function createTicketAction(raw: unknown) {
  return authed(z.object({ tontineId: idSchema, memberId: idSchema }), raw, (input, ctx) => {
    const ticketId = createTicket(ctx, input);
    revalidatePath(`/tontines/${input.tontineId}`, "layout");
    return { ticketId };
  });
}

export async function deleteTicketAction(raw: unknown) {
  return authed(z.object({ tontineId: idSchema, ticketId: idSchema }), raw, (input, ctx) => {
    deleteTicket(ctx, input);
    revalidatePath(`/tontines/${input.tontineId}`, "layout");
  });
}
