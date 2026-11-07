# PRD — KOTI
## Plateforme Web de Gestion de Tontines
**Version : 1.2 — Mise à jour : Gestion des tickets de participation multiples**

---

# 1. Présentation du projet

## 1.1. Vision

KOTI est une application web permettant de créer, organiser et gérer des tontines de manière simple, transparente et structurée.

La plateforme permet à un utilisateur de créer plusieurs tontines, de participer à des tontines créées par d'autres utilisateurs et de suivre ses engagements financiers, ses paiements et ses tours de main.

Une tontine constitue un espace indépendant avec ses propres membres, règles, cotisations, paiements et rotations.

KOTI ne conserve pas les fonds des participants et n'effectue aucun transfert d'argent. L'application assure le suivi organisationnel et administratif des engagements et déclarations de paiement.

## 1.2. Évolution majeure de la version 1.2

La plateforme doit désormais permettre à un même individu de détenir plusieurs tickets de participation dans une même tontine.

Un ticket représente une participation individuelle dans la tontine.

Chaque ticket :
- Génère ses propres obligations de cotisation.
- Possède son propre historique de paiement.
- Donne droit à un tour de main.
- Est identifié individuellement dans la rotation.

Un membre peut donc détenir plusieurs tickets et bénéficier de plusieurs tours de main au cours d'un cycle.

La création des tickets supplémentaires est exclusivement réservée à l'administrateur et doit intervenir avant le démarrage de la tontine.

---

# 2. Stack technique et architecture

## 2.1. Stack obligatoire

- Framework : Next.js avec App Router.
- Langage : TypeScript.
- Authentification : Better Auth.
- ORM : Drizzle ORM.
- Base de données : PostgreSQL.
- UI : Tailwind CSS.
- Composants : Shadcn/UI.
- Formulaires : React Hook Form.
- Validation : Zod.
- Gestion des données côté client : TanStack React Query uniquement lorsque nécessaire.

## 2.2. Architecture

L'application doit être développée dans un seul projet Next.js.

Il ne faut pas créer de frontend et de backend séparés.

Architecture souhaitée : **monolithe modulaire full-stack**.

Les composants serveur, Server Actions et Route Handlers doivent être utilisés selon les besoins :
- Server Components par défaut pour l'affichage.
- Server Actions pour les mutations internes.
- Route Handlers pour les endpoints HTTP, intégrations externes et traitements planifiés.

Les règles métier doivent être centralisées dans des services métier réutilisables.

## 2.3. Technologies et approches interdites

Ne pas utiliser :
- Firebase.
- Supabase.
- Express.
- NestJS.
- Prisma.
- Une architecture microservices.
- Une API backend séparée.

Better Auth doit gérer l'authentification, les sessions et les comptes. Ne pas créer un second système d'authentification concurrent.

---

# 3. Utilisateurs et rôles

## 3.1. Utilisateur

Un utilisateur peut :
- Créer plusieurs tontines.
- Être invité dans plusieurs tontines.
- Être administrateur d'une tontine.
- Être simple membre d'une autre tontine.
- Détenir plusieurs tickets dans une même tontine lorsque cela est autorisé.

## 3.2. Administrateur d'une tontine

Le créateur de la tontine est automatiquement son administrateur.

Dans le MVP, une tontine possède un seul administrateur.

Il peut :
- Configurer la tontine.
- Inviter des membres.
- Accepter ou refuser les demandes d'adhésion.
- Créer et attribuer les tickets de participation.
- Définir le nombre maximal de tickets par membre.
- Gérer les membres.
- Consulter les paiements de tous les tickets.
- Valider ou rejeter les déclarations de paiement.
- Organiser les tours de main.
- Consulter les statistiques.
- Mettre en pause ou clôturer la tontine.

L'administrateur participe lui-même à la tontine et peut détenir plusieurs tickets dans les mêmes conditions que les autres membres.

## 3.3. Membre

Un membre peut :
- Consulter les informations de la tontine.
- Consulter la liste des membres.
- Consulter ses propres tickets.
- Consulter ses obligations de paiement par ticket.
- Déclarer ses paiements.
- Consulter son historique de paiement.
- Consulter la rotation et ses propres tours de main.
- Recevoir des notifications.

Un membre ne peut pas :
- Créer lui-même un ticket.
- Modifier le nombre de tickets qui lui sont attribués.
- Modifier les paramètres de la tontine.
- Inviter ou supprimer des membres.
- Consulter les déclarations de paiement individuelles des autres membres.
- Valider les paiements.

Toutes les autorisations doivent être vérifiées côté serveur.

---

# 4. Navigation générale

