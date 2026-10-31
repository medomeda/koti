# Suivi du projet — KOTI

Document de pilotage. À mettre à jour à chaque livraison (sections 2, 3, 4 et 6).
Dernière mise à jour : 31/10/2026.

Liens : [PRD](PRD.md) · [Architecture et décisions](ARCHITECTURE.md) · [README](../README.md)

## 1. Où en est-on ?

**Phase 1 — Frontend sur données simulées : livrée.** Toute l'application est utilisable de bout en bout
(création → invitation → adhésion → cotisation → déclaration → validation → tour de main → historique)
avec des règles métier et des permissions réelles, appliquées côté serveur.

**Phase 2 — Backend réel (PostgreSQL, Drizzle, Better Auth) : à démarrer**, après retour des premiers
utilisateurs sur l'interface et arbitrage des questions ouvertes (section 4).

## 2. Avancement par Epic du PRD

| Epic | Sujet | Frontend (phase 1) | Backend (phase 2) |
|---|---|---|---|
| 01 | Initialisation Next.js | ✅ Next 16, TS strict, Tailwind 4, Zod 4 | ⬜ Drizzle, PostgreSQL, variables |
| 02 | Modèle de données | ✅ Types (`src/types/domain.ts`) + base simulée | ⬜ Schéma Drizzle, migrations, index |
| 03 | Authentification | ✅ Inscription, connexion, sessions, mot de passe (simulés) | ⬜ Better Auth, vérification e-mail, reset |
| 04 | Layout et navigation | ✅ Barre latérale, navigation mobile, états | — |
| 05 | Tontines | ✅ Création, paramètres, cycle de vie | ⬜ Persistance |
| 06 | Tableau de bord | ✅ | ⬜ Persistance |
| 07 | Invitations et membres | ✅ Lien sécurisé, acceptation, retrait | ⬜ Envoi e-mail / SMS |
| 08 | Échéances | ✅ Moteur de fréquence testé | ⬜ Persistance |
| 09 | Paiements | ✅ Déclaration, validation, refus, historique, filtres, regroupements | ⬜ Justificatifs (stockage privé) |
| 10 | Tours de main | ✅ Ordre, calendrier, historisation | ⬜ Persistance |
| 11 | Notifications | ✅ Internes, rappels, retards | ⬜ E-mails, cron réel |
| 12 | Sécurité et audit | ✅ Relecture indépendante, 10 correctifs | ⬜ Revue après bascule |
| 13 | Tests et recette | ✅ 46 tests (scénarios PRD 1 à 8) | ⬜ Tests d'intégration base + e2e navigateur |
| 14 | Mise en production | — | ⬜ Hébergement, sauvegardes, HTTPS |

## 3. Journal des livraisons

| Date | Livraison |
|---|---|
| 31/10/2026 | **Version de démonstration déployable sur Coolify** : image Docker autonome, volume de données, bandeau « démonstration », page `/guide` pour les testeurs, réinitialisation protégée par secret, sonde `/api/health`. Guide : [DEPLOIEMENT_COOLIFY.md](DEPLOIEMENT_COOLIFY.md). |
| 31/10/2026 | Mobile : « Alertes » retiré de la barre du bas (4 entrées), accès par la cloche de l'en-tête qui affiche le nombre de non-lues. **Écart volontaire au PRD §4.2** (5 entrées), à la demande du porteur de projet. |
| 31/10/2026 | Paiements d'une tontine : filtre par membre, affichage **par échéance / par membre / liste**, sections repliables avec synthèse (payés, collecté, retards, à valider), filtres dans l'URL. |
| 31/10/2026 | Correctifs issus de la relecture sécurité (redirection ouverte, invitation par téléphone, capacité, suspension, clôture, etc.). |
| 31/10/2026 | MVP frontend complet : 17 écrans, données de démonstration, 46 tests. |

## 4. Questions ouvertes

Registre des points à trancher. Une décision provisoire est appliquée pour ne pas bloquer ; elle est
facile à changer. **Statuts :** 🟡 en attente · ✅ tranchée · ⚪ abandonnée.

