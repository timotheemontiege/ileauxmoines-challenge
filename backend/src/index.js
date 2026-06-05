// Point d'entrée du serveur Express.
import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import sessionsRouter from './routes/sessions.js';
import performancesRouter from './routes/performances.js';
import { isSupabaseConfigured } from './lib/supabase.js';
import { CATEGORIES } from './core/constants.js';
import { COURSE_LIST, resolveDynamicCentroids } from './config/courses.js';

const app = express();

app.use(express.json({ limit: '2mb' }));

const origins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors({ origin: origins, credentials: true }));

// ─── Routes utilitaires ──────────────────────────────────────────────────
app.get('/', (req, res) =>
  res.json({ name: 'Tour Île Challenge API', status: 'ok' }),
);
app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', supabaseConfigured: isSupabaseConfigured }),
);
app.get('/api/categories', (req, res) => res.json({ categories: CATEGORIES }));

// Liste des parcours disponibles (config publique pour le frontend).
app.get('/api/courses', (req, res) =>
  res.json({
    courses: COURSE_LIST.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      validationType: c.validationType,
      centroid: c.centroid,
      boundingBox: c.boundingBox,
      categories: c.categories,
      waypoints: c.waypoints,
      sectors: c.sectors,
    })),
  }),
);

// ─── Routes métier ───────────────────────────────────────────────────────
app.use('/api/sessions', sessionsRouter);
app.use('/api', performancesRouter);

// ─── 404 ─────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route introuvable' }));

// ─── Gestion d'erreurs centralisée ───────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Fichier trop volumineux (max 20 Mo)' });
  }
  console.error('[error]', err);
  res.status(err.status || 500).json({ error: err.message || 'Erreur serveur' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Tour Île Challenge API sur http://localhost:${PORT}`);
  if (!isSupabaseConfigured) {
    console.warn(
      '⚠️  Supabase non configuré (voir backend/.env). ' +
        'Les uploads et le classement renverront 503 tant que les clés ne sont pas définies.',
    );
  }
  // Best-effort : rafraîchit le centroïde de l'Île d'Arz via Nominatim.
  // N'échoue jamais (repli sur la valeur OSM par défaut).
  resolveDynamicCentroids()
    .then((c) => console.log(`📍 Centroïde Île d'Arz : ${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`))
    .catch(() => {});
});

export default app;
