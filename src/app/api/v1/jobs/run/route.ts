import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import "@/server/bootstrap";
import { runScheduledJobs } from "@/server/jobs";

/**
 * Déclenchement des tâches planifiées par un cron externe.
 * Protégé par un secret partagé (en-tête « Authorization: Bearer <CRON_SECRET> »), comparé en temps constant.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = runScheduledJobs(new Date());
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
