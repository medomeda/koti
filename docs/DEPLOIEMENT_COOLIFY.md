# Déploiement sur Coolify — version de démonstration

Objectif : mettre KOTI en ligne pour des **testeurs à distance**, avec les données fictives.
Pas de base de données à ce stade : un seul service `app`, dont les données de démo sont gardées
dans un volume (`demo-data`) et survivent aux redéploiements.

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

**Générée par Coolify, à ne pas toucher** : `SERVICE_HEX_64_CRONSECRET`. C'est le secret qui protège les routes
d'administration (réinitialisation de la démo, tâches planifiées). Copiez sa valeur pour la section 6.

**Déjà réglées par défaut dans `docker-compose.yml`** (modifiables dans l'onglet Environment Variables) :

| Variable | Valeur par défaut | Rôle |
|---|---|---|
| `KOTI_DEMO_MODE` | `1` | Bandeau « Version de démonstration », page `/guide`, comptes de démo sur la connexion. |
| `KOTI_ALLOW_DEMO_RESET` | `0` | Masque le bouton « Réinitialiser la démo » aux testeurs (sinon l'un d'eux pourrait effacer le travail des autres). |
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
  Si une mise à jour change le format des données (`SCHEMA_VERSION`), elles sont régénérées automatiquement, sauf le passage 2 → 3 (tickets) qui **migre** les données existantes sans rien perdre et laisse une copie `koti-demo.json.v2.bak` dans le volume.
- **Une seule instance** de `app` : les données vivent dans la mémoire du processus.
- Les dates du jeu de démo sont calculées le jour de sa création : pour une campagne longue, réinitialisez de temps en
  temps pour garder des échéances « à venir » réalistes.

## 7. Application installable (PWA) et mises à jour

KOTI s'installe sur l'écran d'accueil (Android : bouton « Installer », iPhone : Partager → « Sur l'écran d'accueil »).
Chaque déploiement porte un identifiant de version (commit fourni par Coolify via `SOURCE_COMMIT`, sinon l'heure du build) :
les applications installées le détectent et affichent **« Nouvelle version disponible — Mettre à jour »**.
Rien à faire de votre côté après un `Deploy`. Le HTTPS est indispensable (le service worker ne fonctionne pas en `http://`).

À savoir : une installation est liée au **domaine**. Les testeurs qui installent la démo devront réinstaller quand KOTI
passera sur le domaine de production.

## 8. Dépannage

| Symptôme | Cause probable |
|---|---|
| « No Available Server » | Le domaine n'a pas le suffixe `:3700`, ou le service n'est pas encore *healthy* (voir Runtime Logs). |
| La connexion « ne fait rien » / renvoie à la page de connexion | Site ouvert en `http://` : les cookies `Secure` exigent `https://`. |
| `/guide` en 404 | `KOTI_DEMO_MODE` différent de `1`. |
| Réinitialisation : `401` | Secret incorrect, ou `KOTI_DEMO_MODE` désactivé. |
| Données perdues après suppression de la ressource | Le volume `demo-data` a été supprimé avec elle (sans gravité : le jeu de démo est recréé). |

## 9. Ce que cette version n'est pas

Une instance de **démonstration** : pas de base PostgreSQL, pas d'e-mails réels, comptes publics.
Ne jamais y saisir de données réelles. La version de production arrivera avec la phase 2 (voir `SUIVI.md`).

## 10. Test local de l'image (optionnel)

Avec Docker Desktop lancé :

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build   # http://localhost:3701/guide
```