La navigation principale comporte cinq entrées :

1. Accueil
2. Tontines
3. Paiements
4. Alertes
5. Profil

Sur ordinateur :
- Sidebar latérale.

Sur mobile :
- Navigation inférieure.

La création d'une tontine doit être accessible depuis l'accueil ou la rubrique Tontines.

Ne pas ajouter de bouton central permanent de création.

---

# 5. Gestion des tontines

## 5.1. Création d'une tontine

Informations à renseigner :

- Nom de la tontine.
- Description facultative.
- Montant de cotisation par ticket.
- Devise : FCFA (XOF).
- Fréquence de cotisation.
- Date de début prévue.
- Règles de participation.
- Paramètres de rotation.
- Autorisation ou non des tickets multiples.
- Nombre maximal de tickets par membre lorsque les tickets multiples sont autorisés.

Fréquences disponibles :
- Hebdomadaire.
- Deux fois par semaine.
- Mensuelle.
- Annuelle.

Pour une fréquence deux fois par semaine, l'administrateur sélectionne deux jours distincts.

Le système doit gérer correctement les fins de mois et les années bissextiles.

## 5.2. Paramètres des tickets

Deux paramètres sont ajoutés à la configuration de la tontine.

### Autoriser les tickets multiples

Champ :
`multiple_tickets_allowed`

Valeurs :
- true : plusieurs tickets autorisés.
- false : un seul ticket par membre.

Par défaut : false.

### Nombre maximal de tickets par membre

Champ :
`max_tickets_per_member`

Valeur entière positive.

Ce paramètre est applicable uniquement lorsque les tickets multiples sont autorisés.

Exemple :
- Autorisation des tickets multiples : oui.
- Maximum : 3 tickets par membre.

Dans cet exemple, chaque membre peut détenir entre un et trois tickets.

Le nombre maximal ne peut pas être inférieur à un.

## 5.3. Statuts d'une tontine

- DRAFT : préparation.
- ACTIVE : en cours.
- PAUSED : suspendue.
- COMPLETED : terminée.

Une tontine en préparation peut être modifiée.

Une tontine active ne peut plus recevoir de nouveaux tickets.

Une tontine en pause conserve ses membres, tickets, paiements et rotations, mais ne génère pas de nouvelles obligations pendant la suspension.

La clôture conserve l'historique.

---

# 6. Gestion des membres et des tickets

## 6.1. Principe de séparation

Il est obligatoire de distinguer le membre du ticket.

Un membre représente une personne physique.

Un ticket représente une participation individuelle de cette personne dans la tontine.

Un membre ne doit avoir qu'une seule adhésion dans une même tontine, mais cette adhésion peut comporter plusieurs tickets.

Exemple :

Ahmed est inscrit une seule fois dans la tontine KOTI.

Il possède :
- Ticket 001.
- Ticket 002.
- Ticket 003.

Il reste un seul membre dans la liste des membres, mais détient trois participations.

## 6.2. Création des tickets

La création des tickets est exclusivement réservée à l'administrateur.

Lorsqu'un membre est accepté :
- Un premier ticket lui est attribué.
- L'administrateur peut ensuite lui attribuer des tickets supplémentaires si les règles de la tontine le permettent.

Le membre ne peut jamais créer lui-même un ticket.

L'administrateur doit pouvoir attribuer un ticket supplémentaire depuis la fiche du membre.

Avant de confirmer, le système vérifie :
1. Que la tontine est encore en statut DRAFT.
2. Que les tickets multiples sont autorisés.
3. Que le membre est actif.
4. Que le nombre maximal de tickets n'est pas dépassé.
5. Que le ticket demandé n'existe pas déjà.

Si l'une de ces conditions n'est pas satisfaite, l'opération est refusée côté serveur.

## 6.3. Règle de démarrage

**Aucun ticket ne peut être créé après le démarrage de la tontine.**

Au passage de la tontine en statut ACTIVE :
- La liste des membres est figée pour le cycle.
- Le nombre de tickets de chaque membre est figé.
- Le nombre total de tickets est calculé.
- Les obligations de cotisation sont générées pour chaque ticket.
- La rotation est établie à partir de l'ensemble des tickets.

Il ne doit pas exister de mécanisme permettant de contourner cette règle depuis l'interface ou directement par une requête serveur.

## 6.4. Suppression et désactivation

Avant le démarrage :
- L'administrateur peut supprimer un ticket.
- La suppression doit être enregistrée dans les journaux d'audit.
- La numérotation des autres tickets ne doit pas être réutilisée.

Après le démarrage :
- Aucun ticket ne peut être supprimé.
- Aucun ticket ne peut être ajouté.
- Les tickets restent consultables dans l'historique.

