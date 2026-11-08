# Architecture — KOTI MVP (phase frontend)

## 1. Principe

Le PRD impose un monolithe Next.js : Server Components → Server Actions → services métier →
Drizzle → PostgreSQL, avec Better Auth. Pour livrer d'abord une UI **utilisable**, la couche
de persistance et l'authentification sont simulées **côté serveur**, sans changer le reste :

```text
Pages (Server Components)  ──lecture──►  services métier (src/modules/*)  ──►  store simulé (src/server/db/store.ts)
Client Components ──► Server Actions (src/actions/*) ──► mêmes services                 (remplacé par Drizzle)
```

- Les données ne vivent **que sur le serveur** : le navigateur ne reçoit que ce que chaque page
  lui transmet après contrôle d'accès. Rien n'est contournable depuis les outils du navigateur.
- Chaque Server Action suit le pipeline du PRD §8.3 : session → validation Zod → service
  (permission + transaction) → résultat typé `{ ok, data } | { ok: false, error, fieldErrors }`.
- `tx()` travaille sur une copie de l'état et ne la publie qu'en cas de succès (équivalent
  `BEGIN … COMMIT/ROLLBACK`). Testé : une opération qui échoue n'écrit rien.

## 2. Organisation

```text
src/
  app/                    routes (auth), (dashboard), tontines/[tontineId]/*, invite/[token], api/v1/jobs/run
  actions/                Server Actions (points d'entrée des mutations)
  modules/                services métier par domaine
    contributions/        moteur de fréquence (pur) + génération des échéances
    tontines/ members/ invitations/ payments/ rotations/ notifications/ audit/ users/
  server/                 store simulé, seed, contexte d'accès, erreurs, tâches planifiées
  lib/                    auth (session, mot de passe), permissions, validations Zod, utilitaires
  components/ui/          design system (shadcn/ui-like)
  components/shared/      composants métier réutilisables
  types/domain.ts         contrats du modèle de données (PRD §10)
  proxy.ts                redirection optimiste vers /login (Next 16 : ex-middleware)
```

## 3. Sécurité appliquée

