"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth/session";
import { allowDemoReset } from "@/lib/demo";
import { changePasswordSchema, idSchema, profileSchema, reorderRotationSchema } from "@/lib/validations";
import { resetDemoData } from "@/server/db/ready";
import { authed } from "./_shared";
import { changePassword, markAllRead, markRead, reorderRotation, updateProfile } from "@/server/pg/services";

export async function reorderRotationAction(raw: unknown) {
  return authed(reorderRotationSchema, raw, async (input, ctx) => {
    (await reorderRotation(ctx, input));
    revalidatePath(`/tontines/${input.tontineId}`, "layout");
  });
}

export async function markNotificationReadAction(raw: unknown) {
  return authed(z.object({ id: idSchema }), raw, async (input, ctx) => {
    (await markRead(ctx, input.id));
    revalidatePath("/", "layout");
  });
}

export async function markAllNotificationsReadAction() {
  return authed(z.object({}), {}, async (_input, ctx) => {
    (await markAllRead(ctx));
    revalidatePath("/", "layout");
  });
}

export async function updateProfileAction(raw: unknown) {
  return authed(profileSchema, raw, async (input, ctx) => {
    (await updateProfile(ctx, input));
    revalidatePath("/", "layout");
  });
}

export async function changePasswordAction(raw: unknown) {
  const result = await authed(changePasswordSchema, raw, async (input, ctx) => {
    (await changePassword(ctx, input));
    return ctx.userId;
  });
  // Toutes les sessions ont été révoquées : on en recrée une pour l'appareil courant.
  if (result.ok) await createSession(result.data);
  return result.ok ? { ok: true as const, data: undefined } : result;
}

/** Réinitialise le jeu de démonstration (désactivé en production). */
export async function resetDemoAction() {
  if (!allowDemoReset()) return { ok: false as const, error: "La réinitialisation est désactivée sur cette instance." };
  const result = await authed(z.object({}), {}, async () => resetDemoData());
  if (!result.ok) return result;
  await destroySession();
  redirect("/login?reset=1");
}