Pour une éventuelle désactivation exceptionnelle après démarrage, prévoir une procédure administrative contrôlée dans une évolution ultérieure. Ne pas l'inclure dans les fonctionnalités standards du MVP.

## 6.5. Numérotation

Chaque ticket reçoit un numéro unique dans sa tontine.

Exemple :
- TKT-001.
- TKT-002.
- TKT-003.

La numérotation doit être générée côté serveur et ne jamais être réutilisée après suppression d'un ticket avant démarrage.

---

# 7. Cotisations et obligations de paiement

## 7.1. Montant par ticket

Le montant de cotisation est défini au niveau de la tontine.

Tous les tickets d'une même tontine ont obligatoirement le même montant de cotisation.

Il n'est pas possible de définir un montant différent par membre ou par ticket dans le MVP.

Exemple :
- Cotisation par ticket : 10 000 FCFA.
- Ahmed possède deux tickets.
- Ahmed doit payer 20 000 FCFA par période.

## 7.2. Calcul des cotisations

Formule :

`Cotisation membre par période = Nombre de tickets actifs × Montant par ticket`

Exemple :

| Membre | Tickets | Cotisation par ticket | Total |
|---|---:|---:|---:|
| Ahmed | 2 | 10 000 | 20 000 |
| Awa | 1 | 10 000 | 10 000 |
| Koffi | 3 | 10 000 | 30 000 |
| Mariam | 1 | 10 000 | 10 000 |
| Yao | 1 | 10 000 | 10 000 |
| **Total** | **8** | | **80 000** |

Le montant total à collecter par période est donc égal au nombre total de tickets multiplié par la cotisation par ticket.

## 7.3. Génération des obligations

Chaque période de cotisation génère une obligation pour chaque ticket.

Exemple :
- 8 tickets.
- 10 000 FCFA par ticket.
- 1 période.

Le système crée 8 obligations de 10 000 FCFA, soit 80 000 FCFA au total.

Il ne faut pas créer une seule obligation globale de 80 000 FCFA pour un membre possédant plusieurs tickets.

Chaque obligation doit être rattachée à un ticket précis.

La génération doit être idempotente : une même période ne doit jamais générer deux fois les mêmes obligations.

Une contrainte d'unicité doit être appliquée sur le couple :
`(ticket_id, contribution_period_id)`.

## 7.4. Statuts des obligations

Les statuts de l'obligation doivent être distincts de ceux d'une déclaration de paiement.

Statuts possibles d'une obligation :
- PENDING.
- PAID.
- LATE.

Le statut LATE peut être calculé à partir de la date d'échéance et de l'absence de paiement validé.

Les déclarations de paiement disposent de leurs propres statuts :
- DECLARED.
- VALIDATED.
- REJECTED.

## 7.5. Déclaration de paiement

Un membre déclare un paiement pour une obligation donnée.

Il doit pouvoir :
- Sélectionner le ticket concerné.
- Sélectionner l'obligation.
- Indiquer le montant.
- Indiquer le moyen de paiement.
- Ajouter une référence facultative.
- Joindre un justificatif facultatif.

Moyens de paiement :
- Espèces.
- Mobile Money.
- Virement.
- Autre.

Dans le MVP, KOTI ne réalise aucun transfert d'argent.

Une déclaration peut être :
- Validée par l'administrateur.
- Rejetée par l'administrateur avec un motif.

Une déclaration rejetée reste conservée dans l'historique.

Le membre peut effectuer une nouvelle déclaration pour la même obligation après un rejet.

Le MVP considère une cotisation intégrale par ticket. Les paiements partiels ne sont pas pris en charge.

---

# 8. Gestion des tours de main et de la rotation

## 8.1. Principe fondamental

La rotation doit être organisée par ticket, et non par membre.

Un ticket donne droit à un tour de main.

Un membre possédant trois tickets bénéficie donc de trois tours de main au cours du cycle.

Deux tickets appartenant à la même personne doivent être considérés comme deux participations distinctes.

## 8.2. Nombre de tours

Le nombre total de tours de main d'un cycle est égal au nombre total de tickets.

Exemple :
- 5 membres.
- 8 tickets.
- 8 tours de main.

Le montant distribué à chaque tour correspond au montant total collecté pour une période, sous réserve des règles de fonctionnement de la tontine.

Si la tontine comporte 8 tickets à 10 000 FCFA, le montant théorique collecté par période est de 80 000 FCFA.

## 8.3. Organisation de la rotation

L'administrateur configure l'ordre de passage des tickets.

