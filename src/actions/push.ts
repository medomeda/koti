"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { ALL_CATEGORIES, removePushSubscription, savePushSubscription, sendTestPush, setPushCategories } from "@/modules/push/push.service";
import { authed } from "./_shared";

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).startsWith("https://", "Point d'accès invalide."),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
});

/** Enregistre l'appareil courant (après que l'utilisateur a accepté la demande d'autorisation du navigateur). */
export async function savePushSubscriptionAction(raw: unknown) {
  return authed(subscriptionSchema, raw, async (input, ctx) => {
    await savePushSubscription(ctx, input, (await headers()).get("user-agent"));
  });
}

export async function removePushSubscriptionAction(raw: unknown) {
  return authed(z.object({ endpoint: z.string().url().max(1000) }), raw, async (input, ctx) => {
    await removePushSubscription(ctx, input.endpoint);
  });
}

export async function setPushCategoriesAction(raw: unknown) {
  return authed(z.object({ categories: z.array(z.enum(ALL_CATEGORIES as [string, ...string[]])).max(10) }), raw, async (input, ctx) => {
    await setPushCategories(ctx, input.categories as Parameters<typeof setPushCategories>[1]);
  });
}

export async function sendTestPushAction() {
  return authed(z.object({}), {}, async (_input, ctx) => ({ sent: await sendTestPush(ctx) }));
}
