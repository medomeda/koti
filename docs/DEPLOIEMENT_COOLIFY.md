# Déploiement sur Coolify — version de démonstration

Objectif : mettre KOTI en ligne pour des **testeurs à distance**, avec les données fictives.
Deux services : `app` (l'application) et `db` (PostgreSQL 16). Les données vivent dans le volume `pg-data` et
survivent aux redéploiements. Au premier démarrage, les migrations sont appliquées et, la base étant vide, le jeu de
démonstration est importé automatiquement (`KOTI_DEMO_MODE=1`).

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

**Déjà réglées par défaut dans `docker-compose.yml`** (modifiables dans l'onglet Environment Variables) :

| Variable | Valeur par défaut | Rôle |
|---|---|---|
| `KOTI_DEMO_MODE` | `1` | Bandeau « Version de démonstration », page `/guide`, comptes de démo sur la connexion. |
| `KOTI_ALLOW_DEMO_RESET` | `0` | Masque le bouton « Réinitialiser la démo » aux testeurs (sinon l'un d'eux pourrait effacer le travail des autres). |
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
3. Ouvrir `https://koti-demo.mondomaine.com/guide` : la page « Merci de tester KOTI » doit s'afficher.
4. Se connecter avec `ahmed@koti.demo` / `Koti2026` et faire un aller-retour : déclarer un paiement avec Awa, le valider avec Ahmed.

**Lien à envoyer au testeur** : `https://koti-demo.mondomaine.com/guide` (il contient les comptes et les scénarios).

## 6. Pendant la campagne de test

- **Remettre les données à zéro** (entre deux testeurs, par exemple) :
  ```bash
  curl -X POST -H "Authorization: Bearer <SERVICE_HEX_64_CRONSECRET>" https://koti-demo.mondomaine.com/api/v1/demo/reset
  ```
  Toutes les sessions sont fermées : les testeurs devront se reconnecter.
- **Mettre à jour** : `git push` sur `main` puis **Deploy** (ou activer le webhook). Les données de démo sont conservées.
  Les évolutions du schéma sont des migrations SQL (`drizzle/`), appliquées au démarrage sans perte de données.
- **Plusieurs instances** de `app` sont possibles : les verrous et contraintes sont dans PostgreSQL.
- Les dates du jeu de démo sont calculées le jour de sa création : pour une campagne longue, réinitialisez de temps en
  temps pour garder des échéances « à venir » réalistes.

## 6 bis. Tâche planifiée (obligatoire pour les rappels)

Les rappels d'échéance, les alertes de retard et leurs notifications push sont produits par la tâche horaire
`/api/v1/jobs/run`. Sans tâche planifiée, elle ne s'exécute que lorsqu'un utilisateur ouvre l'application. Dans Coolify :
**ressource → Scheduled Tasks → Add** :

- Conteneur : `app` — Fréquence : `0 * * * *` (toutes les heures) — Commande :
  ```
  node -e "fetch('http://127.0.0.1:3700/api/v1/jobs/run',{method:'POST',headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>{console.log(r.status);process.exit(r.ok?0:1)})"
  ```
La tâche est idempotente : un créneau horaire n'est traité qu'une fois, même si elle se lance deux fois.

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
| `/guide` en 404 | `KOTI_DEMO_MODE` différent de `1`. |
| Réinitialisation : `401` | Secret incorrect, ou `KOTI_DEMO_MODE` désactivé. |
| Données perdues après suppression de la ressource | Le volume `pg-data` a été supprimé avec elle (sans gravité : au redémarrage, la base est vide et le jeu de démo est réimporté). |
| Page « Service momentanément indisponible » | L'application ne joint pas PostgreSQL (service `db` arrêté ou `DATABASE_URL` erroné). `/api/ready` répond alors 503 (`/api/health` reste 200). Elle se rétablit seule quand la base revient. |
| `app` redémarre en boucle | La base n'est pas prête ou `DATABASE_URL` est incorrect : voir les Runtime Logs (message de migration). |

## 8 bis. Journaux et codes d'erreur

Un utilisateur qui rencontre une erreur inattendue voit un message générique avec un **code** (ex. `E-7K2P9Q`, ou un nombre pour une page). Dans **Runtime Logs** de Coolify, chaque événement est une ligne JSON : cherchez ce code (champ `ref`) pour obtenir l'erreur complète, sa cause, la requête concernée et la pile d'appels. Niveaux : `error`, `warn` (ex. base injoignable), `info`. Aucun mot de passe, jeton ni valeur de requête SQL n'y figure.

## 9. Ce que cette version n'est pas

Une instance de **démonstration** : pas d'e-mails réels, comptes publics, pas d'e-mails sans `SMTP_URL`.
Ne jamais y saisir de données réelles. Voir `SUIVI.md` pour la suite de la phase 2.

## 10. Test local de l'image (optionnel)

Avec Docker Desktop lancé :

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build   # http://localhost:3701/guide
```
