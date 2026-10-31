# PRD — KOTI
## Plateforme Web de Gestion de Tontines

**Version :** 1.1 — MVP  
**Nom du produit :** KOTI (nom provisoire)  
**Type :** Application Web Full-Stack responsive  
**Développement :** IA de Vibecoding — Antigravity  
**Architecture :** Next.js Full-Stack — Monolithe modulaire  
**Langage :** TypeScript  
**Framework :** Next.js avec App Router  
**Authentification :** Better Auth  
**ORM :** Drizzle ORM  
**Base de données :** PostgreSQL  
**UI :** Tailwind CSS + Shadcn/UI  
**Formulaires :** React Hook Form + Zod  
**Gestion des données côté client :** TanStack React Query si nécessaire  
**Langue :** Français  
**Devise par défaut :** FCFA (XOF)  
**Fuseau horaire :** Africa/Abidjan

---

# 0. INSTRUCTIONS GÉNÉRALES À L'IA DE VIBECODING

Tu interviens en qualité d'architecte logiciel senior, développeur full-stack Next.js et concepteur UX/UI.

Ta mission est de concevoir et développer KOTI, une plateforme web de gestion de tontines, en respectant strictement les spécifications fonctionnelles et techniques de ce document.

Ce PRD constitue la référence fonctionnelle et technique du projet.

## 0.1. Architecture technique obligatoire

L'application doit être développée avec une architecture Next.js Full-Stack.

**Il ne faut PAS créer deux applications séparées frontend et backend.**

Tout le code doit être organisé dans un seul projet Next.js.

Utiliser :

- Next.js App Router.
- React Server Components par défaut.
- Client Components uniquement lorsque l'interactivité le nécessite.
- Server Actions pour les mutations internes appropriées.
- Route Handlers pour les endpoints HTTP nécessaires.
- Better Auth pour l'authentification.
- Drizzle ORM pour les accès à PostgreSQL.
- PostgreSQL comme unique base de données principale.

Ne pas utiliser :

- Firebase.
- Supabase.
- Express.js.
- NestJS.
- Prisma.
- Un backend Node.js séparé.
- Une API REST séparée comme architecture principale.
- Une architecture microservices.

Les Server Actions et Route Handlers doivent être considérés comme des points d'entrée côté serveur. Ils doivent appeler les mêmes services métier afin d'éviter la duplication de logique.

## 0.2. Principes de développement

1. Respecter l'architecture monolithique modulaire.
2. Organiser le code par domaines métier.
3. Centraliser les règles métier dans des services côté serveur.
4. Séparer les composants UI, les services et les accès aux données.
5. Utiliser Drizzle pour toutes les interactions avec PostgreSQL.
6. Utiliser les migrations Drizzle pour faire évoluer la base.
7. Utiliser Zod pour valider les entrées côté serveur.
8. Utiliser Better Auth pour gérer les utilisateurs et les sessions.
9. Vérifier systématiquement les droits d'accès côté serveur.
10. Ne jamais faire confiance aux données envoyées par le navigateur.
11. Ne jamais exposer les secrets ou les accès à la base de données au client.
12. Préserver l'historique des opérations sensibles.
13. Utiliser des transactions PostgreSQL pour les opérations métier qui impliquent plusieurs écritures.
14. Prévoir des états de chargement, d'erreur, de succès et des états vides.
15. Développer un code maintenable, typé et documenté.

## 0.3. Méthode de travail

Ne pas développer toute l'application en une seule opération.

Procéder par étapes :

- Analyser le PRD.
- Définir l'architecture du projet.
- Définir le schéma de données.
- Mettre en place l'authentification.
- Développer les fonctionnalités par Epic.
- Tester chaque Epic avant de poursuivre.
- Corriger les anomalies.
- Documenter les décisions techniques.

Ne pas inventer de règles métier lorsque le PRD ne les définit pas.

Lorsqu'une ambiguïté empêche le développement correct d'une fonctionnalité, la signaler et proposer une décision explicite avant de l'implémenter.

Ne pas ajouter de fonctionnalités hors périmètre.

---

# 1. PRÉSENTATION DU PRODUIT

## 1.1. Vision

KOTI est une plateforme web permettant de créer, organiser et gérer des tontines.

Un utilisateur peut créer plusieurs tontines, inviter des participants et assurer le suivi des cotisations et des tours de main.

Il peut également rejoindre des tontines créées par d'autres utilisateurs.

La plateforme centralise :

- La création des tontines.
- La gestion des membres.
- Les invitations.
- Les échéances de cotisation.
- Les déclarations de paiement.
- La validation des paiements.
- Les tours de main.
- Les notifications.
- L'historique des opérations.

KOTI doit digitaliser la gestion des tontines traditionnelles tout en conservant leur fonctionnement simple.

## 1.2. Problématique

La gestion traditionnelle des tontines repose souvent sur des échanges WhatsApp, des tableaux Excel ou des carnets de suivi.

Cela entraîne :

- Des difficultés de suivi des cotisations.
- Un manque de visibilité sur les paiements.
- Des erreurs dans les calculs.
- Des difficultés à identifier les membres en retard.
- Une gestion manuelle des tours de main.
- Une absence d'historique centralisé.
- Une difficulté à gérer plusieurs tontines simultanément.

KOTI doit apporter une solution simple, centralisée et accessible.

## 1.3. Proposition de valeur

KOTI doit permettre à ses utilisateurs de :

- Gérer plusieurs tontines depuis un seul compte.
- Inviter facilement des participants.
- Suivre les cotisations.
- Connaître les paiements en attente et les retards.
- Définir l'ordre des tours de main.
- Consulter les historiques.
- Recevoir des rappels automatiques.

## 1.4. Cibles

- Familles.
- Groupes d'amis.
- Collègues.
- Associations informelles.
- Groupes communautaires.
- Organisateurs de tontines.

---

# 2. OBJECTIFS DU MVP

## 2.1. Objectif principal

Permettre à un utilisateur de créer et gérer une ou plusieurs tontines, d'inviter des membres et d'assurer le suivi des cotisations, des paiements et des tours de main.

## 2.2. Objectifs fonctionnels

Le MVP doit permettre de :

1. Créer un compte utilisateur.
2. Se connecter et gérer sa session.
3. Créer plusieurs tontines.
4. Modifier les paramètres d'une tontine.
5. Inviter des membres.
6. Accepter ou refuser une invitation.
7. Consulter ses tontines.
8. Accéder à un espace indépendant pour chaque tontine.
9. Gérer les échéances de cotisation.
10. Déclarer un paiement.
11. Valider ou refuser un paiement.
12. Consulter l'historique des paiements.
13. Définir l'ordre des tours de main.
14. Consulter le calendrier des distributions.
15. Recevoir des notifications.