L'interface doit afficher :
- Le numéro du tour.
- Le membre bénéficiaire.
- Le numéro du ticket.
- La date prévue.
- Le statut du tour.

Exemple :

| Tour | Bénéficiaire | Ticket |
|---|---|---|
| 1 | Ahmed | TKT-001 |
| 2 | Awa | TKT-002 |
| 3 | Koffi | TKT-003 |
| 4 | Mariam | TKT-004 |
| 5 | Ahmed | TKT-005 |
| 6 | Koffi | TKT-006 |
| 7 | Yao | TKT-007 |
| 8 | Koffi | TKT-008 |

L'ordre est librement défini par l'administrateur avant le démarrage.

## 8.4. Modification de la rotation

Avant le démarrage :
- L'administrateur peut réorganiser librement les tickets.
- Chaque ticket doit apparaître exactement une fois dans le cycle.
- Chaque position doit être unique.

Après le démarrage :
- La rotation est verrouillée.
- Toute modification exceptionnelle doit être contrôlée et journalisée.
- Ne pas permettre la réorganisation libre depuis l'interface standard.

## 8.5. Statuts des tours

- UPCOMING.
- CURRENT.
- COMPLETED.
- CANCELLED.

## 8.6. Cycles de rotation

La modélisation doit prévoir une entité `rotation_cycles`.

Chaque cycle contient plusieurs `rotation_slots`.

Un cycle doit garantir :
- Une seule occurrence de chaque ticket.
- Une seule position par tour.
- Aucun ticket absent de la rotation.

Pour le MVP, un cycle initial est créé au démarrage de la tontine.

La structure doit rester compatible avec une éventuelle gestion de plusieurs cycles dans une version future.

---

# 9. Invitations

L'administrateur peut inviter un utilisateur par email ou téléphone.

L'invité peut recevoir un lien sécurisé, créer son compte ou se connecter, puis accepter ou refuser l'invitation.

Statuts :
- PENDING.
- ACCEPTED.
- REFUSED.
- EXPIRED.
- CANCELLED.

Le créateur est automatiquement membre et administrateur de sa tontine.

Une invitation acceptée crée une seule adhésion.

La gestion des tickets est ensuite assurée par l'administrateur selon les règles définies dans la section 6.

Les invitations doivent utiliser des jetons aléatoires, non prédictibles, stockés sous forme de hash et associés à une date d'expiration.

Éviter les doublons d'invitation et les adhésions multiples d'un même utilisateur à une tontine.

---

# 10. Tableau de bord global

L'accueil affiche les tontines auxquelles l'utilisateur participe.

Pour chaque tontine :
- Nom.
- Statut.
- Rôle de l'utilisateur.
- Nombre de membres.
- Nombre total de tickets.
- Nombre de tickets détenus par l'utilisateur.
- Montant de cotisation par ticket.
- Montant total à payer par période pour l'utilisateur.
- Fréquence.
- Prochaine échéance.

L'utilisateur peut ouvrir chaque tontine depuis cette liste.

---

# 11. Espace de gestion d'une tontine

Navigation interne :
1. Vue d'ensemble.
2. Membres.
3. Paiements.
4. Tours de main / Rotation.
5. Paramètres.

## 11.1. Vue d'ensemble

Afficher :
- Nombre de membres.
- Nombre total de tickets.
- Montant de cotisation par ticket.
- Montant total attendu par période.
- Montant validé.
- Montant en attente.
- Nombre de tickets en retard.
- Prochain tour de main.

## 11.2. Membres

L'administrateur voit :
- Les informations du membre.
- Son nombre de tickets.
- Sa cotisation totale par période.
- Ses statuts de participation.

En ouvrant la fiche d'un membre, l'administrateur peut consulter ses tickets.

Le membre voit uniquement ses propres tickets et les informations autorisées.

La liste des membres ne doit pas afficher un membre plusieurs fois parce qu'il détient plusieurs tickets.

## 11.3. Paiements

L'administrateur dispose d'une vue globale par membre et par ticket.

Il peut consulter :
- Les obligations par ticket.
- Les déclarations.
- Les justificatifs.
- Les paiements validés.
- Les retards.

Le membre consulte uniquement ses propres obligations, déclarations et historiques.

## 11.4. Rotation

L'administrateur visualise et organise la rotation par ticket.

Le membre peut consulter la rotation et identifier ses propres tickets ainsi que leurs dates de passage.

## 11.5. Paramètres

Les paramètres comprennent :
- Informations générales.
- Montant de cotisation par ticket.
- Fréquence.
- Date de démarrage.
- Autorisation des tickets multiples.
- Nombre maximal de tickets par membre.
- Configuration de la rotation.
- Statut de la tontine.

