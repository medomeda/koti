import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { AppError } from "@/server/errors";
import { logError } from "@/server/log";
import { MAX_UPLOAD_BYTES, saveProof } from "@/server/proofs";

/**
 * Envoi d'un justificatif de paiement (multipart : `file` + `obligationId`). Réponse : { id }. Il est ensuite joint à la
 * déclaration (`proofId`). L'image est compressée côté serveur, quelle que soit celle envoyée.
 */
export async function POST(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_UPLOAD_BYTES + 100_000) return NextResponse.json({ error: "Image trop lourde (8 Mo maximum)." }, { status: 413 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    const obligationId = z.string().uuid().safeParse(form.get("obligationId"));
    if (!(file instanceof File) || !obligationId.success) return NextResponse.json({ error: "Envoi incomplet." }, { status: 400 });
    const saved = await saveProof(user.id, obligationId.data, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ id: saved.id, sizeBytes: saved.sizeBytes }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.code === "NOT_FOUND" ? 404 : 400 });
    const ref = logError("proofs", err, { userId: user.id });
    return NextResponse.json({ error: `Une erreur inattendue est survenue (code ${ref}).` }, { status: 500 });
  }
}
