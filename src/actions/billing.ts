"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { changePlan } from "@/modules/billing/billing.service";
import { authed } from "./_shared";

/** Changement d'offre (simulé). Les quotas, l'usage et le premier essai sont revérifiés côté serveur. */
export async function changePlanAction(raw: unknown) {
  return authed(z.object({ planId: z.enum(["FREE", "PRO", "ASSOCIATION"]) }), raw, (input, ctx) => {
    changePlan(ctx, input.planId);
    revalidatePath("/", "layout");
  });
}