Les paramètres qui influencent les obligations financières et la rotation doivent être verrouillés après démarrage, selon les règles définies.

---

# 12. Page globale des paiements

Cette rubrique agrège les obligations personnelles de l'utilisateur dans toutes ses tontines.

Sections :
- À payer.
- En attente de validation.
- Historique.

Chaque ligne doit préciser :
- La tontine.
- Le ticket.
- La période.
- Le montant.
- L'échéance.
- Le statut.

L'utilisateur doit pouvoir identifier précisément les tickets concernés par ses paiements.

---

# 13. Notifications

Notifications en application :
- Invitation reçue.
- Invitation acceptée ou refusée.
- Nouvelle échéance.
- Paiement déclaré.
- Paiement validé.
- Paiement rejeté.
- Retard de paiement.
- Tour de main prochain.

Les notifications doivent être stockées en base de données avec un statut lu/non lu.

Les traitements planifiés doivent être idempotents afin d'éviter les notifications en double.

Prévoir une abstraction pour les emails transactionnels.

---

# 14. Profil utilisateur

Informations :
- Nom.
- Prénom.
- Email.
- Téléphone.
- Photo facultative.
- Préférences de notification.

L'authentification et les sessions sont gérées par Better Auth.

---

# 15. Modèle de données PostgreSQL

Les tables suivantes constituent le modèle fonctionnel du MVP.

## 15.1. Authentification

Utiliser les tables générées et attendues par la version installée de Better Auth :
- user.
- session.
- account.
- verification.

Ne pas dupliquer leur responsabilité.

## 15.2. Profils

`user_profiles`
- id.
- user_id.
- first_name.
- last_name.
- phone.
- avatar_url.
- created_at.
- updated_at.

`user_id` référence l'utilisateur Better Auth.

## 15.3. Tontines

`tontines`
- id.
- name.
- description.
- creator_id.
- contribution_amount.
- currency.
- frequency.
- frequency_config.
- start_date.
- status.
- multiple_tickets_allowed.
- max_tickets_per_member.
- started_at.
- created_at.
- updated_at.

Règles :
- `contribution_amount` est un entier positif.
- `currency` vaut XOF dans le MVP.
- `multiple_tickets_allowed` vaut false par défaut.
- `max_tickets_per_member` vaut 1 par défaut.
- Si les tickets multiples sont désactivés, le maximum est obligatoirement égal à 1.
- Le montant de cotisation est unique pour tous les tickets de la tontine.

`frequency_config` doit être validé avec des schémas Zod précis selon la fréquence choisie.

## 15.4. Membres

`tontine_members`
- id.
- tontine_id.
- user_id.
- role.
- status.
- joined_at.
- created_at.
- updated_at.

Contraintes :
- Un utilisateur ne peut avoir qu'une adhésion par tontine.
- Unicité `(tontine_id, user_id)`.
- Un membre peut posséder plusieurs tickets.
- Les historiques sont conservés après départ ou exclusion.

## 15.5. Tickets

Nouvelle table obligatoire : `tontine_tickets`.

Champs :
- id.
- tontine_member_id.
- ticket_number.
- status.
- created_at.
- created_by.
- deleted_at.

Contraintes :
- Chaque ticket appartient à une seule adhésion.
- Le numéro est unique dans la tontine.
- Le nombre de tickets d'un membre ne peut pas dépasser le maximum défini.
- Un ticket ne peut être créé que par un administrateur.
- Un ticket ne peut être créé que lorsque la tontine est en statut DRAFT.
- La création doit être contrôlée côté serveur dans une transaction.
- Ne pas réutiliser les numéros de tickets supprimés avant démarrage.

Statut :
- ACTIVE.
- CANCELLED.

Pour les suppressions autorisées avant démarrage, conserver une trace d'audit. Le ticket ne doit pas être physiquement supprimé si cela compromet la traçabilité.

## 15.6. Invitations

`invitations`
- id.
- tontine_id.
- email.
- phone.
- token_hash.
- status.
- expires_at.
- accepted_at.
- created_by.
- created_at.

## 15.7. Périodes de cotisation

`contribution_periods`
- id.
- tontine_id.
- period_number.
- start_date.
- due_date.
- status.
- created_at.

Une période appartient à une seule tontine.

## 15.8. Obligations

`contribution_obligations`
- id.
- ticket_id.
- contribution_period_id.
- amount_due.
- status.
- due_date.
- paid_at.
- created_at.
- updated_at.

Contrainte unique :
`(ticket_id, contribution_period_id)`.

Chaque ticket doit avoir une obligation pour chaque période applicable.

