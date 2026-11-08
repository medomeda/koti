"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { idSchema, tontineFormSchema, tontineUpdateSchema } from "@/lib/validations";
import { authed } from "./_shared";
import { changeTontineStatus, createTontine, updateTontine } from "@/server/pg/services";

export async function createTontineAction(raw: unknown) {
  return authed(tontineFormSchema, raw, async (input, ctx) => {
    const id = (await createTontine(ctx, input));
    revalidatePath("/", "layout");
    return { id };
  });
}

const updateWithFinancial = tontineUpdateSchema.extend({ financial: tontineFormSchema.optional() });

export async function updateTontineAction(raw: unknown) {
  return authed(updateWithFinancial, raw, async (input, ctx) => {
    (await updateTontine(ctx, input));
    revalidatePath(`/tontines/${input.tontineId}`, "layout");
  });
}

const transitionSchema = z.object({
  tontineId: idSchema,
  transition: z.enum(["activate", "pause", "resume", "close"]),
  reason: z.string().trim().max(300).optional(),
});

export async function changeTontineStatusAction(raw: unknown) {
  return authed(transitionSchema, raw, async (input, ctx) => {
    (await changeTontineStatus(ctx, input.tontineId, input.transition, input.reason));
    revalidatePath("/", "layout");
  });
}
