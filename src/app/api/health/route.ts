import { NextResponse } from "next/server";

/** Sonde de santé (Docker / Coolify). Ne révèle aucune information. */
export function GET() {
  return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
