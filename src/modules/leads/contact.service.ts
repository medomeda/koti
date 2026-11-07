import "server-only";
import { read, tx } from "@/server/db/store";
import { AppError } from "@/server/errors";
import { newId } from "@/server/ids";
import type { ContactTopic } from "@/types/domain";

const MAX_PER_EMAIL_PER_HOUR = 3;
const MAX_STORED = 5000;

/**
 * Enregistre un message du formulaire de contact. Public (visiteur non connecté), donc :
 * - piège à robots : un champ « website » rempli est ignoré en silence (réponse de succès identique) ;
 * - limite par adresse e-mail : 3 messages par heure ;
 * - volume borné pour que la base de démonstration ne grossisse pas indéfiniment.
 */
export function submitContactRequest(input: { name: string; email: string; phone: string; topic: ContactTopic; message: string; website?: string }, now = new Date()): void {
  if (input.website && input.website.trim() !== "") return;
  tx((s) => {
    const since = new Date(now.getTime() - 3600_000).toISOString();
    if (s.contactRequests.filter((c) => c.email === input.email && c.createdAt > since).length >= MAX_PER_EMAIL_PER_HOUR) {
      throw new AppError("CONFLICT", "Vous avez déjà envoyé plusieurs messages récemment. Patientez un peu avant d'en envoyer un autre.");
    }
    s.contactRequests.push({ id: newId(), name: input.name, email: input.email, phone: input.phone, topic: input.topic, message: input.message, status: "NEW", createdAt: now.toISOString() });
    if (s.contactRequests.length > MAX_STORED) s.contactRequests = s.contactRequests.slice(-MAX_STORED);
  });
}

/** Lecture réservée à l'espace d'administration de la plateforme (étape 3 du chantier SaaS). */
export function countNewContactRequests(): number {
  return read((s) => s.contactRequests.filter((c) => c.status === "NEW").length);
}
