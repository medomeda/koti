import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { logError } from "@/server/log";

/**
 * Envoi d'e-mails transactionnels (vérification d'adresse, réinitialisation de mot de passe, invitations).
 * - `SMTP_URL` défini (ex. smtp://utilisateur:motdepasse@hote:587, ou smtp://127.0.0.1:1025 avec Mailpit) : envoi réel ;
 * - absent : le message est écrit dans les journaux du serveur (développement, démonstration sans courrier).
 * Un échec d'envoi est journalisé et remonté à l'appelant, qui décide s'il doit bloquer l'opération.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

let transporter: Transporter | null = null;

export const mailIsConfigured = () => Boolean(process.env.SMTP_URL);

export async function sendMail(mail: Mail): Promise<{ delivered: boolean }> {
  const url = process.env.SMTP_URL;
  if (!url) {
    // Développement / démonstration sans courrier : le message (liens compris) est lisible dans le terminal.
    console.log(`[koti:mail] (non envoyé, SMTP_URL absent)\n  À : ${mail.to}\n  Objet : ${mail.subject}\n${mail.text.split("\n").map((l) => `  | ${l}`).join("\n")}`);
    return { delivered: false };
  }
  transporter ??= nodemailer.createTransport(url);
  try {
    await transporter.sendMail({ from: process.env.MAIL_FROM || "KOTI <no-reply@koti.app>", to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
    return { delivered: true };
  } catch (err) {
    logError("mail", err, { subject: mail.subject }, { message: "échec d'envoi d'un e-mail" });
    throw err;
  }
}

/** Adresse publique de l'application (liens dans les e-mails). */
export function appUrl(fallbackOrigin?: string): string {
  return (process.env.BETTER_AUTH_URL || fallbackOrigin || "http://localhost:3700").replace(/\/$/, "");
}
