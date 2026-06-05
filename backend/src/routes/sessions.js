// POST /api/sessions/upload — upload d'un GPX + analyse multi-parcours + enregistrement.
import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../lib/auth.js';
import { supabaseAdmin, isSupabaseConfigured, GPX_BUCKET } from '../lib/supabase.js';
import { parseGpx } from '../core/gpxParser.js';
import { detectTour, estimateSampleIntervalSeconds } from '../core/tourDetector.js';
import { getCourse, isValidCourseId, DEFAULT_COURSE_ID } from '../config/courses.js';
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

    // ─── Parcours ──────────────────────────────────────────────────────────
    const courseId = req.body.course_id || DEFAULT_COURSE_ID;
    if (!isValidCourseId(courseId)) {
      return res.status(400).json({ error: `Parcours inconnu : ${courseId}` });
    }
    const course = getCourse(courseId);

    // ─── Validation des champs du formulaire ───────────────────────────────
    const category = req.body.category;
    if (!course.categories.includes(category)) {
      return res
        .status(400)
        .json({ error: `Catégorie invalide. Attendu : ${course.categories.join(', ')}` });
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

    const detection = detectTour(points, course);
    const best = detection.bestTour;

    const sampleIntervalSeconds = estimateSampleIntervalSeconds(points);
    const lowFrequencyWarning = sampleIntervalSeconds != null && sampleIntervalSeconds > 2;

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
    const status = detection.valid ? 'valid' : 'invalid';
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .insert({
        id: sessionId,
        user_id: userId,
        course_id: courseId,
        gpx_file_url: storagePath,
        status,
        raw_points_count: points.length,
      })
      .select('id, status, uploaded_at, raw_points_count, course_id')
      .single();
    if (sessionError) throw new Error(sessionError.message);

    // ─── 4) Performance + secteurs si tour valide ──────────────────────────
    let performance = null;
    if (best) {
      const tracePoints = downsampleTrace(best.points, 500).map((p) => ({
        lat: p.lat,
        lon: p.lon,
        t: new Date(p.time).toISOString(),
      }));

      // Secteurs réellement mesurés (durée non nulle), sérialisés en jsonb.
      const measuredSectors = (best.sectors || []).filter((s) => s.durationSeconds != null);

      const { data: perf, error: perfError } = await supabaseAdmin
        .from('performances')
        .insert({
          session_id: sessionId,
          user_id: userId,
          course_id: courseId,
          duration_seconds: Math.round(best.durationSeconds),
          distance_km: Number(best.distanceKm.toFixed(3)),
          avg_speed_knots: Number(best.avgSpeedKnots.toFixed(2)),
          vmax_knots: best.vmaxKnots != null ? Number(best.vmaxKnots.toFixed(2)) : null,
          sector_times: measuredSectors,
          start_time: new Date(best.startTime).toISOString(),
          end_time: new Date(best.endTime).toISOString(),
          category,
          wind_force_beaufort: windForce,
          comment,
          gpx_tour_points: tracePoints,
        })
        .select('*')
        .single();
      if (perfError) throw new Error(perfError.message);
      performance = perf;

      // Lignes de classement par secteur.
      if (measuredSectors.length > 0) {
        const sectorRows = measuredSectors.map((s) => ({
          performance_id: perf.id,
          user_id: userId,
          course_id: courseId,
          sector_id: s.sectorId,
          sector_name: s.name,
          duration_seconds: s.durationSeconds,
          category,
          achieved_at: perf.validated_at,
        }));
        const { error: sectorError } = await supabaseAdmin
          .from('sector_performances')
          .insert(sectorRows);
        if (sectorError) throw new Error(sectorError.message);
      }
    }

    // ─── 5) Réponse ────────────────────────────────────────────────────────
    const warnings = [];
    if (lowFrequencyWarning) {
      warnings.push(
        `Fréquence GPS faible (~${sampleIntervalSeconds}s entre deux points). ` +
          '1 point/seconde est recommandé pour une mesure précise.',
      );
    }

    const response = {
      session,
      performance,
      warnings,
      courseId,
      courseName: course.name,
      analysis: {
        tourDetected: detection.valid,
        toursDetected: detection.allTours.length,
        totalPoints: points.length,
        sampleIntervalSeconds,
        lowFrequencyWarning,
      },
    };

    if (best) {
      response.best = {
        durationSeconds: Math.round(best.durationSeconds),
        durationLabel: formatDuration(best.durationSeconds),
        distanceKm: Number(best.distanceKm.toFixed(2)),
        avgSpeedKnots: Number(best.avgSpeedKnots.toFixed(2)),
        vmaxKnots: best.vmaxKnots != null ? Number(best.vmaxKnots.toFixed(2)) : null,
        startTime: new Date(best.startTime).toISOString(),
        endTime: new Date(best.endTime).toISOString(),
        sectors: (best.sectors || []).filter((s) => s.durationSeconds != null),
        points: downsampleTrace(best.points, 500).map((p) => ({ lat: p.lat, lon: p.lon })),
      };
      response.message = `Tour détecté ✓ — ${course.name} — Meilleur temps : ${response.best.durationLabel} — Distance : ${response.best.distanceKm.toFixed(1)} km — Vmax : ${response.best.vmaxKnots ?? '—'} nds`;
    } else {
      response.message = `Aucun tour valide détecté pour « ${course.name} » dans cette trace.`;
    }

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/sessions/:id — supprime une trace de l'utilisateur courant.
// La suppression de la session retire en cascade sa performance (FK ON DELETE
// CASCADE), qui retire elle-même ses sector_performances (FK CASCADE).
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

    // Supprime la session (cascade -> performances -> sector_performances).
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