## 15.9. Paiements

`payments`
- id.
- obligation_id.
- declared_by.
- amount.
- payment_method.
- reference.
- status.
- rejection_reason.
- declared_at.
- validated_at.
- validated_by.
- created_at.
- updated_at.

Statuts :
- DECLARED.
- VALIDATED.
- REJECTED.

Conserver les déclarations rejetées.

Une obligation peut avoir plusieurs déclarations successives, notamment après un rejet. Une obligation ne peut être considérée comme payée qu'après validation d'une déclaration conforme.

## 15.10. Pièces justificatives

`payment_attachments`
- id.
- payment_id.
- file_name.
- file_path.
- mime_type.
- file_size.
- uploaded_at.

Les fichiers doivent être stockés dans un stockage privé adapté, et non directement dans PostgreSQL.

L'accès aux justificatifs doit être soumis aux autorisations de la tontine.

## 15.11. Cycles de rotation

`rotation_cycles`
- id.
- tontine_id.
- cycle_number.
- status.
- started_at.
- completed_at.
- created_at.

Un cycle appartient à une tontine.

## 15.12. Tours de main

`rotation_slots`
- id.
- rotation_cycle_id.
- ticket_id.
- position.
- scheduled_date.
- status.
- completed_at.
- created_at.
- updated_at.

Contraintes :
- Un ticket apparaît une seule fois par cycle.
- Une position ne peut être attribuée qu'une fois par cycle.
- Un cycle doit contenir tous les tickets actifs au démarrage.

Contraintes uniques :
- `(rotation_cycle_id, ticket_id)`.
- `(rotation_cycle_id, position)`.

## 15.13. Notifications

`notifications`
- id.
- user_id.
- tontine_id.
- type.
- title.
- message.
- read_at.
- created_at.

## 15.14. Audit

`audit_logs`
- id.
- tontine_id.
- actor_id.
- entity_type.
- entity_id.
- action.
- old_values.
- new_values.
- created_at.

Journaliser notamment :
- Création et suppression d'un ticket avant démarrage.
- Démarrage d'une tontine.
- Modification de la rotation avant démarrage.
- Validation ou rejet d'un paiement.
- Modification des paramètres.
- Pause et clôture d'une tontine.

---

# 16. Règles de cohérence et sécurité

Les règles suivantes sont obligatoires :

1. Un utilisateur ne possède qu'une adhésion par tontine.
2. Une adhésion peut posséder un ou plusieurs tickets.
3. Un ticket appartient à une seule adhésion.
4. Tous les tickets d'une tontine ont le même montant de cotisation.
5. Seul l'administrateur peut créer des tickets.
6. Les tickets supplémentaires ne sont autorisés qu'avant le démarrage.
7. Le nombre de tickets ne peut dépasser le maximum configuré.
8. Chaque ticket génère une obligation par période applicable.
9. Chaque ticket possède un tour de main par cycle.
10. Le nombre de tours est égal au nombre de tickets du cycle.
11. Les paiements sont rattachés aux obligations, et indirectement aux tickets.
12. Un membre ne peut consulter que ses propres paiements et obligations.
13. L'administrateur peut consulter les paiements de tous les membres.
14. Les contrôles d'autorisation sont effectués côté serveur.
15. Les opérations sensibles doivent être réalisées dans des transactions PostgreSQL.
16. Les traitements de génération d'obligations et de notifications doivent être idempotents.
17. Les montants financiers sont stockés en entiers, jamais en nombres flottants.
18. Les dates métier sont gérées avec cohérence dans le fuseau `Africa/Abidjan`.

---

# 17. Interface et expérience utilisateur

L'interface doit être moderne, sobre, intuitive et ergonomique.

Éviter les interfaces surchargées, les tableaux inutilement complexes et les composants décoratifs sans utilité.

## 17.1. Gestion des membres

La liste des membres affiche une personne une seule fois.

Colonnes possibles :
- Nom.
- Contact.
- Rôle.
- Nombre de tickets.
- Cotisation totale par période.
- Statut.

La fiche membre affiche les tickets associés.

## 17.2. Attribution de tickets

Dans la fiche d'un membre, l'administrateur dispose d'une action :

`Ajouter un ticket`

Cette action est visible uniquement :
- Pour l'administrateur.
- Lorsque la tontine est en préparation.
- Lorsque les tickets multiples sont autorisés.
- Lorsque le plafond n'est pas atteint.

Une confirmation affiche :
- Le membre concerné.
- Le nombre de tickets actuel.
- Le nombre de tickets après ajout.
- La cotisation totale par période après ajout.

Exemple :

Nombre de tickets actuel : 1.

