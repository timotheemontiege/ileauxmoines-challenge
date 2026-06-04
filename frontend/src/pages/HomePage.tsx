import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getLeaderboard, getLeaderboardTraces } from '../lib/api';
import type { LeaderboardEntry, TraceRecord } from '../types';
import { categoryColor } from '../lib/categories';
import { formatDuration } from '../lib/format';
import Podium from '../components/Podium';
import Filters from '../components/Filters';
import LeaderboardTable from '../components/LeaderboardTable';
import TourMap, { type MapTrace } from '../components/TourMap';
import Spinner from '../components/Spinner';

export default function HomePage() {
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
      getLeaderboard({ category, period: 'all', pageSize: 10 }),
      getLeaderboardTraces({ category, period: 'all', limit: 20 }),
    ])
      .then(([board, tr]) => {
        if (cancelled) return;
        setEntries(board.entries);
        setTraces(tr);
      })
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [category]);

  const mapTraces = useMemo<MapTrace[]>(
    () =>
      traces
        .map((t) => ({
          id: t.performance_id,
          positions: (t.gpx_tour_points || []).map(
            (p) => [p.lat, p.lon] as [number, number],
          ),
          color: categoryColor(t.category),
          label: `${t.username} · ${formatDuration(t.duration_seconds)}`,
        }))
        .filter((t) => t.positions.length > 1),
    [traces],
  );

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-ocean-950 via-slate-900 to-slate-950 p-8 sm:p-12">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-widest text-ocean-400">
            Golfe du Morbihan
          </p>
          <h1 className="mt-2 text-4xl font-black leading-tight sm:text-5xl">
            Le record du tour de l'Île-aux-Moines
          </h1>
          <p className="mt-4 text-lg text-slate-300">
            Envoie ta trace GPX. On détecte automatiquement le tour complet,
            on extrait ton meilleur temps et on met à jour le classement.
          </p>
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

          {/* Filtre + carte */}
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-bold">🗺️ Tracés des records</h2>
              <Filters
                category={category}
                onCategoryChange={setCategory}
                showPeriod={false}
              />
            </div>
            <TourMap traces={mapTraces} height={460} />
            {mapTraces.length === 0 && (
              <p className="text-sm text-slate-500">
                Aucun tracé à afficher pour cette catégorie.
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