| # | Date | Question | Décision provisoire appliquée | Impact si on change | Statut |
|---|---|---|---|---|---|
| Q-01 | 31/10 | Après une **suspension**, faut-il **décaler** les tours de main prévus pendant la pause ? | Non : les échéances de la pause ne sont pas réclamées, les tours ne bougent pas (l'admin peut réordonner). Un bénéficiaire prévu pendant la pause perd sa cagnotte s'il n'est pas déplacé. | Moyen : recalcul des dates de tours. | 🟡 |
| Q-02 | 31/10 | Un membre **retiré après avoir reçu** la cagnotte : que doit-il encore ? | Ses échéances passées restent dues, les futures sont supprimées. Aucun solde calculé. | Moyen : notion de solde par membre. | 🟡 |
| Q-03 | 31/10 | Le montant déclaré doit-il être **strictement égal** au montant attendu ? | Non : avertissement au membre et à l'admin, l'admin décide. | Faible. | 🟡 |
| Q-04 | 31/10 | Tontine démarrée avec **moins de membres que prévu** : que deviennent les tours sans bénéficiaire ? | Le cycle garde la durée prévue ; les positions vides n'ont pas de bénéficiaire tant que personne ne rejoint. | Moyen : réduire le cycle au démarrage ? | 🟡 |
| Q-05 | 31/10 | L'admin peut-il **enregistrer un paiement en espèces pour un membre** (cas fréquent sur le terrain) ? | Non (PRD : le membre déclare lui-même). | Faible à moyen : nouvelle action « enregistrer pour un membre » tracée dans l'audit. | 🟡 |
| Q-06 | 31/10 | Fournisseur **e-mail/SMS** pour les invitations et rappels. | Hébergement tranché : **Coolify sur le VPS personnel** (démo déployée ainsi). E-mail/SMS : à définir avant l'Epic 14. | Conditionne l'envoi automatique des invitations. | 🟡 |
| Q-07 | 31/10 | **Commit Git** du 31/10 fait sans demande explicite : le conserver ? | Tranchée : le porteur de projet a commité et poussé sur `github.com/medomeda/koti`. | — | ✅ |

## 5. Reste à faire (par priorité)

| # | Chantier | Détail | Statut |
|---|---|---|---|
| 1 | Tests utilisateurs | Déployer la démo sur Coolify, envoyer `https://<domaine>/guide` à 2-3 organisateurs de tontines, collecter les retours. | En cours |
| 2 | Arbitrer les questions Q-01 à Q-05 | Avant la phase 2, pour figer le modèle de données. | À faire |
| 3 | Phase 2 — base et auth | Drizzle + PostgreSQL, puis Better Auth ; bascule service par service (voir ARCHITECTURE §5). | À faire |
| 4 | Justificatifs et photo de profil | Stockage privé + téléchargement contrôlé. | À faire |
| 5 | Envoi des invitations et rappels | E-mail (et SMS si retenu, cf. Q-06). | À faire |
| 6 | Tests e2e navigateur | Les parcours Playwright (dont le parcours testeur en mode production) tournent hors dépôt ; en faire une vraie suite. | À faire |
| 7 | Test de l'image Docker | Le serveur autonome a été testé en mode production ; l'image elle-même pas en local (Docker Desktop éteint). La valider au premier déploiement Coolify. | À faire |

## 6. État de qualité (dernière vérification : 31/10/2026)

- Tests : 46/46 (Vitest) · TypeScript strict : OK · ESLint : 0 avertissement · `next build` : OK sans avertissement.
- `npm audit --omit=dev` : 0 vulnérabilité.
- Rendu vérifié par captures d'écran desktop (1366 px) et mobile (390 px).

## 7. Prise en main

```bash
npm install
npm run dev     # http://localhost:3700 — comptes de démo sur la page de connexion (mot de passe Koti2026)
```

Pièges connus :
- Les données de démonstration sont dans `.data/koti-demo.json` ; changer `SCHEMA_VERSION` (store) les régénère automatiquement.
- Une régénération invalide les sessions : il faut se reconnecter.
- Le limiteur de connexion bloque un e-mail 15 min après 8 échecs ; un redémarrage du serveur le remet à zéro.

## 8. Où trouver quoi

| Besoin | Emplacement |
|---|---|
| Règles métier | `src/modules/*/*.service.ts` |
| Moteur de fréquence (pur) | `src/modules/contributions/frequency.ts` |
| Permissions (matrice PRD §5.4) | `src/lib/permissions/index.ts`, contrôle dans `src/server/context.ts` |
| Server Actions | `src/actions/*` |
| Base simulée et jeu de démo | `src/server/db/store.ts`, `src/server/db/seed.ts` |
| Tâches planifiées | `src/server/jobs.ts`, `POST /api/v1/jobs/run` |
| Design system | `src/app/globals.css`, `src/components/ui/*` |
| Tests | `src/modules/contributions/frequency.test.ts`, `src/tests/*` |