## 2.3. Indicateurs de réussite

Le MVP sera considéré comme fonctionnel lorsque :

- Un utilisateur peut créer un compte.
- Il peut créer plusieurs tontines.
- Il peut inviter des membres.
- Les membres peuvent rejoindre les tontines.
- Les échéances sont générées correctement.
- Les paiements peuvent être déclarés et validés.
- Les tours de main sont configurables.
- Les données sont correctement cloisonnées.
- Les habilitations sont appliquées côté serveur.
- L'application est utilisable sur mobile et desktop.

---

# 3. PÉRIMÈTRE DU MVP

## 3.1. Fonctionnalités incluses

| Module | Fonctionnalités |
|---|---|
| Authentification | Inscription, connexion, déconnexion, récupération du mot de passe |
| Profil | Informations personnelles |
| Tableau de bord | Vue globale des tontines |
| Tontines | Création, consultation, modification, suspension et clôture |
| Invitations | Invitation, acceptation, refus |
| Membres | Liste, rôles et gestion |
| Cotisations | Génération des échéances |
| Paiements | Déclaration, validation, refus et historique |
| Tours de main | Ordre des bénéficiaires et calendrier |
| Notifications | Alertes et rappels |
| Sécurité | Permissions et cloisonnement |

## 3.2. Fonctionnalités exclues

Ne pas développer dans le MVP :

- Paiements Mobile Money intégrés.
- Orange Money.
- MTN Money.
- Wave.
- Portefeuille électronique.
- Transferts financiers entre utilisateurs.
- Prélèvements automatiques.
- Gestion bancaire.
- Calcul d'intérêts.
- Pénalités automatiques.
- Messagerie instantanée.
- Chat de groupe.
- Assistant IA.
- Application native Android/iOS.
- Multi-administrateurs.
- Gestion avancée de trésorerie.
- Abonnement payant.

Les paiements sont déclarés par les membres et validés par l'administrateur.

KOTI ne détient et ne transfère aucun fonds.

---

# 4. NAVIGATION ET ORGANISATION DE L'APPLICATION

## 4.1. Principe général

L'application possède deux niveaux de navigation :

1. Navigation globale.
2. Navigation interne à chaque tontine.

Chaque tontine constitue un espace indépendant.

## 4.2. Navigation globale

La navigation principale comporte cinq entrées :

| Menu | Description |
|---|---|
| Accueil | Tableau de bord global |
| Tontines | Liste et création des tontines |
| Paiements | Cotisations personnelles |
| Alertes | Notifications et invitations |
| Profil | Informations personnelles |

Sur desktop, utiliser une navigation latérale.

Sur mobile, utiliser une Bottom Navigation Bar.

Ne pas ajouter de bouton central permanent pour créer une tontine.

La création doit être accessible depuis Accueil ou Tontines.

## 4.3. Tableau de bord global

Afficher toutes les tontines auxquelles l'utilisateur participe.

Chaque carte contient :

- Nom de la tontine.
- Statut.
- Rôle de l'utilisateur.
- Nombre de membres.
- Montant de cotisation.
- Fréquence.
- Prochaine échéance.

Exemple :

```text
┌─────────────────────────────────────┐
│ Tontine Famille                     │
│                                     │
│ ● Active          Administrateur    │
│                                     │
│ 12 membres                          │
│ 10 000 FCFA / semaine               │
│                                     │
│ Prochaine échéance                  │
│ 02 Novembre 2026                    │
│                                     │
│              Ouvrir →               │
└─────────────────────────────────────┘
```

L'interface doit rester minimaliste et inspirée des tableaux de bord SaaS modernes.

## 4.4. Espace interne d'une tontine

Chaque tontine possède les menus suivants :

1. Vue d'ensemble.
2. Membres.
3. Paiements.
4. Tours de main.
5. Paramètres (administrateur uniquement).

Exemple de routes :

```text
/tontines
/tontines/[tontineId]
/tontines/[tontineId]/members
/tontines/[tontineId]/payments
/tontines/[tontineId]/rotations
/tontines/[tontineId]/settings
```

Toutes les routes internes doivent contrôler l'appartenance de l'utilisateur à la tontine.

---

# 5. UTILISATEURS ET HABILITATIONS

## 5.1. Utilisateur

Un utilisateur possède un compte unique.

Il peut créer plusieurs tontines et rejoindre plusieurs tontines.

Son rôle dépend de chaque tontine.

## 5.2. Administrateur

L'administrateur est le créateur de la tontine.

Il peut :

- Consulter la tontine.
- Modifier les paramètres autorisés.
- Inviter des membres.
- Consulter les membres.
- Retirer des membres selon les règles métier.
- Consulter les paiements de tous les membres.
- Valider ou refuser les paiements.
- Définir les tours de main.
- Consulter les statistiques.
- Suspendre ou clôturer la tontine.

L'administrateur cotise comme les autres membres.

## 5.3. Membre

Le membre peut :

- Consulter la tontine.
- Consulter les membres.
- Consulter ses propres échéances.
- Déclarer ses paiements.
- Consulter son historique.
- Consulter le calendrier des tours.
- Recevoir des notifications.

Il ne peut pas :

- Modifier les paramètres.
- Inviter des membres.
- Supprimer des membres.
- Voir les paiements individuels des autres membres.
- Valider des paiements.
- Modifier le calendrier des tours.

## 5.4. Matrice des permissions

| Action | Admin | Membre |
|---|---|---|
| Consulter la tontine | Oui | Oui |
| Modifier les paramètres | Oui | Non |
| Inviter | Oui | Non |
| Consulter les membres | Oui | Oui |
| Retirer un membre | Oui | Non |
| Voir tous les paiements | Oui | Non |
| Voir ses paiements | Oui | Oui |
| Déclarer un paiement | Oui | Oui |
| Valider un paiement | Oui | Non |
| Refuser un paiement | Oui | Non |
| Consulter les tours | Oui | Oui |
| Modifier les tours | Oui | Non |
| Consulter les statistiques globales | Oui | Non |
| Suspendre la tontine | Oui | Non |
| Clôturer la tontine | Oui | Non |

Les permissions doivent être vérifiées côté serveur, y compris dans les Server Actions et Route Handlers.

---

# 6. SPÉCIFICATIONS FONCTIONNELLES

# MODULE 01 — AUTHENTIFICATION AVEC BETTER AUTH

## 6.1. Objectif

Mettre en place une authentification sécurisée et fiable avec Better Auth.

Better Auth est la solution unique de gestion de l'authentification.

Ne pas développer un système JWT personnalisé en parallèle.

