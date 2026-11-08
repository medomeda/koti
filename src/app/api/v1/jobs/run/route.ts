import { NextResponse } from "next/server";
import { hasAdminSecret } from "@/server/admin-secret";
import { runScheduledJobs } from "@/server/pg/services";

/** Déclenchement des tâches planifiées par un cron externe (Authorization: Bearer <CRON_SECRET>). */
export async function POST(req: Request) {
  if (!hasAdminSecret(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = (await runScheduledJobs(new Date()));
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
