"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { declarePaymentSchema, idSchema, rejectPaymentSchema } from "@/lib/validations";
import { declarePayment, getObligationHistory, rejectPayment, validatePayment } from "@/modules/payments/payment.service";
import { authed } from "./_shared";

export async function declarePaymentAction(raw: unknown) {
  return authed(declarePaymentSchema, raw, (input, ctx) => {
    const id = declarePayment(ctx, input);
    revalidatePath("/", "layout");
    return { id };
  });
}

export async function validatePaymentAction(raw: unknown) {
  return authed(z.object({ paymentId: idSchema }), raw, (input, ctx) => {
    validatePayment(ctx, input.paymentId);
    revalidatePath("/", "layout");
  });
}

export async function rejectPaymentAction(raw: unknown) {
  return authed(rejectPaymentSchema, raw, (input, ctx) => {
    rejectPayment(ctx, input);
    revalidatePath("/", "layout");
  });
}

export async function obligationHistoryAction(raw: unknown) {
  return authed(z.object({ obligationId: idSchema }), raw, (input, ctx) => getObligationHistory(ctx, input.obligationId));
}
