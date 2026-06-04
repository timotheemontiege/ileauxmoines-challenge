import { useEffect, useState } from 'react';
import { getLeaderboard } from '../lib/api';
import type { LeaderboardResponse, Period } from '../types';
import Filters from '../components/Filters';
import LeaderboardTable from '../components/LeaderboardTable';
import Spinner from '../components/Spinner';

const PAGE_SIZE = 20;

export default function LeaderboardPage() {
  const [category, setCategory] = useState('all');
  const [period, setPeriod] = useState<Period>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Revenir à la page 1 quand un filtre change.
  useEffect(() => {
    setPage(1);
  }, [category, period]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getLeaderboard({ category, period, page, pageSize: PAGE_SIZE })
      .then((res) => !cancelled && setData(res))
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [category, period, page]);

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-black">Classement</h1>
        <p className="mt-1 text-slate-400">
          Un meilleur temps par rider et par catégorie. {data ? `${data.total} entrées.` : ''}
        </p>
      </header>

      <div className="card p-4">
        <Filters
          category={category}
          period={period}
          onCategoryChange={setCategory}
          onPeriodChange={setPeriod}
        />
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
      ) : (
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
      )}
    </div>
  );
}
