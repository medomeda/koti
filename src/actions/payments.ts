"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { declarePaymentSchema, idSchema, rejectPaymentSchema } from "@/lib/validations";
import { authed } from "./_shared";
import { declarePayment, getObligationHistory, rejectPayment, validatePayment } from "@/server/pg/services";

export async function declarePaymentAction(raw: unknown) {
  return authed(declarePaymentSchema, raw, async (input, ctx) => {
    const id = (await declarePayment(ctx, input));
    revalidatePath("/", "layout");
    return { id };
  });
}

export async function validatePaymentAction(raw: unknown) {
  return authed(z.object({ paymentId: idSchema }), raw, async (input, ctx) => {
    (await validatePayment(ctx, input.paymentId));
    revalidatePath("/", "layout");
  });
}

export async function rejectPaymentAction(raw: unknown) {
  return authed(rejectPaymentSchema, raw, async (input, ctx) => {
    (await rejectPayment(ctx, input));
    revalidatePath("/", "layout");
  });
}

export async function obligationHistoryAction(raw: unknown) {
  return authed(z.object({ obligationId: idSchema }), raw, async (input, ctx) => (await getObligationHistory(ctx, input.obligationId)));
}
