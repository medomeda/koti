import type { Mail } from "./index";

/** Modèles d'e-mails (français). Texte brut + HTML simple, sans image ni suivi. */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function layout(title: string, paragraphs: string[], action?: { label: string; url: string }): { text: string; html: string } {
  const text = [title, "", ...paragraphs, ...(action ? ["", `${action.label} : ${action.url}`] : []), "", "— L'équipe KOTI", "KOTI ne détient ni ne transfère aucun fonds."].join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1a2b22">
<h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
${paragraphs.map((p) => `<p style="line-height:1.55;margin:0 0 12px">${esc(p)}</p>`).join("\n")}
${action ? `<p style="margin:24px 0"><a href="${esc(action.url)}" style="background:#15803d;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${esc(action.label)}</a></p><p style="font-size:12px;color:#5b6b62;word-break:break-all">Si le bouton ne s'affiche pas : ${esc(action.url)}</p>` : ""}
<p style="font-size:12px;color:#5b6b62;margin-top:28px">KOTI ne détient ni ne transfère aucun fonds.</p></div>`;
  return { text, html };
}

export function verificationMail(to: string, name: string, url: string): Mail {
  const body = layout("Confirmez votre adresse e-mail", [`Bonjour ${name},`, "Confirmez votre adresse pour finaliser votre compte KOTI. Le lien est valable une heure."], { label: "Confirmer mon adresse", url });
  return { to, subject: "Confirmez votre adresse e-mail — KOTI", ...body };
}

export function resetPasswordMail(to: string, name: string, url: string): Mail {
  const body = layout("Réinitialiser votre mot de passe", [`Bonjour ${name},`, "Vous avez demandé à changer votre mot de passe. Le lien est valable une heure. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé."], { label: "Choisir un nouveau mot de passe", url });
  return { to, subject: "Réinitialisation de votre mot de passe — KOTI", ...body };
}

export function tontineInvitationMail(to: string, input: { invitedBy: string; tontine: string; url: string; expiresOn: string }): Mail {
  const body = layout(`${input.invitedBy} vous invite à rejoindre « ${input.tontine} »`, [`Vous êtes invité(e) à participer à la tontine « ${input.tontine} » sur KOTI.`, `Cette invitation est valable jusqu'au ${input.expiresOn}. Vous devrez vous connecter avec l'adresse ${to}, ou créer un compte.`], { label: "Voir l'invitation", url: input.url });
  return { to, subject: `Invitation à la tontine « ${input.tontine} » — KOTI`, ...body };
}

export function staffInvitationMail(to: string, input: { invitedBy: string; role: string; url: string; expiresOn: string }): Mail {
  const body = layout("Vous êtes invité(e) dans l'équipe KOTI", [`${input.invitedBy} vous invite à rejoindre l'équipe KOTI avec le rôle « ${input.role} ».`, `Cette invitation est valable jusqu'au ${input.expiresOn} et ne fonctionne qu'avec l'adresse ${to}.`], { label: "Rejoindre l'équipe", url: input.url });
  return { to, subject: "Invitation dans l'équipe KOTI", ...body };
}
