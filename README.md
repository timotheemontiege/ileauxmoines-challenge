# 🏝️ Île-aux-Moines Challenge

Site de records du **tour de l'Île-aux-Moines à la voile** (Golfe du Morbihan),
dans l'esprit de _basedevitesse.com_.

Les utilisateurs envoient une trace **GPX**. Le backend détecte automatiquement
si un **tour complet** de l'île a été réalisé (algorithme _winding number_),
extrait le **meilleur temps**, et met à jour un **classement public** par
catégorie de matériel (wingfoil, windsurf, kitesurf, voile légère, autre).

```
Trace GPX ──▶ Parsing (backend) ──▶ Winding number ──▶ Meilleur tour ──▶ Classement
```

---

## 🧱 Stack

| Côté        | Technologies                                                |
| ----------- | ----------------------------------------------------------- |
| Frontend    | React + Vite + TypeScript + TailwindCSS + Leaflet + Recharts |
| Backend     | Node.js + Express (API REST)                                |
| Base / Auth | Supabase (PostgreSQL + Auth email/password)                 |
| Stockage    | Supabase Storage (fichiers GPX, bucket privé)               |
| Carte       | Leaflet + OpenStreetMap                                     |
| Hébergement | Vercel (front) + Railway (back)                             |

---

## 📂 Structure

```
.
├── frontend/                 # React + Vite
│   ├── src/
│   │   ├── pages/            # Home, Leaderboard, Submit, Profile, Login, Register
│   │   ├── components/       # Navbar, TourMap (Leaflet), Podium, LeaderboardTable…
│   │   ├── hooks/useAuth.tsx # Contexte d'authentification Supabase
│   │   └── lib/              # supabaseClient, api, categories, format
│   ├── vercel.json
│   └── .env.example
├── backend/                  # Node.js + Express
│   ├── src/
│   │   ├── core/
│   │   │   ├── gpxParser.js       # XML → points { lat, lon, ele, time }
│   │   │   ├── tourDetector.js    # ⭐ algorithme winding number
│   │   │   ├── tourDetector.test.js
│   │   │   ├── geo.js             # Haversine, conversions
│   │   │   └── constants.js       # centroïde île, bounding box Golfe
│   │   ├── routes/
│   │   │   ├── sessions.js        # POST /api/sessions/upload
│   │   │   └── performances.js    # GET /api/leaderboard, /api/profile/:username
│   │   ├── lib/                   # supabase, auth (JWT), format
│   │   └── index.js
│   ├── supabase/migrations/0001_init.sql
│   ├── Procfile
│   └── .env.example
└── samples/tour-exemple.gpx  # GPX de test (tour complet)
```

---

## ⚠️ Prérequis : Node.js

> **Node.js n'est pas installé sur cette machine.** Installe **Node ≥ 18**
> (LTS conseillé) depuis <https://nodejs.org> avant de lancer le projet, puis
> rouvre ton terminal. Vérifie avec `node --version`.

Tu auras aussi besoin d'un compte **Supabase** (gratuit) : <https://supabase.com>.

---

## 🚀 Mise en route (local)

### 1. Supabase

1. Crée un projet sur Supabase.
2. **SQL Editor** → colle le contenu de
   [`backend/supabase/migrations/0001_init.sql`](backend/supabase/migrations/0001_init.sql)
   → **Run**. (Crée les tables, la RLS, le bucket `gpx`, le trigger de profil
   et les fonctions de classement.)
3. **Authentication → Providers** : active **Email**. Pour tester sans email,
   tu peux désactiver « Confirm email » (Authentication → Settings).
4. **Settings → API** : récupère
   - `Project URL`
   - clé `anon` (publique)
   - clé `service_role` (secrète — **backend uniquement**)

### 2. Backend

```bash
cd backend
cp .env.example .env        # puis renseigne les variables Supabase
npm install
npm test                    # exécute les tests du détecteur de tour
npm run dev                 # API sur http://localhost:4000
```

`.env` à renseigner :

```
PORT=4000
CORS_ORIGIN=http://localhost:5173
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
SUPABASE_GPX_BUCKET=gpx
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env        # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_URL
npm install
npm run dev                 # http://localhost:5173
```

### 4. Tester

