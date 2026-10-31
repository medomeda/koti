import { NextResponse } from "next/server";
import "@/server/bootstrap";
import { isDemoMode } from "@/lib/demo";
import { hasAdminSecret } from "@/server/admin-secret";
import { resetDatabase } from "@/server/db/store";

/**
 * Réinitialisation du jeu de démonstration par le porteur de projet (pas par les testeurs).
 * Usage : curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<domaine>/api/v1/demo/reset
 * Toutes les sessions sont invalidées : les testeurs devront se reconnecter.
 */
export async function POST(req: Request) {
  if (!isDemoMode() || !hasAdminSecret(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  resetDatabase();
  return NextResponse.json({ ok: true, resetAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
