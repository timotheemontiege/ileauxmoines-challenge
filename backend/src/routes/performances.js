// Routes de lecture : classement et profil.
import { Router } from 'express';
import { supabaseAdmin, isSupabaseConfigured } from '../lib/supabase.js';
import { CATEGORIES } from '../core/constants.js';

const router = Router();
const PERIODS = ['all', 'year', '30d'];

const parseCategory = (v) => (typeof v === 'string' && CATEGORIES.includes(v) ? v : 'all');
const parsePeriod = (v) => (typeof v === 'string' && PERIODS.includes(v) ? v : 'all');

function ensureConfigured(res) {
  if (!isSupabaseConfigured) {
    res.status(503).json({ error: 'Backend non configuré (Supabase manquant)' });
    return false;
  }
  return true;
}

// GET /api/leaderboard?category=&period=&page=&pageSize=
router.get('/leaderboard', async (req, res, next) => {
  try {
    if (!ensureConfigured(res)) return;

    const category = parseCategory(req.query.category);
    const period = parsePeriod(req.query.period);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 20));

    const { data, error } = await supabaseAdmin.rpc('get_leaderboard', {
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
      category,
      period,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/leaderboard/traces?category=&period=&limit=  (pour la carte)
router.get('/leaderboard/traces', async (req, res, next) => {
  try {
    if (!ensureConfigured(res)) return;

    const category = parseCategory(req.query.category);
    const period = parsePeriod(req.query.period);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30));

    const { data, error } = await supabaseAdmin.rpc('get_leaderboard_traces', {
      p_category: category,
      p_period: period,
      p_limit: limit,
    });
    if (error) throw new Error(error.message);

    res.json({ traces: data || [] });
  } catch (err) {
    next(err);
  }
});

// GET /api/profile/:username
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
      .select('id, status, uploaded_at, raw_points_count')
      .eq('user_id', profile.id)
      .order('uploaded_at', { ascending: false });
    if (sessionsError) throw new Error(sessionsError.message);

    const { data: performances, error: perfError } = await supabaseAdmin
      .from('performances')
      .select(
        'id, session_id, duration_seconds, distance_km, avg_speed_knots, category, wind_force_beaufort, comment, start_time, end_time, validated_at',
      )
      .eq('user_id', profile.id)
      .order('validated_at', { ascending: true });
    if (perfError) throw new Error(perfError.message);

    // Meilleur temps par catégorie.
    const bestByCategory = {};
    for (const p of performances || []) {
      const current = bestByCategory[p.category];
      if (!current || p.duration_seconds < current.duration_seconds) {
        bestByCategory[p.category] = p;
      }
    }

    // Points de progression (chronologiques) pour les courbes recharts.
    const progression = (performances || []).map((p) => ({
      date: p.validated_at,
      category: p.category,
      duration_seconds: p.duration_seconds,
      avg_speed_knots: p.avg_speed_knots,
    }));

    res.json({
      profile,
      sessions: sessions || [],
      performances: performances || [],
      bestByCategory,
      progression,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