1. Va sur `/register`, crée un compte (choisis un pseudo).
2. Va sur `/submit`, envoie [`samples/tour-exemple.gpx`](samples/tour-exemple.gpx).
3. Résultat attendu : **Tour détecté ✓ — ≈ 00:22:46 — ≈ 9.3 km**.
4. Le record apparaît sur `/` et `/leaderboard`.

---

## 🧭 L'algorithme de détection (cœur du projet)

Fichier : [`backend/src/core/tourDetector.js`](backend/src/core/tourDetector.js)

Méthode **winding number** (indice d'enroulement) autour du **centroïde de
l'île** (`47.5975, -2.8433`) :

1. **Parsing** GPX → points `{ lat, lon, time }`.
2. **Filtrage** des points hors Golfe (bbox `lat [47.4, 47.8]`, `lon [-3.1, -2.6]`)
   → élimine le trajet voiture, le GPS oublié, etc.
3. **Angles cumulés** depuis le centroïde (`atan2`, variation normalisée dans
   `[-π, π]`). La somme atteint `±2π` quand la trace fait un tour complet.
4. **Recherche de fenêtre** `[start, end]` telle que la rotation nette
   `≥ 2π − 0.15` (tolérance GPS), avec :
   - durée `≥ 180 s` (3 min) ;
   - vitesse moyenne entre **2 et 60 nœuds** ;
   - fenêtres **non chevauchantes** (pour compter plusieurs tours).
5. Parmi les tours valides, on retient le **plus rapide**.
6. **Distance** calculée par **Haversine**.

Robuste au bruit : trajets motorisés filtrés, chutes/pauses absorbées par la
rotation **nette** (les allers-retours s'annulent).

> Un avertissement est affiché si la **fréquence GPS** est trop basse
> (> 2 s entre deux points ; 1 pt/s recommandé).

### Tests

[`tourDetector.test.js`](backend/src/core/tourDetector.test.js) couvre :
tour complet, sens horaire, **demi-tour** (rejeté), **2 tours consécutifs**,
**trace bruitée** (voiture + jitter), trace vide, fréquence GPS.

```bash
cd backend && npm test
```

---

## 🔌 API REST

| Méthode | Route                         | Auth | Description                                  |
| ------- | ----------------------------- | ---- | -------------------------------------------- |
| GET     | `/api/health`                 | —    | État du serveur                              |
| GET     | `/api/categories`             | —    | Liste des catégories                         |
| POST    | `/api/sessions/upload`        | ✅   | Upload GPX (`multipart`) + analyse + record  |
| GET     | `/api/leaderboard`            | —    | Classement paginé (`category`, `period`, `page`) |
| GET     | `/api/leaderboard/traces`     | —    | Tracés des records (pour la carte)           |
| GET     | `/api/profile/:username`      | —    | Profil : sessions, records, progression      |

`POST /api/sessions/upload` attend le header `Authorization: Bearer <jwt>` et un
form-data : `gpx` (fichier), `category`, `wind_force_beaufort?`, `comment?`.

---

## ☁️ Déploiement

### Frontend → Vercel

- Root directory : `frontend`
- Build : `npm run build` · Output : `dist`
- Variables : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
  `VITE_API_URL` (= URL publique du backend Railway)
- `vercel.json` gère déjà le routage SPA.

### Backend → Railway

- Root directory : `backend`
- Start : `npm start` (voir `Procfile`)
- Variables : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`,
  `SUPABASE_GPX_BUCKET`, `CORS_ORIGIN` (= URL Vercel). `PORT` est fourni par Railway.

---

## 🗃️ Schéma de données

- **profiles** — `id` (= `auth.users.id`), `username` (unique), `avatar_url`, `created_at`
- **sessions** — un upload GPX : `gpx_file_url`, `status` (`pending|valid|invalid`),
  `raw_points_count`
- **performances** — le meilleur tour : `duration_seconds`, `distance_km`,
  `avg_speed_knots`, `start_time`/`end_time`, `category`, `wind_force_beaufort`,
  `comment`, `gpx_tour_points` (jsonb pour la carte)

RLS : **lecture publique** (classement public), **écritures via le backend**
(clé `service_role`). Les fichiers GPX restent dans un bucket **privé**.
