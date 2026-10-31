/** Erreurs métier typées, traduites en messages utilisateur par les Server Actions. */
export type AppErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "INVALID_STATE";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "Vous n'avez pas les droits nécessaires pour cette action.") => new AppError("FORBIDDEN", msg);
/** Une ressource d'une tontine à laquelle on n'appartient pas est « introuvable » : on ne révèle pas son existence. */
export const notFound = (msg = "Ressource introuvable.") => new AppError("NOT_FOUND", msg);
export const conflict = (msg: string) => new AppError("CONFLICT", msg);
export const invalidState = (msg: string) => new AppError("INVALID_STATE", msg);
