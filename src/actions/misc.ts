"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { getAuth } from "@/server/auth";
import { allowDemoReset } from "@/lib/demo";
import { changePasswordSchema, idSchema, profileSchema, reorderRotationSchema } from "@/lib/validations";
import { resetDemoData } from "@/server/db/ready";
import { AppError } from "@/server/errors";
import { authed } from "./_shared";
import { markAllRead, markRead, reorderRotation, updateProfile } from "@/server/pg/services";

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
  return authed(changePasswordSchema, raw, async (input) => {
    try {
      // Les autres sessions sont fermées ; celle de cet appareil est renouvelée par Better Auth.
      await getAuth().api.changePassword({ body: { currentPassword: input.currentPassword, newPassword: input.newPassword, revokeOtherSessions: true }, headers: await headers() });
    } catch (err) {
      if (err instanceof APIError) throw new AppError("VALIDATION", "Mot de passe actuel incorrect.", { currentPassword: "Mot de passe incorrect." });
      throw err;
    }
  });
}

/** Réinitialise le jeu de démonstration (désactivé en production). */
export async function resetDemoAction() {
  if (!allowDemoReset()) return { ok: false as const, error: "La réinitialisation est désactivée sur cette instance." };
  const result = await authed(z.object({}), {}, async () => resetDemoData());
  if (!result.ok) return result;
  await getAuth().api.signOut({ headers: await headers() }).catch(() => undefined);
  redirect("/login?reset=1");
}