Nouveau nombre de tickets : 2.

Cotisation par ticket : 10 000 FCFA.

Nouvelle cotisation totale : 20 000 FCFA.

## 17.3. Fiche membre

Afficher un bloc « Mes tickets » ou « Tickets du membre ».

Chaque ticket présente :
- Son numéro.
- Son statut.
- Sa prochaine échéance.
- Son état de paiement.
- Son tour de main.

Afficher également :
- Nombre total de tickets.
- Cotisation par ticket.
- Cotisation totale par période.

## 17.4. Paiements

Les obligations doivent être identifiables par ticket.

Exemple :

| Ticket | Période | Montant | Statut |
|---|---|---:|---|
| TKT-001 | Semaine 1 | 10 000 | Payé |
| TKT-002 | Semaine 1 | 10 000 | En attente |

## 17.5. Rotation

La liste de rotation doit afficher les tickets et les noms des membres.

Si un membre détient plusieurs tickets, son nom apparaît plusieurs fois, avec un numéro de ticket distinct.

Ne pas fusionner ses tours de main.

---

# 18. Épics de développement

## EPIC 1 — Initialisation du projet
- Création du projet Next.js.
- Configuration TypeScript.
- Tailwind CSS.
- Shadcn/UI.
- Configuration PostgreSQL.
- Configuration Drizzle.
- Variables d'environnement.
- Structure modulaire.

## EPIC 2 — Authentification
- Installation de Better Auth.
- Inscription.
- Connexion.
- Déconnexion.
- Gestion de session.
- Protection des routes.

## EPIC 3 — Modèle de données
- Schéma Better Auth.
- Profils.
- Tontines.
- Membres.
- Tickets.
- Invitations.
- Périodes.
- Obligations.
- Paiements.
- Cycles de rotation.
- Tours de main.
- Notifications.
- Audit.

## EPIC 4 — Navigation et interface
- Layout général.
- Sidebar desktop.
- Navigation mobile.
- Accueil.
- Profil.
- États de chargement et erreurs.
- Interfaces responsive.

## EPIC 5 — Gestion des tontines
- Création.
- Configuration.
- Modification avant démarrage.
- Paramètres de fréquence.
- Paramètres des tickets.
- Pause et clôture.

## EPIC 6 — Gestion des membres et tickets
- Invitation.
- Acceptation et refus.
- Création de l'adhésion.
- Attribution du ticket initial.
- Création de tickets supplémentaires par l'administrateur.
- Vérification du plafond.
- Verrouillage des tickets au démarrage.
- Consultation des tickets.

## EPIC 7 — Tableau de bord
- Liste des tontines.
- Nombre de membres.
- Nombre de tickets.
- Cotisation par ticket.
- Cotisation personnelle totale.
- Prochaines échéances.

## EPIC 8 — Périodes et obligations
- Calcul des périodes.
- Génération des obligations par ticket.
- Contrôle des doublons.
- Gestion des échéances.
- Calcul des retards.

## EPIC 9 — Paiements
- Déclaration.
- Ajout de justificatif.
- Validation.
- Rejet avec motif.
- Historique.
- Vue par ticket.

## EPIC 10 — Rotation
- Création du cycle.
- Génération des tours par ticket.
- Réorganisation avant démarrage.
- Verrouillage au démarrage.
- Suivi des tours.
- Historique.

## EPIC 11 — Notifications
- Notifications internes.
- Gestion lu/non lu.
- Rappels d'échéances.
- Notifications de paiement.
- Notifications de rotation.

## EPIC 12 — Sécurité et audit
- Isolation des données par tontine.
- Contrôles d'accès.
- Journalisation.
- Validation serveur.
- Protection des pièces justificatives.

## EPIC 13 — Tests et recette
- Tests unitaires.
- Tests d'intégration.
- Tests de sécurité.
- Tests des règles métier.
- Tests responsive.
- Tests des parcours complets.

## EPIC 14 — Préparation de la production
- Documentation.
- Migrations.
- Variables d'environnement.
- README.
- Configuration du déploiement.
- Configuration des traitements planifiés.

---

# 19. Scénarios de validation obligatoires

Le développement ne sera pas considéré comme terminé sans les tests suivants.

## Scénario 1 — Tontine sans tickets multiples

- L'administrateur crée une tontine.
- Il désactive les tickets multiples.
- Il ajoute plusieurs membres.
- Chaque membre reçoit un ticket.
- Le système refuse toute création de ticket supplémentaire.

Résultat attendu : chaque membre détient exactement un ticket.

## Scénario 2 — Tontine avec tickets multiples

