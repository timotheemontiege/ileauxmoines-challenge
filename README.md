# ⛵ Tour Île Challenge

Plateforme **multi-parcours** de records de tours à la voile dans le **Golfe du
Morbihan**, dans l'esprit de _basedevitesse.com_.

Trois parcours sont proposés :

- **Tour de l'Île-aux-Moines** — détection par _winding number_ ;
- **Tour de l'Île d'Arz** — détection par _winding number_ ;
- **Tour du Golfe du Morbihan** — validation par **waypoints ordonnés** (8 points).

Les utilisateurs envoient une trace **GPX** pour le parcours choisi. Le backend
détecte automatiquement le **meilleur tour**, calcule le **temps**, la
**distance**, la **vitesse moyenne**, la **Vmax** (vitesse max instantanée) et
les **temps par secteur géographique**, puis met à jour un **classement public**
(global et par secteur) par catégorie de matériel (wingfoil, windsurf, kitesurf,
voile légère, autre).

```
Trace GPX ─▶ Parsing ─▶ detectTour(courseConfig) ─▶ Meilleur tour + Vmax + secteurs ─▶ Classement
                         winding number | waypoints
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
│   │   ├── components/       # Navbar, CourseSelector, TourMap, Podium, *Table…
│   │   ├── hooks/            # useAuth (Supabase), useCourse (parcours global + URL)
│   │   ├── config/courses.ts # ⭐ miroir typé de la config des parcours
│   │   └── lib/              # supabaseClient, api, categories, format, sectors
│   ├── vercel.json
│   └── .env.example
├── backend/                  # Node.js + Express
│   ├── src/
│   │   ├── config/courses.js     # ⭐ config centrale des 3 parcours (OSM)
│   │   ├── core/
│   │   │   ├── gpxParser.js       # XML → points { lat, lon, ele, time }
│   │   │   ├── tourDetector.js    # ⭐ detectTour : winding number | waypoints, Vmax, secteurs
│   │   │   ├── tourDetector.test.js
│   │   │   ├── geo.js             # Haversine, conversions
│   │   │   └── constants.js       # centroïde île, bounding box Golfe
│   │   ├── routes/
│   │   │   ├── sessions.js        # POST /api/sessions/upload (course_id, secteurs)
│   │   │   └── performances.js    # GET /api/leaderboard(/sectors), /api/profile/:username
│   │   ├── lib/                   # supabase, auth (JWT), format
│   │   └── index.js
│   ├── supabase/migrations/
│   │   ├── 0001_init.sql
│   │   └── 0002_multi_course.sql # ⭐ course_id, vmax, secteurs, sector_performances
│   ├── tests/test_tour_detector.py # ⭐ tests Python (portage, Node absent)
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
2. **SQL Editor** → exécute **dans l'ordre** :
   1. [`backend/supabase/migrations/0001_init.sql`](backend/supabase/migrations/0001_init.sql)
      (tables, RLS, bucket `gpx`, trigger de profil, fonctions de classement) ;
   2. [`backend/supabase/migrations/0002_multi_course.sql`](backend/supabase/migrations/0002_multi_course.sql)
      (colonnes `course_id` / `vmax_knots` / `sector_times`, table
      `sector_performances`, RPC mises à jour + `get_sector_leaderboard`).
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
2. Sélectionne le parcours **Île-aux-Moines** (sélecteur de la barre).
3. Va sur `/submit`, envoie [`samples/tour-exemple.gpx`](samples/tour-exemple.gpx).
4. Résultat attendu : **Tour détecté ✓** (≈ 00:22:46 — ≈ 9.3 km) avec Vmax et
   temps par secteur.
5. Le record apparaît sur `/` et `/leaderboard` (filtrés par parcours), avec
   un onglet **Classement par secteur**.

---

## 🧭 Les algorithmes de détection (cœur du projet)

Fichier : [`backend/src/core/tourDetector.js`](backend/src/core/tourDetector.js).
Point d'entrée : `detectTour(points, courseConfig)` → `{ valid, bestTour, allTours }`,
qui route selon `courseConfig.validationType` (`winding`, `waypoints` ou `outer-loop`). La
config des parcours (coordonnées OSM des pointes / waypoints, secteurs) vit dans
[`backend/src/config/courses.js`](backend/src/config/courses.js) (miroir frontend
typé dans `frontend/src/config/courses.ts`).

Sur le meilleur tour, on calcule aussi :

- **Vmax** : vitesse max instantanée sur une **fenêtre glissante ≥ 2 s**
  (`distance(Pᵢ, Pⱼ) / Δt`), ce qui élimine les artefacts GPS (Δt minuscule) tout
  en conservant une accélération réellement tenue ;
- **Temps par secteur** : découpe du tour entre les **bornes de secteur** (pointes
  pour le winding, **4 façades** regroupant les arêtes inter-balises pour le Tour
  du Golfe).

### A. Winding number (Île-aux-Moines, Île d'Arz)

Méthode **winding number** (indice d'enroulement) autour du **centroïde de
l'île** (Île-aux-Moines : `47.5975, -2.8433`) :

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

### B. Tour par l'extérieur (Tour du Golfe)

Le tour est valide si les **6 balises** (sommets du polygone `P`) sont **longées
par l'EXTÉRIEUR**, dans l'**ordre cyclique** et dans **un sens cohérent** (horaire
ou anti-horaire), **départ libre** :

1. chaque balise est **approchée** (point de la trace à `< radiusMeters = 300 m`) ;
2. les approches s'enchaînent dans l'ordre cyclique d'**un seul sens** (1→6 *ou* 6→1) ;
3. au plus proche de chaque balise, la trace est **à l'extérieur** de `P`
   (test point-in-polygon) ;
4. **sans couper** `P` : aucune incursion franche (`> 250 m` de profondeur, hors
   rayon d'une balise) entre deux approches.

Le tour est un **circuit fermé** : on chronomètre de la **balise de départ**
jusqu'à son **retour**, après avoir longé les 6 balises. Les 6 arêtes étant
parcourues, les **4 façades** (Nord/Est/Sud/Ouest, regroupant les arêtes
inter-balises — cf. `courses.js`) sont **toutes mesurées**. La **boucle la plus
rapide** est retenue ; un champ `direction` (`cw`/`ccw`) est renvoyé.

### Tests

La logique JS (**source de vérité**, `npm test` / Vitest) est aussi **portée en
Python 3** (port de référence) dans
[`backend/tests/test_tour_detector.py`](backend/tests/test_tour_detector.py) :
tour complet / sens horaire / **demi-tour rejeté** / **2 tours** / **trace bruitée**,
waypoints **dans l'ordre / manquant / en désordre / demi-tour toléré**,
**tour par l'extérieur** (sens 1→6 & 6→1, départ milieu ; coupe / balise manquée /
désordre rejetés), **Vmax** (artefact éliminé, pic 2 s conservé, atténuation),
**secteurs** (découpe correcte winding & waypoints, secteur absent si tour incomplet).

```bash
npm --prefix backend test                       # 24 tests Vitest (source de vérité)
python backend/tests/test_tour_detector.py      # 30 tests, stdlib uniquement
```

---

## 🔌 API REST

| Méthode | Route                         | Auth | Description                                  |
| ------- | ----------------------------- | ---- | -------------------------------------------- |
| GET     | `/api/health`                 | —    | État du serveur                              |
| GET     | `/api/categories`             | —    | Liste des catégories                         |
| GET     | `/api/courses`                | —    | Liste des parcours (config, waypoints, secteurs) |
| POST    | `/api/sessions/upload`        | ✅   | Upload GPX (`multipart`) + analyse + record  |
| GET     | `/api/leaderboard`            | —    | Classement paginé (`course_id`, `category`, `period`, `page`) |
| GET     | `/api/leaderboard/sectors`    | —    | Classement par secteur (`course_id`, `sector_id`, …) |
| GET     | `/api/leaderboard/traces`     | —    | Tracés des records (pour la carte, `course_id`) |
| GET     | `/api/profile/:username`      | —    | Profil : records par parcours **et** par secteur |

`POST /api/sessions/upload` attend le header `Authorization: Bearer <jwt>` et un
form-data : `gpx` (fichier), `course_id`, `category`, `wind_force_beaufort?`,
`comment?`. Réponse : `tourDetected`, `duration`, `distance`, `avgSpeed`,
`vmaxKnots`, `sectors`, `courseId`, `courseName`.

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
- **sessions** — un upload GPX : `course_id`, `gpx_file_url`,
  `status` (`pending|valid|invalid`), `raw_points_count`
- **performances** — le meilleur tour : `course_id`, `duration_seconds`,
  `distance_km`, `avg_speed_knots`, **`vmax_knots`**, **`sector_times`** (jsonb),
  `start_time`/`end_time`, `category`, `wind_force_beaufort`, `comment`,
  `gpx_tour_points` (jsonb pour la carte)
- **sector_performances** — un temps de secteur (classement par secteur) :
  `performance_id`, `user_id`, `course_id`, `sector_id`, `sector_name`,
  `duration_seconds`, `category`, `achieved_at`

RLS : **lecture publique** (classement public), **écritures via le backend**
(clé `service_role`). Les fichiers GPX restent dans un bucket **privé**.