| Exigence | Mise en œuvre |
|---|---|
| Cloisonnement (PRD §6.17) | `requireAccess()` : adhésion ACTIVE + permission de la matrice §5.4 dans **chaque** service. Une tontine non accessible renvoie « introuvable » (on ne révèle pas son existence). |
| Données personnelles | Un membre ne reçoit que ses propres échéances ; e-mails/téléphones des membres visibles par l'admin uniquement. |
| Sessions | Jeton 256 bits, cookie `httpOnly` + `SameSite=Lax` + `Secure` en prod, seule l'empreinte SHA-256 est stockée, expiration 7 jours, révocation au changement de mot de passe. |
| Mots de passe | scrypt + sel, comparaison en temps constant, hash factice si e-mail inconnu (anti-énumération). |
| Force brute | Limitation des échecs de connexion par e-mail et par IP. |
| Invitations | Jeton aléatoire stocké haché, expiration, usage unique, contact vérifié. |
| CSRF | Contrôle d'origine natif des Server Actions. |
| Redirections | `safeNext()` n'autorise que des chemins internes. |
| Tâche planifiée | `POST /api/v1/jobs/run` protégé par `CRON_SECRET` (≥ 32 caractères, comparaison en temps constant). |
| En-têtes | `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, pas de `X-Powered-By`. |

## 4. Décisions sur les points non tranchés par le PRD

Le PRD demande de signaler les ambiguïtés : voici les choix faits, faciles à revoir.

1. **Durée d'un cycle** = « nombre de membres prévu » échéances (1 tour de main par membre).
2. **Tour n ↔ échéance n** : le bénéficiaire en position n reçoit la cagnotte à la date de l'échéance n.
3. **Statut initial** d'une tontine : `DRAFT`. Le démarrage (`ACTIVE`) génère les échéances et verrouille
   montant, fréquence, date de démarrage et nombre prévu. Clôturer un brouillon le passe en `CANCELLED`.
4. **Génération** : les périodes échues + la suivante sont créées (idempotent), à chaque visite
   (rattrapage) et par la tâche planifiée. Rien n'est généré si la tontine n'est pas `ACTIVE`.
5. **Nouveaux membres** : ceux qui rejoignent avant la date de démarrage doivent toutes les échéances ;
   les autres, celles dont la date est ≥ à leur adhésion. Ils sont ajoutés en fin d'ordre de passage.
6. **LATE** est calculé (échéance passée, non payée, sans déclaration en cours), jamais stocké.
   Une déclaration refusée et échue apparaît « En retard » (le motif reste visible dans l'historique).
7. **Montant déclaré** différent du montant attendu : autorisé, signalé à l'admin lors de la validation.
8. **Date de paiement** future : refusée.
9. **Tontine suspendue** : déclarations et validations des échéances existantes autorisées. Les échéances
   qui tombent pendant la suspension ne sont jamais réclamées (période clôturée sans obligation) ;
   l'échéance future déjà générée et encore vierge est retirée, puis rouverte si la reprise intervient avant.
   Les tours de main ne sont pas décalés automatiquement : l'admin peut les réorganiser (à valider, voir §7).
   **Clôturée** : lecture seule complète ; la clôture est refusée tant que des déclarations attendent une validation.
10. **Retrait d'un membre** : adhésion `REMOVED` (jamais supprimée), historique conservé, échéances
    futures non payées et sans déclaration supprimées, tour à venir `CANCELLED`. L'admin ne peut pas être retiré.
11. **Réorganisation des tours après démarrage** : seuls les tours à venir sont permutables, motif obligatoire,
    changement journalisé (avant/après).
12. **Fréquence « deux fois par semaine »** : la première échéance est le premier des deux jours choisis
    à partir de la date de démarrage (incluse).
13. **Capacité** : le nombre de membres prévu est un plafond (invitation et adhésion refusées au-delà) ;
    un nouveau membre reprend la première place libre du cycle (ex. celle d'un membre retiré).
14. **Invitation par téléphone** : le numéro n'étant pas vérifié, une invitation par téléphone sans compte
    cible n'est acceptable qu'avec le lien (jeton) ; une invitation visant un compte existant n'est utilisable que par ce compte.
15. **Rappels** : « échéance à venir » à J-2, « retard » dès J+1, « tour de main » à J-3 ; un seul envoi par
    événement (clé d'idempotence).

## 5. Simulé aujourd'hui → à brancher en phase backend

| Aujourd'hui | Demain | Fichiers |
|---|---|---|
| ~~`store.ts` (mémoire + JSON)~~ ✅ fait | Drizzle + PostgreSQL via l'unité de travail (`server/db/uow`) et la façade `server/pg/services.ts` | `src/server/db/*`, `src/server/pg/*` |
| ~~Session/mot de passe maison~~ ✅ fait | Better Auth (adaptateur Drizzle, vérification e-mail, reset), hachage scrypt conservé | `src/server/auth.ts`, `src/lib/auth/session.ts`, `src/actions/auth.ts` |
| Lien d'invitation affiché à l'admin | ✅ E-mail envoyé (SMTP) en plus du lien affiché ; SMS : à faire | `src/actions/members.ts`, `src/server/mail/*` |
| Notifications internes seulement | + e-mails transactionnels (outbox) | `notification.service.ts` (`notify`) |
| Pas de justificatif / photo | Stockage privé + téléchargement contrôlé | `declare-payment-dialog.tsx`, profil |
| Rattrapage des tâches à la navigation | Cron externe → `/api/v1/jobs/run` | `src/server/jobs.ts` |
| Limiteur en mémoire | Rate limit Better Auth / proxy de confiance pour l'IP | `src/actions/_shared.ts` |

Les écrans, les Server Actions, les schémas Zod, les permissions et les tests de recette restent inchangés.

**Méthode de bascule (décidée le 08/11/2026).** Les services du magasin simulé se référencent tous entre eux (comptes,
tontines, tickets…) : les basculer un par un obligerait à maintenir deux sources de vérité. La pile PostgreSQL est donc
construite **en parallèle** — fichiers `*.pg.ts` à côté des services actuels, asynchrones, testés sur la base `koti_test` —
pendant que l'application tourne sur le simulé. Quand tous les modules existent, l'interface est basculée en une fois
(actions, pages, session) et le magasin simulé est supprimé.

**Évolution (08/11/2026) : unité de travail.** Réécrire chaque service en SQL aurait doublé la logique métier. À la place,
`server/db/uow/` charge le périmètre nécessaire (tontine, utilisateur, plateforme), exécute le service existant dessus
(`runOnState`, qui redirige `read()`/`tx()`), puis écrit la différence dans la même transaction, avec verrous
`FOR UPDATE` sur les tontines et utilisateurs visés. `server/pg/services.ts` en est la façade asynchrone. Les comptes et
sessions, eux, ont une version SQL directe (`user.pg.ts`, `session.pg.ts`). Les requêtes d'agrégat SQL remplaceront le
chargement global des écrans d'administration avant tout volume réel.

## 6. Relecture sécurité

Une relecture indépendante (agent dédié) a relevé 10 points, tous corrigés et couverts par
`src/tests/review-regressions.test.ts` : redirection ouverte via `?next=`, appropriation d'une invitation
par téléphone, tours hors cycle, échéances rétroactives après suspension, déclarations bloquées par la
clôture, motif de refus masqué, anciens membres visibles par un membre, compteur d'invitations expirées,
limiteur IP falsifiable (`TRUST_PROXY`), formulaires non resynchronisés.

## 7. Questions ouvertes pour le métier

- Après une suspension, faut-il **décaler** automatiquement les tours de main prévus pendant la pause ?
- Un membre retiré en cours de cycle après avoir **déjà reçu** la cagnotte : quelle règle de solde ?
- Le montant déclaré doit-il être **strictement égal** au montant attendu (aujourd'hui : avertissement seulement) ?

## 8. Tests

`npm test` : moteur de fréquence (fins de mois, années bissextiles, deux jours/semaine) et
scénarios de recette 1 à 8 du PRD §14 exécutés contre les services (création, invitation,
paiement, refus, multi-tontines, cloisonnement, paiements personnels, tours de main), plus
idempotence des tâches, suspension, verrouillage des paramètres et rollback.
