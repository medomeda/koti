import "server-only";
import { runOnState } from "../store";
import { pgRead, pgTx, type Scope } from "./index";

/**
 * Transforme un service synchrone du magasin simulé en service asynchrone PostgreSQL, SANS réécrire sa logique :
 * le périmètre de données (`scope`) est chargé, la fonction s'exécute dessus, la différence est écrite.
 * La logique métier reste donc unique (et couverte par les tests existants) ; seul le stockage change.
 */
export function writes<F extends (...args: never[]) => unknown>(fn: F, scopeOf: (...args: Parameters<F>) => Scope): (...args: Parameters<F>) => Promise<ReturnType<F>> {
  return (...args) => pgTx(scopeOf(...args), (s) => runOnState(s, () => fn(...args) as ReturnType<F>));
}

export function reads<F extends (...args: never[]) => unknown>(fn: F, scopeOf: (...args: Parameters<F>) => Scope): (...args: Parameters<F>) => Promise<ReturnType<F>> {
  return (...args) => pgRead(scopeOf(...args), (s) => runOnState(s as never, () => fn(...args) as ReturnType<F>));
}

/** Variantes dont le périmètre se découvre par une lecture préalable (opérations qui ne reçoivent qu'un identifiant de ressource). */
export function writesVia<F extends (...args: never[]) => unknown>(fn: F, scopeOf: (...args: Parameters<F>) => Promise<Scope>): (...args: Parameters<F>) => Promise<ReturnType<F>> {
  return async (...args) => pgTx(await scopeOf(...args), (s) => runOnState(s, () => fn(...args) as ReturnType<F>));
}

export function readsVia<F extends (...args: never[]) => unknown>(fn: F, scopeOf: (...args: Parameters<F>) => Promise<Scope>): (...args: Parameters<F>) => Promise<ReturnType<F>> {
  return async (...args) => pgRead(await scopeOf(...args), (s) => runOnState(s as never, () => fn(...args) as ReturnType<F>));
}
