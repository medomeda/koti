/**
 * Lecture des erreurs PostgreSQL. Drizzle enveloppe l'erreur du pilote : le code SQLSTATE et le nom de la
 * contrainte peuvent être sur l'erreur elle-même ou sur sa cause.
 */
type PgErrorShape = { code?: string; constraint?: string; cause?: PgErrorShape };

const flat = (err: unknown): PgErrorShape => {
  const e = (err ?? {}) as PgErrorShape;
  return { code: e.code ?? e.cause?.code, constraint: e.constraint ?? e.cause?.constraint };
};

/** Nom de la contrainte d'unicité violée (SQLSTATE 23505), ou undefined si l'erreur est d'une autre nature. */
export function uniqueViolation(err: unknown): string | undefined {
  const { code, constraint } = flat(err);
  return code === "23505" ? (constraint ?? "") : undefined;
}