Ne pas stocker manuellement les mots de passe des utilisateurs.

## 6.2. Fonctionnalités

- Inscription par email et mot de passe.
- Connexion.
- Déconnexion.
- Gestion des sessions.
- Récupération du mot de passe.
- Vérification de l'email.
- Consultation du profil.
- Modification des informations personnelles.

## 6.3. Configuration Better Auth

Configurer Better Auth avec :

- PostgreSQL.
- Drizzle Adapter.
- Email/password authentication.
- Gestion des sessions.
- Cookies sécurisés.
- Vérification email.
- Récupération du mot de passe.
- Protection des routes privées.

Utiliser la configuration et les schémas de base de Better Auth.

Ne pas recréer manuellement les tables internes Better Auth si elles peuvent être générées correctement par son schéma ou son intégration Drizzle.

Les informations métier supplémentaires des utilisateurs doivent être ajoutées dans des tables complémentaires adaptées, sans altérer les champs gérés par Better Auth.

## 6.4. Inscription

Champs :

- Nom complet.
- Email.
- Téléphone.
- Mot de passe.
- Confirmation du mot de passe.

Après inscription :

1. Better Auth crée le compte.
2. L'utilisateur est enregistré en base.
3. L'email de vérification est envoyé.
4. Une session est créée selon la configuration.
5. L'utilisateur accède à son espace.

## 6.5. Connexion

- Email.
- Mot de passe.

Après authentification :

- Récupérer la session.
- Charger le profil utilisateur.
- Rediriger vers le tableau de bord.

## 6.6. Protection des routes

Utiliser les mécanismes serveur de Better Auth pour vérifier la session.

Les pages privées ne doivent pas dépendre uniquement d'une vérification côté client.

Chaque Server Action et Route Handler privé doit vérifier l'identité de l'utilisateur.

---

# MODULE 02 — GESTION DES TONTINES

## 6.7. Création d'une tontine

Champs :

| Champ | Type | Obligatoire |
|---|---|---|
| Nom | Texte | Oui |
| Description | Texte | Non |
| Montant de cotisation | Nombre entier | Oui |
| Fréquence | Enumération | Oui |
| Date de démarrage | Date | Oui |
| Nombre de membres prévu | Nombre | Oui |
| Mode de définition du tour | Enumération | Oui |

Fréquences :

- Hebdomadaire.
- Deux fois par semaine.
- Mensuelle.
- Annuelle.

Pour deux fois par semaine, sélectionner deux jours distincts.

Le système doit gérer les fins de mois et les années bissextiles.

Le nombre de membres prévu est distinct du nombre de membres réellement inscrits.

## 6.8. Création automatique de l'adhésion

À la création :

- Créer la tontine.
- Ajouter automatiquement le créateur comme membre.
- Attribuer le rôle ADMIN.
- Marquer l'adhésion comme acceptée.

Ces opérations doivent être exécutées dans une transaction Drizzle/PostgreSQL.

## 6.9. Statuts

- DRAFT.
- ACTIVE.
- PAUSED.
- COMPLETED.
- CANCELLED.

## 6.10. Modification

L'administrateur peut modifier :

- Nom.
- Description.
- Paramètres autorisés.

Les paramètres financiers structurants doivent être verrouillés ou soumis à des règles spécifiques après le démarrage.

Ne jamais modifier les échéances et paiements historiques à la suite d'un changement de paramètre.

## 6.11. Suspension et clôture

L'administrateur peut suspendre ou clôturer une tontine.

Une tontine suspendue ne doit pas générer de nouvelles échéances.

Une tontine clôturée reste consultable en lecture seule, sauf opérations explicitement autorisées.

---

# MODULE 03 — INVITATIONS ET MEMBRES

## 6.12. Invitation

L'administrateur peut inviter une personne par email ou téléphone.

Créer une invitation contenant :

- Tontine.
- Email ou téléphone.
- Jeton sécurisé.
- Date d'expiration.
- Statut.
- Administrateur émetteur.

Le lien doit fonctionner même si l'invité ne possède pas encore de compte.

Il devra s'authentifier avant de rejoindre la tontine.

Le jeton doit être aléatoire, non prédictible, stocké sous forme hachée et utilisable selon une durée définie.

## 6.13. Statuts

- PENDING.
- ACCEPTED.
- REFUSED.
- EXPIRED.
- CANCELLED.

## 6.14. Acceptation

Après authentification :

1. Vérifier le jeton.
2. Vérifier le contact.
3. Vérifier l'expiration.
4. Vérifier l'absence d'adhésion existante.
5. Créer l'adhésion.
6. Mettre à jour l'invitation.
7. Générer les échéances applicables.
8. Notifier l'administrateur.

Ces opérations doivent être transactionnelles.

## 6.15. Gestion des membres

Afficher :

- Nom.
- Photo.
- Rôle.
- Date d'adhésion.
- Statut.

L'administrateur peut retirer un membre selon les règles métier.

Conserver les anciennes adhésions et tous les historiques financiers.

---

# MODULE 04 — ESPACE DE GESTION D'UNE TONTINE

## 6.16. Vue d'ensemble

Administrateur :

- Nombre de membres.
- Cotisation.
- Fréquence.
- Total attendu.
- Total confirmé.
- Paiements en attente.
- Retards.
- Prochaine échéance.
- Prochain bénéficiaire.

Membre :

- Ses cotisations à payer.
- Ses paiements confirmés.
- Ses paiements en attente.
- Ses retards.
- Son prochain tour.

## 6.17. Cloisonnement

Toutes les données métier sont rattachées à une tontine.

Exemples :

```text
/tontines/[tontineId]/members
/tontines/[tontineId]/payments
/tontines/[tontineId]/rotations
```

Chaque requête doit contrôler :

- La session utilisateur.
- L'adhésion à la tontine.
- Le rôle.
- L'autorisation demandée.

Connaître l'identifiant d'une tontine ne donne jamais automatiquement accès à ses données.

---

# MODULE 05 — COTISATIONS ET PAIEMENTS

## 6.18. Principe

Chaque membre cotise selon les paramètres de la tontine.

Une échéance représente l'obligation de cotisation d'un membre pour une période.

Exemple :

- 10 membres.
- 10 000 FCFA par membre.
- Fréquence hebdomadaire.

Montant attendu par période : 100 000 FCFA.

## 6.19. Génération des échéances

Chaque échéance doit contenir :

- Tontine.
- Membre.
- Période.
- Montant attendu.
- Date d'échéance.
- Statut.

Règles :

- Une seule obligation par membre et période.
- Aucun doublon.
- Les nouveaux membres commencent selon leur date effective d'adhésion et les règles de la tontine.
- Les anciennes échéances ne sont pas modifiées automatiquement.

