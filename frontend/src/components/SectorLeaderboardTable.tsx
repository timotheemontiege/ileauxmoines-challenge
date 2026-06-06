import { Link, useNavigate } from 'react-router-dom';
import type { SectorLeaderboardEntry } from '../types';
import { formatDate, formatDuration } from '../lib/format';
import CategoryBadge from './CategoryBadge';

const medal = (rank: number) =>
  rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

export default function SectorLeaderboardTable({
  entries,
}: {
  entries: SectorLeaderboardEntry[];
}) {
  const navigate = useNavigate();
  if (entries.length === 0) {
    return (
      <div className="card p-8 text-center text-slate-400">
        Aucun temps enregistré sur ce secteur pour ces filtres.
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-semibold">Rang</th>
            <th className="px-4 py-3 font-semibold">Rider</th>
            <th className="px-4 py-3 font-semibold">Temps du secteur</th>
            <th className="px-4 py-3 font-semibold">Matériel</th>
            <th className="px-4 py-3 font-semibold">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {entries.map((e) => (
            <tr
              key={e.sector_perf_id}
              onClick={() => navigate(`/trace/${e.performance_id}`)}
              className="cursor-pointer hover:bg-slate-800/40"
              title="Voir le détail de la trace"
            >
              <td className="px-4 py-3 font-mono font-semibold text-slate-300">
                <span className="mr-1">{medal(e.rank)}</span>
                {e.rank}
              </td>
              <td className="px-4 py-3">
                <Link
                  to={`/profile/${e.username}`}
                  onClick={(ev) => ev.stopPropagation()}
                  className="font-medium text-ocean-300 hover:text-ocean-200"
                >
                  {e.username}
                </Link>
              </td>
              <td className="px-4 py-3 font-mono font-semibold text-white">
                {formatDuration(e.duration_seconds)}
              </td>
              <td className="px-4 py-3">
                <CategoryBadge category={e.category} />
              </td>
              <td className="px-4 py-3 text-slate-400">
                {formatDate(e.achieved_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
