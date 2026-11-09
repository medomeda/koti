import { NextResponse } from "next/server";
import { checkDatabase } from "@/server/db/health";

/** Sonde de disponibilité : 503 si la base de données est injoignable (la sonde /api/health ne vérifie que le processus). */
export async function GET() {
  const db = await checkDatabase();
  return NextResponse.json({ status: db.ok ? "ok" : "database_unavailable" }, { status: db.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
