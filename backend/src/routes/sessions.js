// POST /api/sessions/upload — upload d'un GPX + analyse + enregistrement.
import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../lib/auth.js';
import { supabaseAdmin, isSupabaseConfigured, GPX_BUCKET } from '../lib/supabase.js';
import { parseGpx } from '../core/gpxParser.js';
import { analyzeTrack } from '../core/tourDetector.js';
import { CATEGORIES } from '../core/constants.js';
import { formatDuration, downsampleTrace } from '../lib/format.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 Mo
  fileFilter: (req, file, cb) => {
    const ok =
      file.originalname.toLowerCase().endsWith('.gpx') ||
      ['application/gpx+xml', 'application/xml', 'text/xml', 'application/octet-stream'].includes(
        file.mimetype,
      );
    cb(ok ? null : new Error('Le fichier doit être au format .gpx'), ok);
  },
});

router.post('/upload', requireAuth, upload.single('gpx'), async (req, res, next) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Backend non configuré (Supabase manquant)' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Fichier GPX manquant (champ "gpx")' });
    }

    // ─── Validation des champs du formulaire ───────────────────────────────
    const category = req.body.category;
    if (!CATEGORIES.includes(category)) {
      return res
        .status(400)
        .json({ error: `Catégorie invalide. Attendu : ${CATEGORIES.join(', ')}` });
    }

    let windForce = null;
    if (req.body.wind_force_beaufort != null && req.body.wind_force_beaufort !== '') {
      const w = parseInt(req.body.wind_force_beaufort, 10);
      if (Number.isFinite(w) && w >= 0 && w <= 12) windForce = w;
    }

    const comment =
      typeof req.body.comment === 'string' ? req.body.comment.trim().slice(0, 500) : null;

    const userId = req.user.id;

    // ─── 1) Parsing + analyse (backend uniquement) ─────────────────────────
    let points;
    try {
      points = parseGpx(req.file.buffer.toString('utf-8'));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    if (points.length === 0) {
      return res.status(400).json({ error: 'Aucun point GPS exploitable dans ce fichier' });
    }

    const analysis = analyzeTrack(points);

    // ─── 2) Stockage du GPX (Supabase Storage, bucket privé) ───────────────
    const sessionId = randomUUID();
    const storagePath = `${userId}/${sessionId}.gpx`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(GPX_BUCKET)
      .upload(storagePath, req.file.buffer, {
        contentType: 'application/gpx+xml',
        upsert: false,
      });
    if (uploadError) throw new Error(`Upload Storage échoué : ${uploadError.message}`);

    // ─── 3) Création de la session ─────────────────────────────────────────
    const status = analysis.best ? 'valid' : 'invalid';
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .insert({
        id: sessionId,
        user_id: userId,
        gpx_file_url: storagePath,
        status,
        raw_points_count: points.length,
      })
      .select('id, status, uploaded_at, raw_points_count')
      .single();
    if (sessionError) throw new Error(sessionError.message);

    // ─── 4) Création de la performance si tour valide ──────────────────────
    let performance = null;
    if (analysis.best) {
      const b = analysis.best;
      const tracePoints = downsampleTrace(b.points, 500).map((p) => ({
        lat: p.lat,
        lon: p.lon,
        t: new Date(p.time).toISOString(),
      }));

      const { data: perf, error: perfError } = await supabaseAdmin
        .from('performances')
        .insert({
          session_id: sessionId,
          user_id: userId,
          duration_seconds: Math.round(b.durationSeconds),
          distance_km: Number(b.distanceKm.toFixed(3)),
          avg_speed_knots: Number(b.avgSpeedKnots.toFixed(2)),
          start_time: new Date(b.startTime).toISOString(),
          end_time: new Date(b.endTime).toISOString(),
          category,
          wind_force_beaufort: windForce,
          comment,
          gpx_tour_points: tracePoints,
        })
        .select('*')
        .single();
      if (perfError) throw new Error(perfError.message);
      performance = perf;
    }

    // ─── 5) Réponse ────────────────────────────────────────────────────────
    const warnings = [];
    if (analysis.lowFrequencyWarning) {
      warnings.push(
        `Fréquence GPS faible (~${analysis.sampleIntervalSeconds}s entre deux points). ` +
          '1 point/seconde est recommandé pour une mesure précise.',
      );
    }

    const response = {
      session,
      performance,
      warnings,
      analysis: {
        tourDetected: Boolean(analysis.best),
        toursDetected: analysis.toursDetected,
        totalPoints: analysis.totalPoints,
        pointsInZone: analysis.pointsInZone,
        sampleIntervalSeconds: analysis.sampleIntervalSeconds,
        lowFrequencyWarning: analysis.lowFrequencyWarning,
      },
    };

    if (analysis.best) {
      const b = analysis.best;
      response.best = {
        durationSeconds: Math.round(b.durationSeconds),
        durationLabel: formatDuration(b.durationSeconds),
        distanceKm: Number(b.distanceKm.toFixed(2)),
        avgSpeedKnots: Number(b.avgSpeedKnots.toFixed(2)),
        startTime: new Date(b.startTime).toISOString(),
        endTime: new Date(b.endTime).toISOString(),
        points: downsampleTrace(b.points, 500).map((p) => ({ lat: p.lat, lon: p.lon })),
      };
      response.message = `Tour détecté ✓ — Meilleur temps : ${response.best.durationLabel} — Distance : ${response.best.distanceKm.toFixed(1)} km`;
    } else {
      response.message =
        "Aucun tour complet de l'Île-aux-Moines détecté dans cette trace.";
    }

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/sessions/:id — supprime une trace de l'utilisateur courant.
// La suppression de la session retire en cascade sa performance (contrainte FK
// ON DELETE CASCADE), donc le record disparaît aussi du classement.
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!isSupabaseConfigured) {
      return res.status(503).json({ error: 'Backend non configuré (Supabase manquant)' });
    }

    const userId = req.user.id;
    const sessionId = req.params.id;

    const { data: session, error: fetchError } = await supabaseAdmin
      .from('sessions')
      .select('id, user_id, gpx_file_url')
      .eq('id', sessionId)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!session) return res.status(404).json({ error: 'Trace introuvable' });
    if (session.user_id !== userId) {
      return res
        .status(403)
        .json({ error: 'Tu ne peux supprimer que tes propres traces' });
    }

    // Supprime le fichier GPX du Storage (best-effort : on n'échoue pas s'il manque).
    if (session.gpx_file_url) {
      const { error: storageError } = await supabaseAdmin.storage
        .from(GPX_BUCKET)
        .remove([session.gpx_file_url]);
      if (storageError) console.warn('[delete] Storage:', storageError.message);
    }

    // Supprime la session (cascade -> performances).
    const { error: deleteError } = await supabaseAdmin
      .from('sessions')
      .delete()
      .eq('id', sessionId);
    if (deleteError) throw new Error(deleteError.message);

    res.json({ success: true, id: sessionId });
  } catch (err) {
    next(err);
  }
});

export default router;
