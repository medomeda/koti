"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { idSchema } from "@/lib/validations";
import { authed } from "./_shared";
import { createTicket, deleteTicket } from "@/server/pg/services";

/** Attribution d'un ticket supplémentaire : tous les contrôles (droits, DRAFT, plafond) sont refaits côté serveur. */
export async function createTicketAction(raw: unknown) {
  return authed(z.object({ tontineId: idSchema, memberId: idSchema }), raw, async (input, ctx) => {
    const ticketId = (await createTicket(ctx, input));
    revalidatePath(`/tontines/${input.tontineId}`, "layout");
    return { ticketId };
  });
}

export async function deleteTicketAction(raw: unknown) {
  return authed(z.object({ tontineId: idSchema, ticketId: idSchema }), raw, async (input, ctx) => {
    (await deleteTicket(ctx, input));
    revalidatePath(`/tontines/${input.tontineId}`, "layout");
  });
}
