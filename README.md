# KOTI — Gestion de tontines (MVP, phase frontend)

Plateforme web responsive pour créer, organiser et suivre des tontines : membres, invitations,
échéances, déclarations et validations de paiement, tours de main, notifications.

> **Phase actuelle : frontend complet branché sur des données simulées côté serveur.**
> Les règles métier, permissions et validations sont réelles et testées ; seule la persistance
> (PostgreSQL + Drizzle) et l'authentification (Better Auth) sont simulées. Voir
> [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Démarrer

```bash
npm install
npm run dev          # http://localhost:3700
```

Comptes de démonstration (mot de passe `Koti2026`, raccourcis sur la page de connexion en dev) :

| Compte | Profil |
|---|---|
| `ahmed@koti.demo` | Admin de 3 tontines, membre de 2, invitation en attente |
| `mariam@koti.demo` | Admin « Tontine des Amies », membre « Tontine Famille » |
| `koffi@koti.demo` | Admin « Association Riviera » |
| `awa@koti.demo` | Membre simple (pour vérifier le cloisonnement) |

Les données sont relatives à la date du jour et persistées dans `.data/koti-demo.json`.
Réinitialisation : bouton « Réinitialiser la démo » (page Profil) ou `npm run demo:reset` puis redémarrage.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement (port 3700) |
| `npm run build` / `npm start` | Build et serveur de production |
| `npm test` | Tests unitaires et de recette (Vitest) |
| `npm run typecheck` | TypeScript strict |
| `npm run lint` | ESLint (config Next.js) |

## Stack

Next.js 16 (App Router, Server Components, Server Actions) · React 19 · TypeScript strict ·
Tailwind CSS v4 · composants façon shadcn/ui (Radix UI) · React Hook Form + Zod 4 · Sonner · Vitest.

## Parcours couverts

Inscription / connexion / déconnexion · tableau de bord global · création et paramétrage d'une
tontine (4 fréquences, aperçu du calendrier) · démarrage, suspension, reprise, clôture ·
invitations par e-mail ou téléphone (lien sécurisé, expiration 7 jours) · acceptation / refus ·
retrait d'un membre · génération idempotente des échéances · déclaration, validation, refus et
historique des paiements · ordre et calendrier des tours de main · notifications et rappels ·
journal d'audit · profil et mot de passe.