La génération doit être idempotente.

## 6.20. Statuts

- PENDING.
- DECLARED.
- PAID.
- REJECTED.
- LATE.

LATE est déterminé par la date d'échéance lorsque le paiement n'est pas confirmé.

## 6.21. Déclaration d'un paiement

Le membre sélectionne une échéance et déclare son paiement.

Champs :

- Montant.
- Date de paiement.
- Mode de paiement.
- Référence facultative.
- Commentaire.
- Justificatif facultatif.

Modes :

- Espèces.
- Mobile Money.
- Virement.
- Autre.

Après déclaration, le paiement passe à DECLARED.

Il n'est pas automatiquement considéré comme payé.

## 6.22. Validation par l'administrateur

L'administrateur peut :

- Consulter les déclarations.
- Vérifier les montants.
- Consulter les justificatifs.
- Valider.
- Refuser avec motif.

Après validation :

- Statut PAID.
- Enregistrement du validateur.
- Enregistrement de la date.
- Notification du membre.

Après refus :

- Statut REJECTED.
- Enregistrement du motif.
- Notification du membre.

Conserver les déclarations rejetées dans l'historique.

## 6.23. Page globale Paiements

Cette page centralise les obligations personnelles de l'utilisateur dans toutes ses tontines.

Onglets :

- À payer.
- En attente de validation.
- Historique.

Chaque ligne affiche :

- Tontine.
- Montant.
- Date d'échéance.
- Statut.
- Action.

L'utilisateur ne voit que ses propres paiements.

## 6.24. Vue administrateur

Afficher :

- Membre.
- Période.
- Montant.
- Date de déclaration.
- Statut.
- Action.

Indicateurs :

- Total attendu.
- Total confirmé.
- Nombre de paiements en attente.
- Nombre de retards.
- Membres à jour.

## 6.25. Vue membre

Le membre ne voit que :

- Ses échéances.
- Ses paiements.
- Ses statuts.
- Son historique.

---

# MODULE 06 — TOURS DE MAIN

## 6.26. Principe

Le tour de main correspond à l'ordre de passage des membres pour recevoir la cagnotte.

Le MVP gère l'ordre et le calendrier, sans réaliser de transfert d'argent.

## 6.27. Configuration

L'administrateur définit manuellement :

- Ordre de passage.
- Position.
- Bénéficiaire.
- Date prévue.

Il peut réorganiser les membres avant le démarrage du cycle.

Les modifications après démarrage doivent être contrôlées et historisées.

## 6.28. Vue membre

Afficher :

- Tous les bénéficiaires.
- Ordre de passage.
- Date prévue.
- Position personnelle.

## 6.29. Statuts

- UPCOMING.
- CURRENT.
- COMPLETED.
- CANCELLED.

Une seule position par membre et par cycle.

---

# MODULE 07 — NOTIFICATIONS

## 6.30. Types

- Invitation reçue.
- Invitation acceptée.
- Invitation refusée.
- Échéance à venir.
- Échéance dépassée.
- Paiement déclaré.
- Paiement validé.
- Paiement refusé.
- Tour de main approchant.

## 6.31. Notifications internes

Chaque notification contient :

- Utilisateur.
- Tontine éventuelle.
- Titre.
- Message.
- Type.
- Ressource associée.
- Date de création.
- Date de lecture.

Actions :

- Consulter.
- Marquer comme lue.
- Marquer toutes comme lues.

## 6.32. Automatisations

Prévoir un système de tâches planifiées côté serveur.

Il doit permettre :

- Rappels avant échéance.
- Alertes de retard.
- Notifications d'événements.
- Envoi d'emails transactionnels.

Les tâches planifiées doivent être idempotentes et protégées contre les exécutions multiples.

Ne pas dépendre d'un `setInterval` dans le navigateur pour exécuter les tâches métier.

---

# MODULE 08 — PROFIL UTILISATEUR

## 6.33. Informations

- Nom complet.
- Email.
- Téléphone.
- Photo.
- Date d'inscription.

## 6.34. Fonctionnalités

- Consulter.
- Modifier.
- Mettre à jour la photo.
- Changer le mot de passe via Better Auth.
- Se déconnecter.

---

# 7. RÈGLES MÉTIER TRANSVERSALES

## 7.1. Indépendance des tontines

Chaque tontine possède ses propres :

- Membres.
- Invitations.
- Périodes.
- Cotisations.
- Paiements.
- Tours.
- Paramètres.

## 7.2. Multiplicité des rôles

Le rôle est défini au niveau de l'adhésion.

Un utilisateur peut être ADMIN dans une tontine et MEMBER dans une autre.

## 7.3. Créateur

Le créateur est automatiquement membre de sa tontine et cotise comme les autres participants.

## 7.4. Historisation

Les opérations importantes doivent conserver :

- Auteur.
- Date.
- Action.
- Ancienne valeur si nécessaire.
- Nouvelle valeur.
- Motif éventuel.

## 7.5. Transactions

Utiliser les transactions PostgreSQL via Drizzle pour :

- Création d'une tontine et ajout du créateur.
- Acceptation d'une invitation.
- Génération des obligations.
- Validation d'un paiement.
- Modification d'un calendrier.
- Opérations impliquant plusieurs tables.

## 7.6. Montants

- Devise XOF.
- Stockage en entiers.
- Aucun calcul monétaire en nombres flottants.
- Affichage formaté en FCFA.

## 7.7. Dates

- Stocker les dates et heures en UTC lorsque ce sont des instants.
- Utiliser le type DATE pour les dates calendaires sans heure.
- Afficher selon Africa/Abidjan.
- Gérer correctement les dates d'échéance.

---

# 8. ARCHITECTURE TECHNIQUE NEXT.JS FULL-STACK

## 8.1. Architecture générale

L'application est un seul projet Next.js.

Le frontend et les traitements serveur sont organisés dans le même dépôt et le même framework.

```text
              UTILISATEUR
                   |
                   v
             APPLICATION
                NEXT.JS
                   |
        +----------+----------+
        |                     |
        v                     v
  REACT / UI            SERVER SIDE
  Server Components     Server Actions
  Client Components     Route Handlers
        |                     |
        +----------+----------+
                   |
                   v
             SERVICES MÉTIER
                   |
                   v
               DRIZZLE
                   |
                   v
              POSTGRESQL
                   |
                   v
              BETTER AUTH
         Sessions et utilisateurs
```

## 8.2. Next.js

Utiliser Next.js avec App Router.

Principes :

