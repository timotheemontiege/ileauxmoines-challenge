import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLeaderboard, getLeaderboardTraces } from '../lib/api';
import { traceToPositions, downsampleUniform } from '../lib/trace';
import type { LeaderboardEntry, TraceRecord } from '../types';
import { categoryColor } from '../lib/categories';
import { formatDuration } from '../lib/format';
import { useCourse } from '../hooks/useCourse';
import Podium from '../components/Podium';
import Filters from '../components/Filters';
import LeaderboardTable from '../components/LeaderboardTable';
import TourMap, { type MapTrace, type MapWaypoint } from '../components/TourMap';
import Spinner from '../components/Spinner';

export default function HomePage() {
  const { course, courseId } = useCourse();
  const [category, setCategory] = useState('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [traces, setTraces] = useState<TraceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      getLeaderboard({ course: courseId, category, period: 'all', pageSize: 10 }),
      // Carte : uniquement le meilleur itinéraire du classement (n°1).
      getLeaderboardTraces({ course: courseId, category, period: 'all', limit: 1 }),
    ])
      .then(([board, tr]) => {
        if (cancelled) return;
        // Diagnostic (ÉTAPE 2.1) : nombre de points reçus par l'accueil par trace.
        if (import.meta.env.DEV) {
          tr.forEach((t) =>
            console.debug(
              `[accueil] trace ${t.performance_id}: ${(t.gpx_tour_points || []).length} pts (gpx_tour_points)`,
            ),
          );
        }
        setEntries(board.entries);
        setTraces(tr);
      })
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [courseId, category]);

  const mapTraces = useMemo<MapTrace[]>(
    () =>
      traces
        .map((t) => ({
          id: t.performance_id,
          // Trace COMPLÈTE (même source que la page détail), décimée UNIFORMÉMENT
          // si besoin pour alléger la carte — jamais tronquée. Cap large (no-op
          // tant que le stockage borne déjà à ~500 pts via downsampleTrace).
          positions: downsampleUniform(traceToPositions(t.gpx_tour_points), 1000),
          color: categoryColor(t.category),
          label: `${t.username} · ${formatDuration(t.duration_seconds)}`,
        }))
        .filter((t) => t.positions.length > 1),
    [traces],
  );

  const mapWaypoints = useMemo<MapWaypoint[]>(
    () =>
      course.waypoints.map((w) => ({
        id: w.id,
        name: w.name,
        lat: w.lat,
        lon: w.lon,
        radiusMeters: w.radiusMeters,
      })),
    [course],
  );

  // Parcours à balises (waypoints / outer-loop) : on affiche les cercles d'approche.
  const hasMarkers = course.validationType !== 'winding';

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-ocean-950 via-slate-900 to-slate-950 p-8 sm:p-12">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-ocean-400">
            Golfe du Morbihan
          </p>
          <h1 className="mt-2 text-4xl font-black leading-tight sm:text-5xl">
            {course.name}
          </h1>
          <p className="mt-4 text-lg text-slate-300">{course.description}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/submit" className="btn-primary">
              Soumettre une trace
            </Link>
            <Link to="/leaderboard" className="btn-ghost">
              Voir le classement
            </Link>
          </div>
        </div>
      </section>

      {error && (
        <div className="card border-red-500/40 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Chargement du classement…" />
        </div>
      ) : (
        <>
          {/* Podium */}
          {entries.length > 0 && (
            <section>
              <h2 className="mb-5 text-xl font-bold">🏆 Podium</h2>
              <Podium entries={entries} />
            </section>
          )}

          {/* Filtre + carte : meilleur itinéraire */}
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-bold">🗺️ Meilleur itinéraire</h2>
              <Filters
                category={category}
                onCategoryChange={setCategory}
                showPeriod={false}
              />
            </div>
            <TourMap
              traces={mapTraces}
              height={460}
              center={[course.centroid.lat, course.centroid.lon]}
              centerLabel={course.name}
              waypoints={mapWaypoints}
              showWaypointRadius={hasMarkers}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {hasMarkers && (
                <p className="text-sm text-slate-500">
                  Les cercles bleus marquent les {course.waypoints.length} balises et
                  leur rayon d'approche ({course.waypoints[0]?.radiusMeters} m).
                </p>
              )}
              {traces[0] && (
                <Link
                  to={`/trace/${traces[0].performance_id}`}
                  className="text-sm text-ocean-300 hover:text-ocean-200"
                >
                  Détail du meilleur tour ({traces[0].username}) →
                </Link>
              )}
            </div>
            {mapTraces.length === 0 && (
              <p className="text-sm text-slate-500">
                Aucun tracé à afficher pour cette catégorie sur ce parcours.
              </p>
            )}
          </section>

          {/* Top 10 */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Meilleurs temps</h2>
              <Link
                to="/leaderboard"
                className="text-sm text-ocean-300 hover:text-ocean-200"
              >
                Classement complet →
              </Link>
            </div>
            <LeaderboardTable entries={entries} />
          </section>
        </>
      )}
    </div>
  );
}
