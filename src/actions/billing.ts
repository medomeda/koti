"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authed } from "./_shared";
import { changePlan } from "@/server/pg/services";

/** Changement d'offre (simulé). Les quotas, l'usage et le premier essai sont revérifiés côté serveur. */
export async function changePlanAction(raw: unknown) {
  return authed(z.object({ planId: z.enum(["FREE", "PRO", "ASSOCIATION"]) }), raw, async (input, ctx) => {
    (await changePlan(ctx, input.planId));
    revalidatePath("/", "layout");
  });
}
