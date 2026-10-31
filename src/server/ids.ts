import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";

export const newId = () => randomUUID();

/** Jeton aléatoire non prédictible (256 bits), encodé pour URL. */
export const newToken = () => randomBytes(32).toString("base64url");

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
