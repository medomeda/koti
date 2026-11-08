import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { getDb, type Db } from "@/server/db/client";
import { accounts, sessions, users, verifications } from "@/server/db/schema";
import { resetPasswordMail, verificationMail } from "@/server/mail/templates";
import { mailIsConfigured, sendMail } from "@/server/mail";

/**
 * Authentification (Better Auth) : e-mail + mot de passe, sessions en base, vérification d'adresse, réinitialisation.
 * - Les mots de passe restent hachés au format scrypt maison (les comptes existants continuent de fonctionner).
 * - Cookie « koti.session_token » (httpOnly, SameSite=Lax, Secure en production), sans cache de session :
 *   une suspension ou une déconnexion prend effet à la requête suivante.
 * - La création de compte est faite par notre code (profil, abonnement, mot de passe) ; Better Auth gère
 *   connexion, sessions, vérification d'adresse et mot de passe oublié.
 * - Vérification d'adresse exigée seulement si KOTI_REQUIRE_EMAIL_VERIFICATION=1 (et un SMTP configuré).
 */
export const SESSION_TTL_SECONDS = 7 * 24 * 3600;
export const requireEmailVerification = () => process.env.KOTI_REQUIRE_EMAIL_VERIFICATION === "1" && mailIsConfigured();

export function createAuth(db: Db, options: { nextCookies?: boolean } = {}) {
  const production = process.env.NODE_ENV === "production";
  return betterAuth({
    secret: process.env.BETTER_AUTH_SECRET,
    // Adresse publique (liens des e-mails) : obligatoire en production ; en développement, le port par défaut de `npm run dev`.
    baseURL: process.env.BETTER_AUTH_URL || (production ? undefined : "http://localhost:3700"),
    trustedOrigins: [...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []), ...(production ? [] : ["http://localhost:*", "http://127.0.0.1:*"])],
    database: drizzleAdapter(db, { provider: "pg", schema: { user: users, session: sessions, account: accounts, verification: verifications } }),
    advanced: {
      cookiePrefix: "koti",
      useSecureCookies: production,
      database: { generateId: "uuid" },
      ipAddress: { ipAddressHeaders: process.env.TRUST_PROXY === "1" ? ["x-forwarded-for"] : [] },
    },
    session: { expiresIn: SESSION_TTL_SECONDS, updateAge: 24 * 3600 },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: requireEmailVerification(),
      revokeSessionsOnPasswordReset: true,
      password: {
        hash: async (password) => hashPassword(password),
        verify: async ({ hash, password }) => verifyPassword(password, hash),
      },
      sendResetPassword: async ({ user, url }) => {
        await sendMail(resetPasswordMail(user.email, user.name || user.email, url));
      },
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail(verificationMail(user.email, user.name || user.email, url));
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Compte suspendu : aucune session ne peut être ouverte, même avec le bon mot de passe.
          before: async (session) => {
            const [u] = await db.select({ status: users.status }).from(users).where(eq(users.id, session.userId));
            if (u?.status === "SUSPENDED") throw new APIError("FORBIDDEN", { message: "Ce compte est suspendu. Contactez l'équipe KOTI pour en savoir plus." });
          },
        },
      },
    },
    // Dans les Server Actions, nextCookies() pose les cookies de session ; les tests appellent l'API hors requête Next.js.
    plugins: options.nextCookies === false ? [] : [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const g = globalThis as typeof globalThis & { __kotiAuth?: Auth };
export function getAuth(): Auth {
  return (g.__kotiAuth ??= createAuth(getDb()));
}
