import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

/** Points d'entrée de Better Auth (liens de vérification d'adresse et de réinitialisation, déconnexion). */
export async function GET(req: Request) {
  return toNextJsHandler(getAuth()).GET(req);
}

export async function POST(req: Request) {
  return toNextJsHandler(getAuth()).POST(req);
}
