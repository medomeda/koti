import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { readProof } from "@/server/proofs";

/** Lecture d'un justificatif : son auteur et les administrateurs de la tontine uniquement. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession();
  const id = z.string().uuid().safeParse((await params).id);
  if (!user || !id.success) return new NextResponse(null, { status: 404 });
  const proof = await readProof(user.id, id.data);
  if (!proof) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(proof.data), {
    headers: { "Content-Type": proof.mimeType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": "inline" },
  });
}
