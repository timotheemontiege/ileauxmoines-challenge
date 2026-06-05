import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { deleteSession, getProfile } from '../lib/api';
import type { Performance, ProfileResponse, SectorRecord } from '../types';
import { CATEGORIES, categoryColor, categoryLabel } from '../lib/categories';
import { COURSE_LIST, getCourse } from '../config/courses';
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatSpeed,
} from '../lib/format';
import CategoryBadge from '../components/CategoryBadge';
import Spinner from '../components/Spinner';
import { useAuth } from '../hooks/useAuth';

const STATUS_STYLE: Record<string, string> = {
  valid: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  invalid: 'text-slate-400 bg-slate-700/20 border-slate-600/40',
  pending: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
};

export default function ProfilePage() {
  const { username = '' } = useParams();
  const { user, session } = useAuth();
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCourse, setActiveCourse] = useState<string | null>(null);
  const [chartCategory, setChartCategory] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getProfile(username);
      setData(res);
    } catch (err) {
      setData(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  // Parcours ayant des données (records ou sessions).
  const coursesWithData = useMemo(() => {
    if (!data) return [];
    return COURSE_LIST.filter(
      (c) =>
        data.bestByCourse[c.id] ||
        data.sessions.some((s) => s.course_id === c.id),
    );
  }, [data]);

  // Choisit un onglet de parcours par défaut une fois les données chargées.
  useEffect(() => {
    if (coursesWithData.length === 0) {
      setActiveCourse(null);
      return;
    }
    if (!activeCourse || !coursesWithData.some((c) => c.id === activeCourse)) {
      setActiveCourse(coursesWithData[0].id);
    }
  }, [coursesWithData, activeCourse]);

  // Performance par session (pour afficher la Vmax dans l'historique).
  const perfBySession = useMemo(() => {
    const m = new Map<string, Performance>();
    for (const p of data?.performances ?? []) m.set(p.session_id, p);
    return m;
  }, [data]);

  const isOwnProfile = !!user && !!data && user.id === data.profile.id;

  async function handleDelete(sessionId: string) {
    if (!session) return;
    const ok = window.confirm(
      'Supprimer cette trace ? Le record associé sera retiré du classement. Cette action est irréversible.',
    );
    if (!ok) return;
    setDeletingId(sessionId);
    setError(null);
    try {
      await deleteSession(sessionId, session.access_token);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  // Records par catégorie pour le parcours actif.
  const bestForCourse: Record<string, Performance> =
    (activeCourse ? data?.bestByCourse[activeCourse] : undefined) ?? {};
  const categoriesWithData = Object.keys(bestForCourse);

  // S'assure que la catégorie du graphe est valide pour le parcours actif.
  useEffect(() => {
    if (!categoriesWithData.includes(chartCategory ?? '')) {
      setChartCategory(categoriesWithData[0] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCourse, data]);

  const chartData = useMemo(() => {
    if (!data || !activeCourse || !chartCategory) return [];
    return data.progression
      .filter((p) => p.course_id === activeCourse && p.category === chartCategory)
      .map((p) => ({
        label: formatDate(p.date),
        minutes: Number((p.duration_seconds / 60).toFixed(2)),
        seconds: p.duration_seconds,
      }));
  }, [data, activeCourse, chartCategory]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Chargement du profil…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center text-slate-300">
        <p className="text-2xl">🤷</p>
        <p className="mt-2">{error ?? 'Profil introuvable'}</p>
      </div>
    );
  }

  const activeCourseConfig = activeCourse ? getCourse(activeCourse) : null;
  const sectorRecords: Record<string, SectorRecord> =
    (activeCourse ? data.sectorRecords[activeCourse] : undefined) ?? {};

  return (
    <div className="space-y-10">
      {/* En-tête */}
      <header className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ocean-600 text-2xl font-black text-white">
          {data.profile.username.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h1 className="text-3xl font-black">{data.profile.username}</h1>
          <p className="text-sm text-slate-400">
            Membre depuis {formatDate(data.profile.created_at)} ·{' '}
            {data.sessions.length} session(s)
          </p>
        </div>
      </header>

      {coursesWithData.length === 0 ? (
        <p className="text-slate-400">Aucun tour validé pour le moment.</p>
      ) : (
        <>
          {/* Onglets parcours */}
          <div className="flex flex-wrap gap-2">
            {coursesWithData.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCourse(c.id)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                  c.id === activeCourse
                    ? 'border-ocean-500 bg-ocean-600/20 text-white'
                    : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>

          {/* Records par catégorie (parcours actif) */}
          <section>
            <h2 className="mb-4 text-xl font-bold">Records par catégorie</h2>
            {categoriesWithData.length === 0 ? (
              <p className="text-slate-400">Aucun tour validé sur ce parcours.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {CATEGORIES.filter((c) => bestForCourse[c.value]).map((c) => {
                  const best = bestForCourse[c.value];
                  return (
                    <div key={c.value} className="card p-4">
                      <CategoryBadge category={c.value} />
                      <div className="mt-3 font-mono text-2xl font-bold text-white">
                        {formatDuration(best.duration_seconds)}
                      </div>
                      <div className="mt-1 text-sm text-slate-400">
                        {formatSpeed(best.avg_speed_knots)} ·{' '}
                        {formatDistance(best.distance_km)}
                      </div>
                      <div className="mt-1 text-sm text-ocean-200">
                        Vmax {best.vmax_knots != null ? formatSpeed(best.vmax_knots) : '—'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {formatDate(best.validated_at)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Records par secteur (parcours actif) */}
          {activeCourseConfig && Object.keys(sectorRecords).length > 0 && (
            <section className="space-y-3">
              <h2 className="text-xl font-bold">Records par secteur</h2>
              <div className="card overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Secteur</th>
                      <th className="px-4 py-3 font-semibold">Meilleur temps</th>
                      <th className="px-4 py-3 font-semibold">Matériel</th>
                      <th className="px-4 py-3 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {activeCourseConfig.sectors
                      .filter((s) => sectorRecords[s.id])
                      .map((s) => {
                        const rec = sectorRecords[s.id];
                        return (
                          <tr key={s.id} className="hover:bg-slate-800/40">
                            <td className="px-4 py-3 text-slate-300">{s.name}</td>
                            <td className="px-4 py-3 font-mono font-semibold text-white">
                              {formatDuration(rec.duration_seconds)}
                            </td>
                            <td className="px-4 py-3">
                              <CategoryBadge category={rec.category} />
                            </td>
                            <td className="px-4 py-3 text-slate-400">
                              {formatDate(rec.achieved_at)}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Progression (parcours actif) */}
          {chartCategory && chartData.length > 0 && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-xl font-bold">Progression</h2>
                <div className="flex flex-wrap gap-2">
                  {categoriesWithData.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setChartCategory(cat)}
                      className={`rounded-lg border px-3 py-1 text-sm transition ${
                        cat === chartCategory
                          ? 'border-ocean-500 bg-ocean-600/20 text-white'
                          : 'border-slate-700 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {categoryLabel(cat)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="card p-4">
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: -8 }}>
                    <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={12}
                      label={{
                        value: 'minutes',
                        angle: -90,
                        position: 'insideLeft',
                        fill: '#64748b',
                        fontSize: 12,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: 12,
                        color: '#e2e8f0',
                      }}
                      formatter={(_value, _name, item) => [
                        formatDuration(item.payload.seconds),
                        'Temps',
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey="minutes"
                      stroke={categoryColor(chartCategory)}
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </>
      )}

      {/* Historique des sessions (tous parcours) */}
      <section className="space-y-4">
        <h2 className="text-xl font-bold">Historique des sessions</h2>
        {data.sessions.length === 0 ? (
          <p className="text-slate-400">Aucune session.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Parcours</th>
                  <th className="px-4 py-3 font-semibold">Statut</th>
                  <th className="px-4 py-3 font-semibold">Vmax</th>
                  <th className="px-4 py-3 font-semibold">Points GPS</th>
                  {isOwnProfile && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {data.sessions.map((s) => {
                  const perf = perfBySession.get(s.id);
                  return (
                    <tr key={s.id} className="hover:bg-slate-800/40">
                      <td className="px-4 py-3 text-slate-300">
                        {formatDate(s.uploaded_at)}
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {getCourse(s.course_id)?.name ?? s.course_id}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            STATUS_STYLE[s.status] ?? STATUS_STYLE.invalid
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ocean-200">
                        {perf?.vmax_knots != null ? formatSpeed(perf.vmax_knots) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{s.raw_points_count}</td>
                      {isOwnProfile && (
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleDelete(s.id)}
                            disabled={deletingId === s.id}
                            className="rounded-lg border border-red-500/40 px-2.5 py-1 text-xs font-medium text-red-300 transition hover:bg-red-500/10 disabled:opacity-50"
                          >
                            {deletingId === s.id ? 'Suppression…' : 'Supprimer'}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