- Server Components par défaut.
- Client Components uniquement pour l'interactivité.
- Server Actions pour les mutations internes.
- Route Handlers pour les webhooks et endpoints HTTP nécessaires.
- Chargement des données côté serveur lorsque pertinent.
- Gestion des erreurs avec les conventions Next.js.
- Routes dynamiques pour les tontines.

Ne pas créer un backend Express séparé.

## 8.3. Server Actions

Utiliser les Server Actions pour les opérations internes de l'application :

- Création d'une tontine.
- Modification.
- Invitation.
- Acceptation.
- Déclaration de paiement.
- Validation de paiement.
- Modification du tour de main.
- Gestion du profil.

Chaque action doit :

1. Vérifier la session Better Auth.
2. Valider les entrées avec Zod.
3. Vérifier les permissions.
4. Appeler le service métier.
5. Exécuter les opérations transactionnelles nécessaires.
6. Retourner un résultat typé.
7. Gérer les erreurs.

Ne jamais exposer de logique sensible uniquement dans un Client Component.

## 8.4. Route Handlers

Utiliser les Route Handlers pour les besoins HTTP externes ou spécifiques :

- Webhooks.
- Vérification de tâches planifiées.
- Endpoints de téléchargement sécurisé.
- Endpoints nécessaires aux intégrations futures.

Préfixe recommandé pour les routes applicatives :

`/api/v1/...`

Ne pas dupliquer les règles métier entre Server Actions et Route Handlers.

## 8.5. Better Auth

Better Auth gère :

- Les utilisateurs.
- Les comptes.
- Les sessions.
- L'authentification.
- La vérification email.
- La récupération du mot de passe.

Utiliser l'adaptateur Drizzle et les schémas Better Auth compatibles avec la version installée.

Ne pas implémenter une deuxième solution d'authentification.

## 8.6. Drizzle ORM

Drizzle est l'unique ORM utilisé pour les accès à PostgreSQL.

Utiliser :

- Drizzle ORM.
- Drizzle Kit.
- Schémas TypeScript.
- Relations.
- Transactions.
- Migrations versionnées.

Ne pas utiliser Prisma.

## 8.7. PostgreSQL

PostgreSQL est la base relationnelle principale.

Toutes les données métier doivent être persistées dans cette base.

Utiliser les contraintes relationnelles pour assurer l'intégrité des données.

## 8.8. TanStack React Query

Utiliser React Query uniquement lorsqu'une gestion côté client est pertinente :

- Données nécessitant une actualisation client.
- Mutations interactives.
- Cache client.
- Rafraîchissement après actions.

Ne pas utiliser React Query systématiquement pour remplacer le chargement serveur natif de Next.js.

---

# 9. STRUCTURE DU PROJET

Utiliser une organisation feature-first et modulaire.

