import "server-only";
import { notFound } from "next/navigation";
import { AppError } from "@/server/errors";

/**
 * Exécute une lecture de service dans une page : une ressource introuvable ou interdite
 * aboutit à la page 404 (sans révéler son existence).
 */
export function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof AppError && (err.code === "NOT_FOUND" || err.code === "FORBIDDEN")) notFound();
    throw err;
  }
}
