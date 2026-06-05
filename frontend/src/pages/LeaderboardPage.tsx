import { useEffect, useState } from 'react';
import {
  getLeaderboard,
  getSectorLeaderboard,
} from '../lib/api';
import type {
  LeaderboardResponse,
  Period,
  SectorLeaderboardEntry,
} from '../types';
import { useCourse } from '../hooks/useCourse';
import Filters from '../components/Filters';
import LeaderboardTable from '../components/LeaderboardTable';
import SectorLeaderboardTable from '../components/SectorLeaderboardTable';
import Spinner from '../components/Spinner';

const PAGE_SIZE = 20;
type Tab = 'general' | 'sectors';

export default function LeaderboardPage() {
  const { course, courseId } = useCourse();
  const [tab, setTab] = useState<Tab>('general');
  const [category, setCategory] = useState('all');
  const [period, setPeriod] = useState<Period>('all');

  // ── Onglet général ──
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LeaderboardResponse | null>(null);

  // ── Onglet secteurs ──
  const [sectorId, setSectorId] = useState(course.sectors[0]?.id ?? '');
  const [sectorEntries, setSectorEntries] = useState<SectorLeaderboardEntry[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Revenir page 1 / resélectionner un secteur valide quand un filtre change.
  useEffect(() => {
    setPage(1);
  }, [courseId, category, period]);

  useEffect(() => {
    // si le parcours change, garder un secteur valide
    if (!course.sectors.some((s) => s.id === sectorId)) {
      setSectorId(course.sectors[0]?.id ?? '');
    }
  }, [course, sectorId]);

  // Chargement onglet général
  useEffect(() => {
    if (tab !== 'general') return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getLeaderboard({ course: courseId, category, period, page, pageSize: PAGE_SIZE })
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab, courseId, category, period, page]);

  // Chargement onglet secteurs
  useEffect(() => {
    if (tab !== 'sectors' || !sectorId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSectorLeaderboard({ course: courseId, sector: sectorId, category, period })
      .then((res) => !cancelled && setSectorEntries(res.entries))
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [tab, courseId, sectorId, category, period]);

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black">Classement — {course.name}</h1>
        <p className="mt-1 text-slate-400">
          {tab === 'general'
            ? `Un meilleur temps par rider et par catégorie. ${data ? `${data.total} entrées.` : ''}`
            : 'Meilleur temps par rider sur le secteur sélectionné (top 50).'}
        </p>
      </header>

      {/* Sous-onglets */}
      <div className="inline-flex rounded-xl border border-slate-800 bg-slate-900/60 p-1">
        <button
          onClick={() => setTab('general')}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
            tab === 'general' ? 'bg-ocean-600 text-white' : 'text-slate-300 hover:text-white'
          }`}
        >
          Classement général
        </button>
        <button
          onClick={() => setTab('sectors')}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
            tab === 'sectors' ? 'bg-ocean-600 text-white' : 'text-slate-300 hover:text-white'
          }`}
        >
          Classement par secteur
        </button>
      </div>

      <div className="card flex flex-wrap items-end gap-4 p-4">
        <Filters
          category={category}
          period={period}
          onCategoryChange={setCategory}
          onPeriodChange={setPeriod}
        />
        {tab === 'sectors' && (
          <div>
            <label className="label" htmlFor="sector">
              Secteur
            </label>
            <select
              id="sector"
              className="input min-w-[240px]"
              value={sectorId}
              onChange={(e) => setSectorId(e.target.value)}
            >
              {course.sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="card border-red-500/40 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner label="Chargement…" />
        </div>
      ) : tab === 'general' ? (
        <>
          <LeaderboardTable
            entries={data?.entries ?? []}
            startRank={(page - 1) * PAGE_SIZE + 1}
          />
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                className="btn-ghost"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                ← Précédent
              </button>
              <span className="text-sm text-slate-400">
                Page {page} / {totalPages}
              </span>
              <button
                className="btn-ghost"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Suivant →
              </button>
            </div>
          )}
        </>
      ) : (
        <SectorLeaderboardTable entries={sectorEntries} />
      )}
    </div>
  );
}