- L'administrateur crée une tontine.
- Il active les tickets multiples.
- Il fixe un maximum de 3 tickets.
- Il ajoute des membres.
- Il attribue deux tickets à Ahmed.
- Il attribue trois tickets à Koffi.

Résultat attendu :
- Ahmed reste un seul membre avec deux tickets.
- Koffi reste un seul membre avec trois tickets.
- Les autres membres restent chacun une seule fois dans la liste.

## Scénario 3 — Dépassement du plafond

- Le maximum est fixé à 3.
- Ahmed possède déjà 3 tickets.
- L'administrateur tente d'en ajouter un quatrième.

Résultat attendu : opération refusée côté serveur.

## Scénario 4 — Cotisation par ticket

- Cotisation par ticket : 10 000 FCFA.
- Ahmed possède deux tickets.
- Koffi possède trois tickets.

Résultat attendu :
- Ahmed doit 20 000 FCFA par période.
- Koffi doit 30 000 FCFA par période.
- Chaque obligation est enregistrée séparément.

## Scénario 5 — Paiements par ticket

- Ahmed déclare le paiement de son ticket 001.
- L'administrateur valide.
- Le ticket 002 reste impayé.

Résultat attendu : le ticket 001 est payé, le ticket 002 reste en attente.

## Scénario 6 — Rotation par ticket

- La tontine comporte 8 tickets.
- L'administrateur organise la rotation.

Résultat attendu :
- 8 tours de main sont générés.
- Chaque ticket apparaît une seule fois.
- Ahmed peut apparaître deux fois s'il détient deux tickets.
- Koffi peut apparaître trois fois s'il en détient trois.

## Scénario 7 — Verrouillage au démarrage

- La tontine est en préparation.
- L'administrateur ajoute des tickets.
- Il démarre la tontine.
- Il tente ensuite d'ajouter un ticket supplémentaire.

Résultat attendu : création refusée côté serveur.

## Scénario 8 — Isolation des données

- Ahmed est membre de plusieurs tontines.
- Il possède plusieurs tickets dans l'une d'elles.
- Il consulte ses paiements.

Résultat attendu : il ne peut consulter que ses propres obligations et déclarations, dans les tontines auxquelles il appartient.

## Scénario 9 — Génération des obligations

- Une tontine comporte 8 tickets.
- Une période de cotisation est créée.
- Le traitement de génération est exécuté deux fois.

Résultat attendu :
- 8 obligations sont créées.
- La seconde exécution ne crée aucun doublon.

---

# 20. Livrables attendus

L'agent de développement doit fournir :

- Le code source complet.
- Le schéma de données Drizzle.
- Les migrations PostgreSQL.
- Les composants d'interface.
- Les services métier.
- Les Server Actions et Route Handlers nécessaires.
- Les tests unitaires et d'intégration.
- Les contrôles d'autorisation.
- Le fichier `.env.example`.
- Un README complet.
- Les instructions d'installation et de lancement.
- La documentation des règles métier importantes.

---

# 21. Ordre de développement recommandé

Développer progressivement, en validant chaque étape avant de passer à la suivante.

1. Initialisation Next.js et base PostgreSQL.
2. Better Auth.
3. Schéma de données et migrations.
4. Layout et navigation.
5. Création et configuration des tontines.
6. Gestion des invitations et membres.
7. Gestion des tickets de participation multiples.
8. Démarrage et verrouillage des tontines.
9. Génération des périodes et obligations.
10. Déclarations et validations de paiement.
11. Cycles et tours de main.
12. Notifications.
13. Sécurité, tests et recette.
14. Préparation de la production.

Ne pas développer les écrans uniquement avec des données fictives. Chaque fonctionnalité doit être reliée à la base de données et aux règles métier réelles.

---

# 22. Critères de réussite du MVP

KOTI V1 est considéré comme fonctionnel lorsqu'un utilisateur peut :

1. Créer une tontine.
2. Définir ses règles et paramètres.
3. Autoriser ou non les tickets multiples.
4. Inviter des membres.
5. Attribuer un ou plusieurs tickets à chaque membre, dans les limites définies.
6. Démarrer la tontine et figer les participations.
7. Générer les obligations de cotisation par ticket.
8. Déclarer les paiements par ticket.
9. Faire valider ou rejeter les déclarations.
10. Organiser une rotation où chaque ticket possède son propre tour de main.
11. Suivre les paiements, retards et tours de main.
12. Consulter l'historique complet de la tontine.

**Règle métier centrale à respecter dans toute l'application : un membre est une personne ; un ticket est une participation ; un ticket génère une obligation de cotisation par période et donne droit à un tour de main par cycle.**