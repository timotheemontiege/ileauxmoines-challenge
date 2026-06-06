import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getPerformance, getSectorLeaderboard } from '../lib/api';
import type { PerformanceDetailResponse } from '../types';
import { getCourse } from '../config/courses';
import { segmentTourBySectors, sectorColor } from '../lib/sectors';
import {
  formatDate,
  formatDistance,
  formatDuration,
  formatSpeed,
} from '../lib/format';
import TourMap, { type MapTrace, type MapWaypoint } from '../components/TourMap';
import CategoryBadge from '../components/CategoryBadge';
import Spinner from '../components/Spinner';

export default function TraceDetailPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<PerformanceDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sectorRecords, setSectorRecords] = useState<Record<string, number | null>>({});

  const course = data ? getCourse(data.performance.course_id) : null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getPerformance(id)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Records de secteur (pour colorer la trace relativement).
  useEffect(() => {
    if (!data || !course) return;
    let cancelled = false;
    Promise.all(
      course.sectors.map((s) =>
        getSectorLeaderboard({
          course: course.id,
          sector: s.id,
          category: 'all',
          period: 'all',
        })
          .then((r) => [s.id, r.entries[0]?.duration_seconds ?? null] as const)
          .catch(() => [s.id, null] as const),
      ),
    ).then((records) => !cancelled && setSectorRecords(Object.fromEntries(records)));
    return () => {
      cancelled = true;
    };
  }, [data, course]);

  const waypoints = useMemo<MapWaypoint[]>(
    () =>
      course
        ? course.waypoints.map((w) => ({
            id: w.id,
            name: w.name,
            lat: w.lat,
            lon: w.lon,
            radiusMeters: w.radiusMeters,
          }))
        : [],
    [course],
  );

  const sectorSegments = useMemo<MapTrace[]>(() => {
    if (!data || !course) return [];
    const points = (data.performance.gpx_tour_points || []).map((p) => ({
      lat: p.lat,
      lon: p.lon,
    }));
    const durations = new Map(
      (data.performance.sector_times || []).map((s) => [s.sectorId, s.durationSeconds]),
    );
    return segmentTourBySectors(points, course)
      .filter((seg) => seg.positions.length > 1)
      .map((seg) => {
        const dur = durations.get(seg.sectorId);
        const color =
          dur != null ? sectorColor(dur, sectorRecords[seg.sectorId] ?? null) : '#64748b';
        return {
          id: seg.sectorId,
          positions: seg.positions,
          color,
          label: dur != null ? `${seg.name} · ${formatDuration(dur)}` : seg.name,
        };
      });
  }, [data, course, sectorRecords]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Chargement de la trace…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="card mx-auto max-w-md p-8 text-center text-slate-300">
        <p className="text-2xl">🤷</p>
        <p className="mt-2">{error ?? 'Trace introuvable'}</p>
        <Link to="/leaderboard" className="btn-ghost mt-6 inline-block">
          ← Retour au classement
        </Link>
      </div>
    );
  }

  const p = data.performance;
  const fallbackTrace: MapTrace[] =
    sectorSegments.length === 0
      ? [
          {
            id: 'trace',
            positions: (p.gpx_tour_points || []).map(
              (pt) => [pt.lat, pt.lon] as [number, number],
            ),
            color: '#38bdf8',
            label: `${p.username ?? 'Trace'} · ${formatDuration(p.duration_seconds)}`,
          },
        ]
      : [];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-ocean-400">
            {data.courseName}
          </p>
          <h1 className="mt-1 text-3xl font-black">
            {p.username ? (
              <Link to={`/profile/${p.username}`} className="hover:text-ocean-300">
                {p.username}
              </Link>
            ) : (
              'Trace'
            )}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-400">
            <CategoryBadge category={p.category} />
            <span>· {formatDate(p.validated_at)}</span>
            {p.wind_force_beaufort != null && <span>· {p.wind_force_beaufort} Bft</span>}
          </p>
        </div>
        <Link to="/leaderboard" className="btn-ghost">
          ← Classement
        </Link>
      </header>

      {/* Stats globales */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Temps total" value={formatDuration(p.duration_seconds)} />
        <Stat label="Distance" value={formatDistance(p.distance_km)} />
        <Stat label="Vitesse moy." value={formatSpeed(p.avg_speed_knots)} />
        <Stat
          label="Vmax (sur 2 s)"
          value={p.vmax_knots != null ? formatSpeed(p.vmax_knots) : '—'}
          highlight
        />
      </div>

      {p.comment && (
        <p className="card p-4 text-sm italic text-slate-300">« {p.comment} »</p>
      )}

      {/* Carte */}
      <div className="space-y-2">
        <h2 className="text-lg font-bold">Tracé</h2>
        <TourMap
          traces={sectorSegments.length > 0 ? sectorSegments : fallbackTrace}
          height={460}
          center={course ? [course.centroid.lat, course.centroid.lon] : undefined}
          centerLabel={data.courseName}
          waypoints={waypoints}
          showWaypointRadius={course?.validationType === 'waypoints'}
        />
        {sectorSegments.length > 0 && (
          <p className="text-xs text-slate-500">
            Couleur relative au record du secteur : vert = rapide, rouge = lent.
          </p>
        )}
      </div>

      {/* Temps par secteur */}
      {p.sector_times && p.sector_times.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold">Temps par secteur</h2>
          <div className="card divide-y divide-slate-800/70">
            {p.sector_times.map((s) => {
              const record = sectorRecords[s.sectorId] ?? null;
              const color = sectorColor(s.durationSeconds, record);
              const delta =
                record && record > 0
                  ? Math.round(((s.durationSeconds - record) / record) * 100)
                  : null;
              return (
                <div key={s.sectorId} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <span className="flex-1 text-sm text-slate-300">{s.name}</span>
                  <span className="font-mono font-semibold text-white">
                    {formatDuration(s.durationSeconds)}
                  </span>
                  <span className="w-24 text-right text-xs text-slate-400">
                    {delta == null
                      ? 'record !'
                      : delta <= 0
                        ? `${delta}% vs record`
                        : `+${delta}% vs record`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-900/60 p-3 text-center">
      <div className={`font-mono text-xl font-bold ${highlight ? 'text-ocean-300' : 'text-white'}`}>
        {value}
      </div>
      <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}
