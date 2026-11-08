# Suivi du projet — KOTI

Document de pilotage. À mettre à jour à chaque livraison (sections 2, 3, 4 et 6).
Dernière mise à jour : 07/11/2026.

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
| 02 | Modèle de données | ✅ Types (`src/types/domain.ts`) + base simulée, **tickets et cycles** | ⬜ Schéma Drizzle (dont `tontine_tickets`, `rotation_cycles`), migrations, index |
| 03 | Authentification | ✅ Inscription, connexion, sessions, mot de passe (simulés) | ⬜ Better Auth, vérification e-mail, reset |
| 04 | Layout et navigation | ✅ Barre latérale, navigation mobile, états, **PWA installable** | — |
| 05 | Tontines | ✅ Création, paramètres, cycle de vie | ⬜ Persistance |
| 06 | Tableau de bord | ✅ | ⬜ Persistance |
| 07 | Invitations et membres | ✅ Lien sécurisé, acceptation, retrait | ⬜ Envoi e-mail / SMS |
| 08 | Échéances | ✅ Moteur de fréquence testé, **une obligation par ticket** | ⬜ Persistance (`UNIQUE (ticket_id, contribution_period_id)`) |
| 09 | Paiements | ✅ Déclaration, validation, refus, historique, filtres, regroupements | ⬜ Justificatifs (stockage privé) |
| 10 | Tours de main | ✅ Ordre, calendrier, historisation, **rotation par ticket, cycle initial** | ⬜ Persistance (`rotation_cycles`, `rotation_slots.ticket_id`) |
| 11 | Notifications | ✅ Internes, rappels, retards | ⬜ E-mails, push PWA, cron réel |
| 12 | Sécurité et audit | ✅ Relecture indépendante, 10 correctifs | ⬜ Revue après bascule |
| 13 | Tests et recette | ✅ 62 tests (scénarios PRD 1 à 8, tickets, migration) | ⬜ Tests d'intégration base + e2e navigateur |
| 14 | Mise en production | — | ⬜ Hébergement, sauvegardes, HTTPS |
| 15 | Plateforme SaaS | ✅ Étapes 1 (site vitrine), 2 (offres, quotas, abonnement), 3 (administration) et 4 (support, annonces, journal d'audit) | ⬜ Facturation réelle (Mobile Money), e-mails, hébergement |

## 3. Journal des livraisons

| Date | Livraison |
|---|---|
| 08/11/2026 | **Phase 2 — étape 2 : comptes et sessions sur PostgreSQL** (`user.pg.ts`, `session.pg.ts`, 10 tests d'intégration). Inscription (compte + profil + mot de passe haché + abonnement gratuit en une transaction), connexion (e-mail insensible à la casse, compte suspendu refusé, hachage factice anti-énumération), sessions (empreinte seule stockée, 7 jours, nettoyage des expirées), changement de mot de passe (toutes les sessions fermées), profil. L'unicité de l'e-mail et du téléphone est garantie par la base : deux inscriptions simultanées ne créent qu'un compte. **Méthode corrigée par rapport au plan annoncé** : les comptes sont référencés par tous les services du magasin simulé ; les basculer seuls obligerait à les recopier dans les deux mondes. On construit donc la pile PostgreSQL **en parallèle** (fichiers `*.pg.ts`, testés sur `koti_test`), l'application continue de tourner sur le simulé, et l'interface est basculée **une seule fois** à l'étape 6, qui supprime l'ancienne pile. 142 tests au total. |
| 08/11/2026 | **Phase 2 — étape 1 : socle d'accès PostgreSQL.** `src/server/db/client.ts` : connexion unique par processus (`getDb`), types `Db` / `Tx` / `Executor`, `transaction()` qui rejoue jusqu'à 3 fois en cas de conflit de concurrence (sérialisation, interblocage). Base de tests `koti_test` (variable `DATABASE_URL_TEST`, migration par `npm run db:migrate:test`) ; l'aide de test refuse de vider une base dont le nom ne se termine pas par `_test`. 13 tests d'intégration (`src/tests/db/schema.test.ts`) prouvent que les règles métier sont garanties **par la base** (obligation unique par ticket et période, numéro de ticket unique, tour actif unique, déclaration ouverte unique, e-mail insensible à la casse, journal d'audit en ajout seul, annulation complète d'une transaction) et que `SELECT … FOR UPDATE` empêche le dépassement du plafond de tickets sous trois créations simultanées (vérifié : le test échoue sans le verrou). Ces tests sont ignorés si `DATABASE_URL_TEST` est absent. 132 tests au total. |
| 08/11/2026 | **Phase 2 démarrée — base PostgreSQL et schéma Drizzle.** Base `koti` créée sur le PostgreSQL 16 local (conteneur Docker, port 5032 ; les autres bases du serveur ne sont pas touchées) ; adresse de connexion dans `.env.local` (ignoré par git, mot de passe encodé). Schéma complet dans `src/server/db/schema/` : **23 tables**, 38 clés étrangères, 37 unicités, 13 contrôles CHECK ; règles métier portées par la base : une obligation par ticket et par période, un numéro de ticket unique par tontine, un seul tour actif par ticket, une seule déclaration ouverte par obligation, une adhésion par personne et par tontine, une facture par abonnement et par période, rappels sans doublon (clé d'idempotence). **Journal d'audit en ajout seul**, garanti par un déclencheur (UPDATE, DELETE et TRUNCATE refusés). Migrations dans `drizzle/` (`0000_init`, `0001_audit_append_only`), commandes `npm run db:create / db:generate / db:migrate / db:check`. Les services utilisent encore le magasin simulé : la bascule se fait service par service (étape suivante). |
| 08/11/2026 | **Administration — gestion de l'équipe KOTI** (`/admin/equipe`, super-admin). Un collaborateur arrive par **invitation** (e-mail + rôle Support ou Super-admin) : lien à usage unique, valable 7 jours, empreinte seule stockée, utilisable uniquement avec le compte de l'adresse invitée (`/staff-invite/[jeton]`, page publique) ; annulation possible. Changement de rôle et désactivation/réactivation d'accès avec motif, journalisés ; garde-fous : on ne modifie pas son propre accès, il reste toujours un super-admin actif ; une adresse de client ayant des tontines ne peut pas devenir collaborateur. Le lien « Retour à l'application » de l'administration est remplacé par « Voir le site public » (un compte d'équipe n'a pas d'espace client). Journal d'audit : domaine « Équipe ». Base **v9** (migration v8 → v9, sauvegarde `.v8.bak`). 119 tests. En phase 2, le lien d'invitation partira par e-mail (affiché à l'écran en démonstration). |
| 07/11/2026 | **SaaS — étape 4 : support, annonces et journal d'audit** (couche simulée). **Messages** : le support et le super-admin marquent un message comme traité avec la réponse apportée (rien n'est envoyé en démonstration), le rouvrent avec un motif, filtrent « à traiter / traités ». **Annonces** (`/admin/annonces`, super-admin) : bandeau affiché à tous les clients connectés, 3 visibles au plus, type information / avertissement / bonne nouvelle, date de fin facultative, retrait et republication ; le client peut fermer un bandeau (mémorisé dans son navigateur). **Journal d'audit** (`/admin/audit`) : toutes les actions `admin.*` de l'équipe (comptes, offres, messages, annonces) avec auteur, cible, avant → après et motif, filtres par domaine et par auteur, pagination. Base **v8** (migration v7 → v8, sauvegarde `.v7.bak`). 113 tests. **Le chantier SaaS en couche simulée est terminé.** |
| 07/11/2026 | **Offres réglables depuis l'administration** (`/admin/offres`). Nom, accroche, prix et limites (tontines, membres, tickets, tickets multiples) de chaque offre sont maintenant stockés en base ; `plans.ts` ne fournit plus que les valeurs d'origine. Réservé au super-admin, motif obligatoire, journalisé, **aperçu d'impact** pendant la saisie (clients au-dessus des nouvelles limites, effet sur le revenu récurrent), retour aux valeurs d'origine, historique des modifications. Effet immédiat sur le site public (`/tarifs`), la page d'abonnement des clients et tous les contrôles de quotas ; aucune tontine existante n'est bloquée et les factures passées ne changent jamais. Base **v7** (migration v6 → v7, sauvegarde `.v6.bak`). 106 tests. |
| 07/11/2026 | **SaaS — étape 3 : espace d'administration de la plateforme** (couche simulée, `/admin`). Accès réservé à l'équipe KOTI (rôles SUPPORT et SUPER_ADMIN, droits distincts de ceux des tontines) : un client ordinaire obtient « introuvable ». **Tableau de bord** : inscrits, organisateurs actifs, tontines actives, tickets gérés, revenu mensuel récurrent et facturé (simulés), histogrammes sur 12 mois, entonnoir inscription → tontine → démarrage → premier paiement validé, alertes (comptes inactifs, clients au maximum de leur offre, essais qui se terminent, messages à traiter, comptes suspendus). **Clients** : liste avec recherche sans accent, filtres (offre, statut, profil), pagination ; fiche (compte, offre, consommation, tontines en agrégats, factures, notes internes, chronologie) ; actions journalisées avec motif : suspendre/réactiver, changer d'offre, offrir un essai, note (le support ne peut que consulter et annoter). **Tontines** (santé selon le taux de retard), **Abonnements** (répartition par offre, revenu récurrent, dernières factures), **Messages** du site. **Confidentialité** : l'équipe ne voit que des agrégats, jamais le détail des paiements ni l'identité des autres membres. Démo : 64 clients sur 12 mois (offres, tontines, paiements validés, 34 factures, 14 messages, 2 suspensions, notes, essai offert), comptes `operateur@koti.demo` et `support@koti.demo`. Base **v6** (notes internes), migration v5 → v6 avec sauvegarde `.v5.bak`. 98 tests. |
| 07/11/2026 | **SaaS — étape 2 : rôle plateforme, offres et quotas** (couche simulée). `platformRole` (USER / SUPPORT / SUPER_ADMIN) et `status` (ACTIVE / SUSPENDED) sur l'utilisateur ; un compte suspendu ne peut plus se connecter. Abonnement par client : Découverte (gratuit), Organisateur, Association ; premier passage à une offre payante = **essai de 14 jours sans facture**, puis facturation mensuelle simulée (idempotente, rattrapage des périodes manquées) ; retour au gratuit possible tant que l'usage tient dans l'offre. **Quotas appliqués côté serveur**, avec l'offre du créateur de la tontine : nombre de tontines en cours, membres, tickets, tickets multiples ; jamais de blocage rétroactif des tontines existantes. Page **Mon abonnement** (`/account`, lien depuis le Profil) : offre, consommation par tontine, changement d'offre avec confirmation, factures simulées. Messages de limite avec lien vers les offres (création de tontine, membres). Compte « operateur@koti.demo » (SUPER_ADMIN) créé dans la démo pour l'étape 3. Base **v5** : migration v4 → v5 qui donne à chacun la plus petite offre couvrant son usage actuel (sauvegarde `.v4.bak`). 82 tests. |
| 07/11/2026 | **SaaS — étape 1 : site vitrine public** (couche simulée). Accueil (hero avec cercle de rotation animé, étapes, captures réelles de l'application, bandeau de confiance), Fonctionnalités, Tarifs (3 offres fictives : Découverte 0 / Organisateur 5 000 / Association 15 000 FCFA par mois, quotas en tontines, membres et tickets), FAQ, Contact, CGU et Confidentialité (textes provisoires à faire valider). Un visiteur sans session voit le site sur `/` ; un utilisateur connecté garde son tableau de bord. Formulaire de contact : validation serveur, piège à robots, limite 3 messages/heure/e-mail, messages stockés (`contactRequests`, base v4, migration v3 → v4 avec sauvegarde `.v3.bak`). Offres centralisées dans `src/lib/marketing/plans.ts` (réutilisées pour les quotas à l'étape 2). 68 tests. |
| 07/11/2026 | **Tickets de participation multiples (phase 1, couche simulée)** — spécification : [PRD-V2.md](PRD-V2.md). Un membre garde **une seule adhésion** et peut détenir plusieurs tickets (`TKT-001`…), attribués par l'administrateur **en brouillon uniquement** (paramètres `multipleTicketsAllowed` / `maxTicketsPerMember`, faux/1 par défaut). Une obligation par ticket et par période (unicité période+ticket), un tour de main par ticket, cycle de rotation créé au **démarrage atomique** (contrôles puis figeage), suppression logique d'un ticket avant démarrage (audit, numéro jamais réutilisé). Écrans : membres (tickets, cotisation par période, ajout/suppression), rotation et paiements par ticket, tableau de bord (tickets, tickets en retard). **Migration v2 → v3** non destructive (sauvegarde `koti-demo.json.v2.bak`, ticket initial par adhésion, historique intact, arrêt en cas d'ambiguïté) vérifiée sur le fichier de démonstration réel. 62 tests. |
| 01/11/2026 | **Application installable (PWA), phase 1** : manifeste et icônes, installation Android (bouton) et iPhone (aide pas à pas), message « Nouvelle version disponible — Mettre à jour » après chaque déploiement, page hors ligne, cache limité aux fichiers techniques (aucune donnée sur l'appareil), cache vidé à la déconnexion. Testé : installabilité Chrome, hors ligne, passage v1 → v2. |
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
| Q-04 | 31/10 | Tontine démarrée avec **moins de membres que prévu** : que deviennent les tours sans bénéficiaire ? | **Modifiée le 07/11** (tickets) : le cycle compte **un tour par ticket au démarrage** (plus de positions vides). Après démarrage, un nouvel arrivant ne peut que reprendre un tour libéré par un membre retiré. Les tontines déjà démarrées gardent la longueur d'origine (migration). | Moyen : revenir à la durée prévue. | 🟡 |
| Q-05 | 31/10 | L'admin peut-il **enregistrer un paiement en espèces pour un membre** (cas fréquent sur le terrain) ? | Non (PRD : le membre déclare lui-même). | Faible à moyen : nouvelle action « enregistrer pour un membre » tracée dans l'audit. | 🟡 |
| Q-06 | 31/10 | Fournisseur **e-mail/SMS** pour les invitations et rappels. | Hébergement tranché : **Coolify sur le VPS personnel** (démo déployée ainsi). E-mail/SMS : à définir avant l'Epic 14. | Conditionne l'envoi automatique des invitations. | 🟡 |
| Q-07 | 31/10 | **Commit Git** du 31/10 fait sans demande explicite : le conserver ? | Tranchée : le porteur de projet a commité et poussé sur `github.com/medomeda/koti`. | — | ✅ |

## 5. Reste à faire (par priorité)

| # | Chantier | Détail | Statut |
|---|---|---|---|
| 1 | Tests utilisateurs | Déployer la démo sur Coolify, envoyer `https://<domaine>/guide` à 2-3 organisateurs de tontines, collecter les retours. | En cours |
| 2 | Arbitrer les questions Q-01 à Q-05 | Avant la phase 2, pour figer le modèle de données. | ✅ Fait (07/11) |
| 3 | Phase 2 — base et auth | Drizzle + PostgreSQL, puis Better Auth ; bascule service par service (voir ARCHITECTURE §5). | 🔄 Schéma et migrations faits (08/11) ; bascule des services et Better Auth à faire |
| 4 | Justificatifs et photo de profil | Stockage privé + téléchargement contrôlé. | À faire |
| 5 | Envoi des invitations et rappels | E-mail (et SMS si retenu, cf. Q-06). | À faire |
| 6 | Tests e2e navigateur | Les parcours Playwright (dont le parcours testeur en mode production) tournent hors dépôt ; en faire une vraie suite. | À faire |
| 8 | Notifications push (PWA phase 2) | Rappels d'échéance et validation de paiement sur le téléphone (Android, et iPhone si l'application est installée). Nécessite le backend : clés VAPID, enregistrement des abonnements. Plan détaillé : clés VAPID, bouton d'activation (profil), `push`/`notificationclick` dans `sw.js`, table d'abonnements, `web-push`, préférences, cron réel. **À rappeler au démarrage de la phase 2.** | À faire (phase 2) |
| 9 | Schéma Drizzle des tickets | Traduire le modèle simulé : `tontine_tickets`, `rotation_cycles`, `ticket_id` sur obligations et tours, unicités, verrou `SELECT … FOR UPDATE` sur la création de ticket (le plafond n'est aujourd'hui protégé que par le caractère synchrone de `tx()`), transaction de démarrage. | À faire (phase 2) |
| 12 | SaaS — étape 4 : support, annonces, audit plateforme | Traitement des messages de contact (réponse, statut), bandeau d'annonces, vue du journal d'audit des actions de l'équipe (déjà enregistré). Le réglage des offres et quotas est livré (07/11). | ✅ Fait (07/11) |
| 7 | Test de l'image Docker | Le serveur autonome a été testé en mode production ; l'image elle-même pas en local (Docker Desktop éteint). La valider au premier déploiement Coolify. | À faire |

## 6. État de qualité (dernière vérification : 07/11/2026)

- Tests : 106/106 (Vitest) · TypeScript strict : OK · ESLint : 0 erreur · `next build` : OK (vérifié le 07/11/2026).
- `npm audit --omit=dev` : 0 vulnérabilité.
- Rendu vérifié par captures d'écran desktop (1366 px) et mobile (390 px).

### Écarts volontaires au PRD-V2 (tickets)

- Statut de paiement validé : le code garde `PAID` (le PRD-V2 écrit `VALIDATED`), pour ne pas toucher l'historique ni l'interface.
- Les tours sont **réservés au fil de l'eau** (ordre proposé dès le brouillon, par ticket) puis **figés et rattachés au cycle au démarrage**.
- Les tours annulés (membre retiré) restent en historique ; la règle « un ticket une seule fois par cycle » vaut pour les tours non annulés.
- Les tickets d'un membre retiré passent `INACTIVE` (conservés) ; `deletedAt` ne sert qu'à la suppression par l'administrateur avant démarrage.

## 7. Prise en main

```bash
npm install
npm run dev     # http://localhost:3700 — comptes de démo sur la page de connexion (mot de passe Koti2026)
```

Pièges connus :
- Les données de démonstration sont dans `.data/koti-demo.json` ; changer `SCHEMA_VERSION` (store) les régénère automatiquement.
- Une régénération invalide les sessions : il faut se reconnecter.
- Passage v2 → v3 : au premier démarrage, `.data/koti-demo.json` est migré (copie de sécurité `koti-demo.json.v2.bak`). Si la migration détecte une ambiguïté, le serveur refuse de démarrer avec un message précis et le fichier reste intact.
- Le limiteur de connexion bloque un e-mail 15 min après 8 échecs ; un redémarrage du serveur le remet à zéro.

## 8. Où trouver quoi

| Besoin | Emplacement |
|---|---|
| Administration de la plateforme | `src/app/(admin)/admin/*`, `src/modules/admin/admin.service.ts`, `src/lib/permissions/platform.ts`, `src/components/admin/*` ; données fictives : `src/server/db/seed-platform.ts` |
| Offres, quotas, facturation | `src/modules/billing/` (`quota.ts`, `billing.service.ts`) ; page `src/app/(dashboard)/account/` |
| Site vitrine | `src/app/(marketing)/*`, `src/components/marketing/*`, `src/lib/marketing/plans.ts` ; formulaire de contact : `src/modules/leads/`, `src/actions/contact.ts` |
| Règles métier | `src/modules/*/*.service.ts` ; tickets : `src/modules/tickets/` ; migration : `src/server/db/migrations.ts` |
| Moteur de fréquence (pur) | `src/modules/contributions/frequency.ts` |
| Permissions (matrice PRD §5.4) | `src/lib/permissions/index.ts`, contrôle dans `src/server/context.ts` |
| Server Actions | `src/actions/*` |
| Base simulée et jeu de démo | `src/server/db/store.ts`, `src/server/db/seed.ts` |
| Tâches planifiées | `src/server/jobs.ts`, `POST /api/v1/jobs/run` |
| Design system | `src/app/globals.css`, `src/components/ui/*` |
| Tests | `src/modules/contributions/frequency.test.ts`, `src/tests/*` |