```text
koti/
│
├── drizzle/
│   ├── migrations/
│   └── meta/
│
├── public/
│   ├── images/
│   └── icons/
│
├── src/
│   │
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   ├── forgot-password/
│   │   │   └── reset-password/
│   │   │
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── tontines/
│   │   │   ├── payments/
│   │   │   ├── alerts/
│   │   │   └── profile/
│   │   │
│   │   ├── (dashboard)/tontines/[tontineId]/
│   │   │   ├── page.tsx
│   │   │   ├── members/
│   │   │   ├── payments/
│   │   │   ├── rotations/
│   │   │   └── settings/
│   │   │
│   │   ├── invite/[token]/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   └── v1/
│   │   ├── layout.tsx
│   │   └── globals.css
│   │
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   ├── shared/
│   │   └── forms/
│   │
│   ├── db/
│   │   ├── index.ts
│   │   ├── schema/
│   │   └── migrations/
│   │
│   ├── lib/
│   │   ├── auth/
│   │   ├── validations/
│   │   ├── utils/
│   │   ├── constants/
│   │   └── permissions/
│   │
│   ├── modules/
│   │   ├── users/
│   │   ├── tontines/
│   │   ├── members/
│   │   ├── invitations/
│   │   ├── contributions/
│   │   ├── payments/
│   │   ├── rotations/
│   │   ├── notifications/
│   │   └── audit/
│   │
│   ├── actions/
│   ├── hooks/
│   ├── types/
│   └── middleware.ts
│
├── docs/
│   ├── 00-VISION.md
│   ├── 01-PRD-MVP.md
│   ├── 02-ARCHITECTURE.md
│   ├── 03-DATABASE.md
│   ├── 04-API.md
│   ├── 05-DESIGN-SYSTEM.md
│   ├── 06-DEVELOPMENT-GUIDE.md
│   └── 07-ROADMAP.md
│
├── .env.example
├── .gitignore
├── drizzle.config.ts
├── next.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

Les noms de fichiers peuvent être adaptés si nécessaire, mais la séparation des responsabilités doit être conservée.

## 9.1. Organisation d'un module métier

Exemple pour les paiements :

```text
modules/payments/
├── payment.schema.ts
├── payment.service.ts
├── payment.repository.ts
├── payment.validation.ts
├── payment.types.ts
└── payment.permissions.ts
```

Responsabilités :

- Schema : schéma de données Drizzle associé si pertinent.
- Service : règles métier.
- Repository : accès aux données.
- Validation : schémas Zod.
- Types : contrats TypeScript.
- Permissions : règles d'accès du module.

Les composants d'interface restent dans `app` ou `components`.

Les Server Actions appellent les services métier.

---

# 10. MODÈLE DE DONNÉES — POSTGRESQL + DRIZZLE

Le modèle doit être défini en TypeScript avec Drizzle.

Better Auth doit disposer de ses tables propres :

- user.
- session.
- account.
- verification.

Utiliser les noms et structures attendus par la version de Better Auth installée.

Les tables métier doivent référencer l'identifiant utilisateur Better Auth.

Ne pas dupliquer les données d'authentification dans une table utilisateur parallèle.

## 10.1. users

Table gérée par Better Auth.

Les informations métier supplémentaires peuvent être placées dans une table `user_profiles`.

## 10.2. user_profiles

| Champ | Type |
|---|---|
| user_id | TEXT, PK, FK vers user.id |
| full_name | VARCHAR |
| phone | VARCHAR |
| avatar_url | TEXT |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

## 10.3. tontines

| Champ | Type |
|---|---|
| id | UUID |
| name | VARCHAR |
| description | TEXT |
| contribution_amount | BIGINT |
| currency | VARCHAR |
| frequency | ENUM |
| frequency_config | JSONB |
| start_date | DATE |
| expected_member_count | INTEGER |
| status | ENUM |
| creator_id | TEXT, FK vers user.id |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

## 10.4. tontine_members

| Champ | Type |
|---|---|
| id | UUID |
| tontine_id | UUID |
| user_id | TEXT |
| role | ENUM ADMIN / MEMBER |
| status | ENUM ACTIVE / LEFT / REMOVED |
| joined_at | TIMESTAMP |
| created_at | TIMESTAMP |

Contrainte unique : `(tontine_id, user_id)`.

## 10.5. invitations

| Champ | Type |
|---|---|
| id | UUID |
| tontine_id | UUID |
| invited_email | VARCHAR |
| invited_phone | VARCHAR |
| invited_user_id | TEXT nullable |
| token_hash | VARCHAR |
| status | ENUM |
| invited_by | TEXT |
| expires_at | TIMESTAMP |
| responded_at | TIMESTAMP nullable |
| created_at | TIMESTAMP |

## 10.6. contribution_periods

| Champ | Type |
|---|---|
| id | UUID |
| tontine_id | UUID |
| period_number | INTEGER |
| due_date | DATE |
| status | ENUM OPEN / CLOSED |
| created_at | TIMESTAMP |

Contrainte unique : `(tontine_id, period_number)`.

## 10.7. contribution_obligations

| Champ | Type |
|---|---|
| id | UUID |
| tontine_id | UUID |
| period_id | UUID |
| member_id | UUID |
| expected_amount | BIGINT |
| due_date | DATE |
| status | ENUM |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

Contrainte unique : `(period_id, member_id)`.

## 10.8. payments

| Champ | Type |
|---|---|
| id | UUID |
| obligation_id | UUID |
| amount | BIGINT |
| payment_date | DATE |
| payment_method | ENUM |
| reference | VARCHAR |
| comment | TEXT |
| status | ENUM |
| declared_by | TEXT |
| validated_by | TEXT nullable |
| validated_at | TIMESTAMP nullable |
| rejection_reason | TEXT |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

Conserver les déclarations successives.

Ne pas écraser un paiement rejeté lorsqu'une nouvelle déclaration est effectuée.

## 10.9. payment_attachments

| Champ | Type |
|---|---|
| id | UUID |
| payment_id | UUID |
| file_name | VARCHAR |
| storage_path | TEXT |
| mime_type | VARCHAR |
| size | BIGINT |
| created_at | TIMESTAMP |

Les fichiers doivent être stockés dans un stockage privé compatible avec l'environnement de déploiement. PostgreSQL conserve leurs métadonnées et références.

## 10.10. rotation_slots

| Champ | Type |
|---|---|
| id | UUID |
| tontine_id | UUID |
| member_id | UUID |
| position | INTEGER |
| scheduled_date | DATE |
| status | ENUM |
| created_at | TIMESTAMP |
| updated_at | TIMESTAMP |

Contrainte unique : `(tontine_id, position)`.

## 10.11. notifications

| Champ | Type |
|---|---|
| id | UUID |
| user_id | TEXT |
| tontine_id | UUID nullable |
| type | VARCHAR |
| title | VARCHAR |
| message | TEXT |
| resource_type | VARCHAR |
| resource_id | UUID nullable |
| read_at | TIMESTAMP nullable |
| created_at | TIMESTAMP |

## 10.12. audit_logs

| Champ | Type |
|---|---|
| id | UUID |
| actor_id | TEXT |
| tontine_id | UUID nullable |
| action | VARCHAR |
| entity_type | VARCHAR |
| entity_id | UUID nullable |
| old_values | JSONB |
| new_values | JSONB |
| created_at | TIMESTAMP |

## 10.13. sessions et comptes

Les tables Better Auth gèrent les sessions, comptes et vérifications.

Ne pas créer une seconde table de sessions métier concurrente.

## 10.14. Contraintes et index

Prévoir notamment :

- Index sur les emails.
- Index sur les numéros de téléphone.
- Index sur les créateurs de tontines.
- Index sur les adhésions par utilisateur.
- Index sur les adhésions par tontine.
- Index sur les invitations.
- Index sur les obligations par membre.
- Index sur les dates d'échéance.
- Index sur les paiements par obligation.
- Index sur les notifications par utilisateur.
- Index sur les dates de création.

Toutes les relations doivent avoir des clés étrangères cohérentes.

Prévoir les contraintes d'unicité nécessaires pour empêcher les doublons.

---

# 11. DESIGN SYSTEM ET UX/UI

## 11.1. Direction artistique

Créer une interface moderne, professionnelle et minimaliste.

Inspiration : Facebook Ads Manager et les interfaces SaaS de gestion modernes.

L'expérience doit inspirer confiance et simplicité.

## 11.2. Palette

- Vert principal.
- Vert clair.
- Blanc.
- Gris clair.
- Gris foncé.
- Rouge pour les erreurs et retards.
- Orange pour les avertissements.

Ne pas multiplier les couleurs.

## 11.3. Composants

Utiliser Shadcn/UI :

- Button.
- Card.
- Dialog.
- Dropdown Menu.
- Input.
- Select.
- Tabs.
- Table.
- Badge.
- Avatar.
- Toast.
- Alert Dialog.
- Sheet.
- Calendar.
- Tooltip.
- Skeleton.

Créer des composants réutilisables.

## 11.4. Responsive

Desktop :

- Navigation latérale.
- Cartes en grille.
- Tableaux lisibles.
- Contenu organisé.

Mobile :

- Navigation inférieure.
- Cartes empilées.
- Tableaux adaptés en listes.
- Formulaires ergonomiques.
- Boutons accessibles.

## 11.5. États UI

Chaque page doit gérer :

- Loading.
- Empty.
- Error.
- Success.
- Unauthorized.
- Not found.

---

# 12. EXIGENCES NON FONCTIONNELLES

## 12.1. Performance

- Utiliser les Server Components par défaut.
- Limiter les Client Components.
- Optimiser les requêtes Drizzle.
- Utiliser la pagination.
- Indexer les colonnes fréquemment filtrées.
- Utiliser le cache de manière maîtrisée.
- Éviter les appels réseau inutiles.

## 12.2. Sécurité

- Better Auth.
- Sessions sécurisées.
- Validation Zod côté serveur.
- Permissions côté serveur.
- Protection des mutations.
- Vérification de l'appartenance aux tontines.
- Protection des fichiers.
- Protection des secrets.
- Journalisation des opérations sensibles.

## 12.3. Fiabilité

Utiliser des transactions PostgreSQL pour les opérations sensibles.

Prévenir :

- Les doubles déclarations.
- Les doubles validations.
- Les invitations utilisées plusieurs fois.
- Les échéances dupliquées.
- Les modifications concurrentes des tours.

## 12.4. Maintenabilité

- TypeScript strict.
- Code modulaire.
- Services métier indépendants des composants.
- Schémas Drizzle versionnés.
- Migrations contrôlées.
- Documentation technique.
- Tests automatisés.

---

# 13. EPICS ET PLAN DE DÉVELOPPEMENT

Le développement doit suivre les Epics ci-dessous.

Chaque Epic doit être terminé et testé avant de passer au suivant.

## EPIC 01 — Initialisation Next.js

**Objectif :** mettre en place le socle technique.

### Tâches

- [ ] Initialiser Next.js avec App Router.
- [ ] Configurer TypeScript strict.
- [ ] Configurer Tailwind CSS.
- [ ] Installer Shadcn/UI.
- [ ] Installer Better Auth.
- [ ] Installer Drizzle ORM.
- [ ] Installer Drizzle Kit.
- [ ] Configurer PostgreSQL.
- [ ] Installer Zod.
- [ ] Installer React Hook Form.
- [ ] Installer React Query si nécessaire.
- [ ] Configurer les variables d'environnement.
- [ ] Créer la structure des dossiers.
- [ ] Configurer les scripts.
- [ ] Créer la page d'accueil technique.
- [ ] Vérifier la connexion PostgreSQL.

**Critères d'acceptation :**

- Next.js démarre.
- PostgreSQL est accessible.
- Drizzle fonctionne.
- Les variables sensibles ne sont pas exposées.

## EPIC 02 — Modèle de données

**Objectif :** créer la structure PostgreSQL.

### Tâches

- [ ] Configurer Drizzle.
- [ ] Définir les tables Better Auth.
- [ ] Définir les tables métier.
- [ ] Définir les relations.
- [ ] Définir les enums.
- [ ] Ajouter les contraintes.
- [ ] Ajouter les index.
- [ ] Générer les migrations.
- [ ] Exécuter les migrations.
- [ ] Créer un seed de démonstration.
- [ ] Documenter le modèle.

**Critères d'acceptation :**

- Les migrations sont exécutables.
- Les relations sont cohérentes.
- Les doublons sont empêchés.
- Le seed fonctionne.

## EPIC 03 — Authentification Better Auth

**Objectif :** gérer les utilisateurs et les sessions.

### Tâches

- [ ] Configurer Better Auth.
- [ ] Configurer l'adaptateur Drizzle.
- [ ] Configurer les tables.
- [ ] Développer l'inscription.
- [ ] Développer la connexion.
- [ ] Développer la déconnexion.
- [ ] Configurer la vérification email.
- [ ] Configurer la récupération du mot de passe.
- [ ] Configurer les cookies.
- [ ] Créer les helpers serveur de session.
- [ ] Protéger les routes privées.
- [ ] Tester les sessions.

**Critères d'acceptation :**

- Inscription fonctionnelle.
- Connexion fonctionnelle.
- Déconnexion fonctionnelle.
- Sessions correctement sécurisées.
- Routes privées protégées.

## EPIC 04 — Layout et navigation

**Objectif :** construire le socle visuel.

### Tâches

- [ ] Créer le layout principal.
- [ ] Créer la navigation desktop.
- [ ] Créer la navigation mobile.
- [ ] Créer l'en-tête.
- [ ] Créer les cartes.
- [ ] Créer les badges.
- [ ] Créer les formulaires.
- [ ] Créer les tableaux.
- [ ] Créer les composants d'alerte.
- [ ] Créer les états de chargement.
- [ ] Créer les états vides.
- [ ] Vérifier le responsive.

## EPIC 05 — Création et gestion des tontines

**Objectif :** gérer les tontines.

### Tâches

- [ ] Créer la page Tontines.
- [ ] Créer le formulaire.
- [ ] Développer la création côté serveur.
- [ ] Ajouter le créateur comme administrateur.
- [ ] Développer la liste des tontines.
- [ ] Développer la consultation.
- [ ] Développer la modification.
- [ ] Développer la suspension.
- [ ] Développer la clôture.
- [ ] Ajouter les permissions.
- [ ] Tester plusieurs tontines.

## EPIC 06 — Tableau de bord global

**Objectif :** centraliser les tontines de l'utilisateur.

### Tâches

- [ ] Créer la page Accueil.
- [ ] Récupérer les tontines de l'utilisateur.
- [ ] Afficher les cartes.
- [ ] Afficher les rôles.
- [ ] Afficher les montants.
- [ ] Afficher les prochaines échéances.
- [ ] Ajouter les états vides.
- [ ] Relier les cartes aux espaces internes.

## EPIC 07 — Invitations et membres

**Objectif :** gérer les participants.

### Tâches

- [ ] Créer la page Membres.
- [ ] Développer l'invitation.
- [ ] Générer les jetons sécurisés.
- [ ] Envoyer les invitations.
- [ ] Développer l'écran d'invitation.
- [ ] Développer l'acceptation.
- [ ] Développer le refus.
- [ ] Gérer les expirations.
- [ ] Développer la liste des membres.
- [ ] Développer le retrait.
- [ ] Tester les permissions.

## EPIC 08 — Génération des échéances

**Objectif :** automatiser les cotisations.

### Tâches

- [ ] Développer le moteur de fréquence.
- [ ] Gérer le rythme hebdomadaire.
- [ ] Gérer deux jours par semaine.
- [ ] Gérer le rythme mensuel.
- [ ] Gérer le rythme annuel.
- [ ] Gérer les fins de mois.
- [ ] Gérer les années bissextiles.
- [ ] Créer les périodes.
- [ ] Créer les obligations par membre.
- [ ] Empêcher les doublons.
- [ ] Gérer les nouveaux membres.
- [ ] Gérer les suspensions.
- [ ] Tester les dates.

## EPIC 09 — Paiements

**Objectif :** gérer les déclarations et validations.

### Tâches

- [ ] Créer la page globale Paiements.
- [ ] Créer la vue administrateur.
- [ ] Créer la vue membre.
- [ ] Développer la déclaration.
- [ ] Développer les justificatifs.
- [ ] Développer la validation.
- [ ] Développer le refus.
- [ ] Historiser les déclarations.
- [ ] Calculer les totaux.
- [ ] Calculer les retards.
- [ ] Vérifier les permissions.
- [ ] Tester les transactions.

## EPIC 10 — Tours de main

**Objectif :** organiser les distributions.

### Tâches

- [ ] Créer la page Tours.
- [ ] Afficher les membres.
- [ ] Réordonner les positions.
- [ ] Enregistrer l'ordre.
- [ ] Générer les dates.
- [ ] Afficher le calendrier.
- [ ] Afficher le rang personnel.
- [ ] Gérer les statuts.
- [ ] Historiser les changements.
- [ ] Tester les contraintes.

## EPIC 11 — Notifications

**Objectif :** informer les utilisateurs.

### Tâches

- [ ] Créer les notifications.
- [ ] Développer le service.
- [ ] Créer la page Alertes.
- [ ] Marquer comme lu.
- [ ] Marquer tout comme lu.
- [ ] Notifier les invitations.
- [ ] Notifier les paiements.
- [ ] Développer les rappels.
- [ ] Développer les alertes de retard.
- [ ] Configurer les tâches planifiées.
- [ ] Empêcher les doublons.

## EPIC 12 — Sécurité et audit

**Objectif :** protéger les données.

### Tâches

- [ ] Vérifier les sessions.
- [ ] Vérifier les permissions.
- [ ] Vérifier l'isolation des tontines.
- [ ] Protéger les Server Actions.
- [ ] Protéger les Route Handlers.
- [ ] Sécuriser les fichiers.
- [ ] Ajouter les logs d'audit.
- [ ] Tester les accès interdits.
- [ ] Tester les identifiants manipulés.
- [ ] Tester les sessions expirées.
- [ ] Vérifier les secrets.

## EPIC 13 — Tests et recette

**Objectif :** stabiliser le MVP.

### Tâches

- [ ] Tests unitaires des services.
- [ ] Tests des Server Actions.
- [ ] Tests des Route Handlers.
- [ ] Tests des permissions.
- [ ] Tests des parcours.
- [ ] Tests responsive.
- [ ] Tests des transactions.
- [ ] Tests des invitations.
- [ ] Tests des paiements.
- [ ] Tests du moteur de fréquence.
- [ ] Correction des anomalies.
- [ ] Validation de la recette.

## EPIC 14 — Mise en production

**Objectif :** préparer la livraison.

### Tâches

- [ ] Configurer les environnements.
- [ ] Préparer les variables de production.
- [ ] Configurer PostgreSQL.
- [ ] Préparer les migrations.
- [ ] Configurer HTTPS.
- [ ] Configurer les sauvegardes.
- [ ] Configurer les tâches planifiées.
- [ ] Configurer les emails.
- [ ] Documenter l'installation.
- [ ] Documenter le déploiement.
- [ ] Effectuer un test de production.

---

# 14. SCÉNARIOS DE RECETTE

## Scénario 1 — Création

1. Ahmed crée un compte.
2. Il se connecte.
3. Il crée « Tontine Famille ».
4. Il configure 10 000 FCFA par semaine.
5. Il est automatiquement ajouté comme administrateur.
6. Il retrouve la tontine sur Accueil.

Résultat attendu : tontine créée.

## Scénario 2 — Invitation

1. Ahmed invite Mariam.
2. Mariam reçoit un lien.
3. Elle crée son compte si nécessaire.
4. Elle accepte.
5. Elle accède à la tontine.

Résultat attendu : Mariam devient membre.

## Scénario 3 — Paiement

1. Une échéance est générée.
2. Mariam déclare son paiement.
3. Le statut passe à DECLARED.
4. Ahmed reçoit une notification.
5. Ahmed valide.
6. Le statut passe à PAID.

Résultat attendu : paiement confirmé et historisé.

## Scénario 4 — Refus

1. Mariam déclare un paiement.
2. Ahmed le refuse avec un motif.
3. Le statut passe à REJECTED.
4. Mariam est notifiée.
5. Elle peut effectuer une nouvelle déclaration.

Résultat attendu : historique conservé.

## Scénario 5 — Plusieurs tontines

1. Ahmed crée deux tontines.
2. Il rejoint une troisième.
3. Il consulte Accueil.

Résultat attendu : les trois tontines sont affichées avec leurs rôles respectifs.

## Scénario 6 — Cloisonnement

1. Mariam est membre de la tontine A.
2. Elle tente d'accéder à la tontine B.
3. Elle tente un appel direct côté serveur.

Résultat attendu : accès refusé.

## Scénario 7 — Paiements personnels

1. Mariam consulte la page Paiements.
2. Elle voit les paiements de toutes ses tontines.
3. Elle ne voit aucun paiement individuel d'un autre membre.

Résultat attendu : données strictement personnelles.

## Scénario 8 — Tours de main

1. Ahmed définit l'ordre de dix membres.
2. Il enregistre les dates.
3. Les membres consultent le calendrier.

Résultat attendu : ordre unique et calendrier cohérent.

---

# 15. LIVRABLES ATTENDUS

L'IA doit produire :

1. Le projet Next.js complet.
2. Le code TypeScript.
3. La configuration Better Auth.
4. Le schéma Drizzle.
5. Les migrations PostgreSQL.
6. Les composants UI.
7. Les Server Actions.
8. Les Route Handlers nécessaires.
9. Les services métier.
10. Les tests automatisés.
11. Les données de démonstration.
12. Le fichier `.env.example`.
13. Le README.
14. La documentation technique.
15. La documentation du modèle de données.
16. La documentation de déploiement.

---

# 16. ÉVOLUTIONS POST-MVP

Les fonctionnalités suivantes ne font pas partie de cette première version :

- Intégration Orange Money.
- Intégration MTN Money.
- Intégration Wave.
- Confirmation automatique des paiements.
- Notifications WhatsApp.
- Notifications SMS.
- Tirage au sort automatique.
- Multi-administrateurs.
- Rôle trésorier.
- Export PDF et Excel.
- Statistiques avancées.
- Gestion de pénalités.
- Gestion avancée de trésorerie.
- Gestion de plusieurs cycles.
- Application mobile native.
- Facturation et abonnements SaaS.

---

# 17. CONDITIONS DE VALIDATION DU MVP

Le MVP est considéré comme livré lorsque :

- L'application Next.js fonctionne.
- Better Auth gère correctement l'authentification.
- Drizzle communique avec PostgreSQL.
- Un utilisateur peut créer plusieurs tontines.
- Les membres peuvent être invités et rejoindre les tontines.
- Chaque tontine dispose de son espace indépendant.
- Les échéances sont correctement générées.
- Les paiements peuvent être déclarés et validés.
- Les tours de main sont configurables.
- Les notifications essentielles fonctionnent.
- Les permissions sont contrôlées côté serveur.
- Les données sont correctement cloisonnées.
- Les tests de recette sont concluants.
- Le code est documenté et maintenable.

**Priorité absolue :** livrer un MVP fiable couvrant tout le cycle de vie d'une tontine :

Création → Invitation → Adhésion → Cotisation → Déclaration de paiement → Validation → Tour de main → Historique.

Ne pas sacrifier la fiabilité des règles métier au profit d'une multiplication des fonctionnalités.

---

# FIN DU PRD — KOTI MVP V1.1