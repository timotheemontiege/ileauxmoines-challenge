// Routes de lecture : classement (global + secteurs) et profil.
import { Router } from 'express';
import { supabaseAdmin, isSupabaseConfigured } from '../lib/supabase.js';
import { CATEGORIES } from '../core/constants.js';
import { isValidCourseId, DEFAULT_COURSE_ID, getCourse } from '../config/courses.js';

const router = Router();
const PERIODS = ['all', 'year', '30d'];

const parseCategory = (v) => (typeof v === 'string' && CATEGORIES.includes(v) ? v : 'all');
const parsePeriod = (v) => (typeof v === 'string' && PERIODS.includes(v) ? v : 'all');
const parseCourse = (v) => (isValidCourseId(v) ? v : DEFAULT_COURSE_ID);

function ensureConfigured(res) {
  if (!isSupabaseConfigured) {
    res.status(503).json({ error: 'Backend non configuré (Supabase manquant)' });
    return false;
  }
  return true;
}

// GET /api/leaderboard?course_id=&category=&period=&page=&pageSize=
router.get('/leaderboard', async (req, res, next) => {
  try {
    if (!ensureConfigured(res)) return;

    const courseId = parseCourse(req.query.course_id);
    const category = parseCategory(req.query.category);
    const period = parsePeriod(req.query.period);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));

    const { data, error } = await supabaseAdmin.rpc('get_leaderboard', {
      p_course_id: courseId,
      p_category: category,
      p_period: period,
    });
    if (error) throw new Error(error.message);

    const rows = data || [];
    const total = rows.length;
    const startIdx = (page - 1) * pageSize;
    const entries = rows.slice(startIdx, startIdx + pageSize);

    res.json({
      entries,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      courseId,
      category,
      period,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/leaderboard/sectors?course_id=&sector_id=&category=&period=
router.get('/leaderboard/sectors', async (req, res, next) => {
  try {
    if (!ensureConfigured(res)) return;

    const courseId = parseCourse(req.query.course_id);
    const sectorId = typeof req.query.sector_id === 'string' ? req.query.sector_id : '';
    const category = parseCategory(req.query.category);
    const period = parsePeriod(req.query.period);

    const course = getCourse(courseId);
    const sector = course?.sectors.find((s) => s.id === sectorId) || null;
    if (!sector) {
      return res.status(400).json({ error: `Secteur inconnu pour ce parcours : ${sectorId}` });
    }

    const { data, error } = await supabaseAdmin.rpc('get_sector_leaderboard', {
      p_course_id: courseId,
      p_sector_id: sectorId,
      p_category: category,
      p_period: period,
    });
    if (error) throw new Error(error.message);

    res.json({
      entries: data || [],
      courseId,
      sectorId,
      sectorName: sector.name,
      category,
      period,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/leaderboard/traces?course_id=&category=&period=&limit=  (pour la carte)
router.get('/leaderboard/traces', async (req, res, next) => {
  try {
    if (!ensureConfigured(res)) return;

    const courseId = parseCourse(req.query.course_id);
    const category = parseCategory(req.query.category);
    const period = parsePeriod(req.query.period);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));

    const { data, error } = await supabaseAdmin.rpc('get_leaderboard_traces', {
      p_course_id: courseId,
      p_category: category,
      p_period: period,
      p_limit: limit,
    });
    if (error) throw new Error(error.message);

    // Diagnostic (ÉTAPE 2.1) : nb de points renvoyés par le RPC, par trace.
    // Activer avec DEBUG_TRACE_POINTS=1 pour comparer accueil vs détail.
    if (process.env.DEBUG_TRACE_POINTS) {
      for (const t of data || []) {
        console.log(
          `[leaderboard/traces] course=${courseId} perf=${t.performance_id} pts=${(t.gpx_tour_points || []).length}`,
        );
      }
    }

    res.json({ traces: data || [], courseId });
  } catch (err) {
    next(err);
  }
});

// GET /api/performance/:id — détail d'une trace (carte, Vmax, secteurs).
router.get('/performance/:id', async (req, res, next) => {
  try {
    if (!ensureConfigured(res)) return;

    const { id } = req.params;
    const { data: perf, error } = await supabaseAdmin
      .from('performances')
      .select(
        'id, session_id, user_id, course_id, duration_seconds, distance_km, avg_speed_knots, vmax_knots, sector_times, category, wind_force_beaufort, comment, start_time, end_time, validated_at, gpx_tour_points',
      )
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!perf) return res.status(404).json({ error: 'Trace introuvable' });

    // Diagnostic (ÉTAPE 2.1) : nb de points renvoyés par l'endpoint détail.
    if (process.env.DEBUG_TRACE_POINTS) {
      console.log(
        `[performance/:id] perf=${perf.id} pts=${(perf.gpx_tour_points || []).length}`,
      );
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', perf.user_id)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);

    const course = getCourse(perf.course_id);
    res.json({
      performance: {
        ...perf,
        username: profile?.username ?? null,
        avatar_url: profile?.avatar_url ?? null,
      },
      courseName: course?.name ?? perf.course_id,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/profile/:username — records par parcours ET par secteur.
router.get('/profile/:username', async (req, res, next) => {
  try {
    if (!ensureConfigured(res)) return;

    const { username } = req.params;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, username, avatar_url, created_at')
      .eq('username', username)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    if (!profile) return res.status(404).json({ error: 'Rider introuvable' });

    const { data: sessions, error: sessionsError } = await supabaseAdmin
      .from('sessions')
      .select('id, status, uploaded_at, raw_points_count, course_id')
      .eq('user_id', profile.id)
      .order('uploaded_at', { ascending: false });
    if (sessionsError) throw new Error(sessionsError.message);

    const { data: performances, error: perfError } = await supabaseAdmin
      .from('performances')
      .select(
        'id, session_id, course_id, duration_seconds, distance_km, avg_speed_knots, vmax_knots, sector_times, category, wind_force_beaufort, comment, start_time, end_time, validated_at',
      )
      .eq('user_id', profile.id)
      .order('validated_at', { ascending: true });
    if (perfError) throw new Error(perfError.message);

    const { data: sectorPerfs, error: sectorError } = await supabaseAdmin
      .from('sector_performances')
      .select('id, performance_id, course_id, sector_id, sector_name, duration_seconds, category, achieved_at')
      .eq('user_id', profile.id)
      .order('duration_seconds', { ascending: true });
    if (sectorError) throw new Error(sectorError.message);

    // Meilleur temps par parcours puis par catégorie.
    const bestByCourse = {};
    for (const p of performances || []) {
      const c = (bestByCourse[p.course_id] ||= {});
      if (!c[p.category] || p.duration_seconds < c[p.category].duration_seconds) {
        c[p.category] = p;
      }
    }

    // Meilleur temps par parcours puis par secteur (un record par secteur).
    const sectorRecords = {};
    for (const s of sectorPerfs || []) {
      const bucket = (sectorRecords[s.course_id] ||= {});
      if (!bucket[s.sector_id] || s.duration_seconds < bucket[s.sector_id].duration_seconds) {
        bucket[s.sector_id] = s;
      }
    }

    // Points de progression (chronologiques) pour les courbes recharts.
    const progression = (performances || []).map((p) => ({
      date: p.validated_at,
      course_id: p.course_id,
      category: p.category,
      duration_seconds: p.duration_seconds,
      avg_speed_knots: p.avg_speed_knots,
      vmax_knots: p.vmax_knots,
    }));

    res.json({
      profile,
      sessions: sessions || [],
      performances: performances || [],
      bestByCourse,
      sectorRecords,
      progression,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
