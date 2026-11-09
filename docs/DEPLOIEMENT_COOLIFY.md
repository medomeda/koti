# Déploiement sur Coolify — production

Deux services : `app` (l'application) et `db` (PostgreSQL 16). Les données vivent dans le volume `pg-data` et
survivent aux redéploiements. Au premier démarrage, les migrations sont appliquées et la base reste **vide** : aucun
compte ni donnée fictive. Le premier compte Super administrateur est créé à partir des variables `KOTI_BOOTSTRAP_ADMIN_*`
(section 4). Pour une instance de **démonstration** (testeurs, données fictives), voir la section 9.

## 1. Prérequis

- Coolify installé sur le VPS, serveur « localhost » validé.
- Un sous-domaine (ex. `koti-demo.mondomaine.com`) dont l'enregistrement **A** pointe vers l'IP du VPS (ports 80 et 443 ouverts).
- Le dépôt `github.com/medomeda/koti` accessible par Coolify (GitHub App ou clé de déploiement), branche `main`.
  Fichiers nécessaires (déjà dans le dépôt) : `Dockerfile`, `docker-compose.yml`, `.dockerignore`.

## 2. Créer la ressource

1. **Projet → Environment → + New → Private Repository** (via GitHub App) et choisir `medomeda/koti`, branche `main`.
2. **Build Pack : Docker Compose**.
3. **Base Directory** : `/` — **Docker Compose Location** : `/docker-compose.yml`.
4. Enregistrer : Coolify lit le fichier et crée les variables.

## 3. Domaine

Onglet **General → Domains**, ligne du service **app** :

```
https://koti-demo.mondomaine.com:3700
```

Le `:3700` indique au proxy le port interne ; le public passe bien par le 443 (HTTPS automatique Let's Encrypt).
Le HTTPS est **obligatoire** : les cookies de session sont marqués `Secure` en production.

## 4. Variables d'environnement

**Générées par Coolify, à ne pas toucher** : `SERVICE_PASSWORD_POSTGRES` (mot de passe de la base), `SERVICE_HEX_64_CRONSECRET` et `SERVICE_HEX_64_BETTERAUTHSECRET` (secret des sessions). C'est le secret qui protège les routes
d'administration (réinitialisation de la démo, tâches planifiées). Copiez sa valeur pour la section 6.

**À renseigner pour la production** :

| Variable | Rôle |
|---|---|
| `KOTI_BOOTSTRAP_ADMIN_EMAIL` | Adresse du premier Super administrateur. |
| `KOTI_BOOTSTRAP_ADMIN_PASSWORD` | Son mot de passe initial (12 caractères minimum). Le compte n'est créé **que s'il n'existe aucun compte d'équipe** : après la première connexion, changez le mot de passe depuis « Mon compte » puis **supprimez cette variable** de Coolify. |
| `KOTI_BOOTSTRAP_ADMIN_NAME` | Nom affiché (facultatif, « Administrateur KOTI » par défaut). |

Connexion de l'équipe : `https://votre-domaine/admin/login` (le lien n'apparaît volontairement pas sur la page de connexion des clients).

**Déjà réglées par défaut dans `docker-compose.yml`** (modifiables dans l'onglet Environment Variables) :

| Variable | Valeur par défaut | Rôle |
|---|---|---|
| `KOTI_DEMO_MODE` | `0` | `1` = instance de démonstration (bandeau, page `/guide`, comptes fictifs). Laisser à `0` en production. |
| `KOTI_ALLOW_DEMO_RESET` | `0` | Démonstration seulement : bouton « Réinitialiser la démo ». |
| `KOTI_ONLINE_PAYMENTS` | `0` | `0` = **règlement manuel** des offres payantes (voir section 6 ter). `1` = paiement en ligne (pas encore disponible). |
| `BETTER_AUTH_URL` | *(à renseigner)* | Adresse publique **https** de l'application, sans `:3700` (ex. `https://koti-demo.mondomaine.com`) : sert aux liens des e-mails et à la vérification d'origine. |
| `SMTP_URL` | *(vide)* | Courrier sortant (ex. `smtp://utilisateur:motdepasse@hote:587`). Vide : les e-mails sont seulement écrits dans les journaux. |
| `MAIL_FROM` | `KOTI <no-reply@koti.app>` | Expéditeur des e-mails. |
| `KOTI_REQUIRE_EMAIL_VERIFICATION` | `0` | `1` : la confirmation de l'adresse e-mail est exigée avant la première connexion (exige `SMTP_URL`). |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | *(vides)* | Notifications push : paire de clés générée **une fois** par `npm run push:keys` (à conserver). Vides : le bouton « Activer » du profil indique que la fonction n'est pas disponible. |
| `VAPID_SUBJECT` | `mailto:contact@koti.app` | Contact transmis aux services push (adresse de l'exploitant). |
| `KOTI_AUTO_MIGRATE` | `1` | Applique les migrations de la base au démarrage (le serveur ne démarre pas si elles échouent). |
| `TRUST_PROXY` | `1` | L'adresse IP réelle du visiteur est lue via le proxy de Coolify (limitation des tentatives de connexion). |

## 5. Déployer et vérifier

1. **Deploy**, puis suivre **Deployment Logs** (compilation : 2 à 4 minutes).
2. Le service doit passer **healthy** (sonde `/api/health`).
3. Ouvrir `https://votre-domaine/admin/login` et se connecter avec le compte `KOTI_BOOTSTRAP_ADMIN_*`.
4. Changer le mot de passe (Mon compte), retirer `KOTI_BOOTSTRAP_ADMIN_PASSWORD` des variables, puis inviter l'équipe (Administration → Équipe).
5. Vérifier `https://votre-domaine/api/ready` (200), créer un compte client de contrôle et faire un aller-retour de paiement.

## 6. Pendant la campagne de test

- **Sauvegardes** : sauvegardez le volume `pg-data` (Coolify → ressource de base de données, ou `pg_dump` planifié). C'est la seule copie des données.
- **Mettre à jour** : `git push` sur `main` puis **Deploy** (ou activer le webhook). Les données de démo sont conservées.
  Les évolutions du schéma sont des migrations SQL (`drizzle/`), appliquées au démarrage sans perte de données.
- **Plusieurs instances** de `app` sont possibles : les verrous et contraintes sont dans PostgreSQL.

## 6 bis. Tâche planifiée (obligatoire pour les rappels)

Les rappels d'échéance, les alertes de retard et leurs notifications push sont produits par la tâche horaire
`/api/v1/jobs/run`. Sans tâche planifiée, elle ne s'exécute que lorsqu'un utilisateur ouvre l'application. Dans Coolify :
**ressource → Scheduled Tasks → Add** :

- Conteneur : `app` — Fréquence : `0 * * * *` (toutes les heures) — Commande :
  ```
  node -e "fetch('http://127.0.0.1:3700/api/v1/jobs/run',{method:'POST',headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)})"
  ```
La tâche est idempotente : un créneau horaire n'est traité qu'une fois, même si elle se lance deux fois.

## 6 ter. Offres payantes : règlement manuel

Tant que le paiement en ligne n'est pas branché (`KOTI_ONLINE_PAYMENTS=0`) :
- tout client démarre sur l'offre **gratuite** ; il peut lancer seul **14 jours d'essai** d'une offre payante (sans facture, une seule fois) ;
- à la fin de l'essai, sans activation, il **retombe sur le gratuit** (ses données restent, mais les limites du gratuit s'appliquent aux créations) ;
- pour continuer, il vous contacte (bouton « Demander l'activation » → formulaire de contact) et règle par Mobile Money ou virement ;
- vous **activez l'offre** : Administration → Clients → fiche du client → *Changer d'offre* (indiquez la référence du paiement en motif). Une facture est émise et la période payée dure un mois ;
- sans nouvelle activation, l'offre repasse au gratuit à la fin du mois : refaites le même geste à chaque règlement.

## 7. Application installable (PWA) et mises à jour

KOTI s'installe sur l'écran d'accueil (Android : bouton « Installer », iPhone : Partager → « Sur l'écran d'accueil »).
Chaque déploiement porte un identifiant de version (commit fourni par Coolify via `SOURCE_COMMIT`, sinon l'heure du build) :
les applications installées le détectent et affichent **« Nouvelle version disponible — Mettre à jour »**.
Rien à faire de votre côté après un `Deploy`. Le HTTPS est indispensable (le service worker ne fonctionne pas en `http://`).

**Notifications push** : sur Android/Chrome elles fonctionnent dans le navigateur et dans l'application installée ; sur iPhone, seulement une fois KOTI ajouté à l'écran d'accueil (iOS 16.4 minimum). Chaque appareil s'active depuis **Profil → Notifications**. À savoir : une installation est liée au **domaine**. Les testeurs qui installent la démo devront réinstaller quand KOTI
passera sur le domaine de production.

## 8. Dépannage

| Symptôme | Cause probable |
|---|---|
| « No Available Server » | Le domaine n'a pas le suffixe `:3700`, ou le service n'est pas encore *healthy* (voir Runtime Logs). |
| La connexion « ne fait rien » / renvoie à la page de connexion | Site ouvert en `http://` : les cookies `Secure` exigent `https://`. |
| `/guide` en 404 | Normal en production (`KOTI_DEMO_MODE` à `0`). |
| Impossible de se connecter en administrateur | Compte non créé : `KOTI_BOOTSTRAP_ADMIN_PASSWORD` de moins de 12 caractères (voir Runtime Logs, source `bootstrap`), ou un compte d'équipe existe déjà. |
| Réinitialisation : `401` | Secret incorrect, ou `KOTI_DEMO_MODE` désactivé. |
| Données perdues après suppression de la ressource | Le volume `pg-data` a été supprimé avec elle (sans gravité : au redémarrage, la base est vide et le jeu de démo est réimporté). |
| Page « Service momentanément indisponible » | L'application ne joint pas PostgreSQL (service `db` arrêté ou `DATABASE_URL` erroné). `/api/ready` répond alors 503 (`/api/health` reste 200). Elle se rétablit seule quand la base revient. |
| `app` redémarre en boucle | La base n'est pas prête ou `DATABASE_URL` est incorrect : voir les Runtime Logs (message de migration). |

## 8 bis. Journaux et codes d'erreur

Un utilisateur qui rencontre une erreur inattendue voit un message générique avec un **code** (ex. `E-7K2P9Q`, ou un nombre pour une page). Dans **Runtime Logs** de Coolify, chaque événement est une ligne JSON : cherchez ce code (champ `ref`) pour obtenir l'erreur complète, sa cause, la requête concernée et la pile d'appels. Niveaux : `error`, `warn` (ex. base injoignable), `info`. Aucun mot de passe, jeton ni valeur de requête SQL n'y figure.

## 9. Instance de démonstration (facultatif)

Pour une instance séparée destinée aux testeurs : mettre `KOTI_DEMO_MODE=1` (la base vide reçoit alors le jeu de données
fictives, avec bandeau « Version de démonstration », comptes de test sur la connexion et page `/guide`) et, si besoin,
`KOTI_ALLOW_DEMO_RESET=1`. Remise à zéro :
```bash
curl -X POST -H "Authorization: Bearer <SERVICE_HEX_64_CRONSECRET>" https://demo.mondomaine.com/api/v1/demo/reset
```
**Ne jamais activer `KOTI_DEMO_MODE` sur l'instance de production** (comptes publics aux mots de passe connus) et n'y saisir aucune donnée réelle.

Restes avant d'ouvrir au public : textes légaux (CGU, confidentialité) à faire valider par un juriste, tarifs à confirmer
(Administration → Abonnements), paiement en ligne. Voir `SUIVI.md`.

## 10. Test local de l'image (optionnel)

Avec Docker Desktop lancé :

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build   # http://localhost:3701/guide (mode démonstration local)
```
