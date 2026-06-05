import { Link } from 'react-router-dom';
import type { LeaderboardEntry } from '../types';
import { formatDate, formatDistance, formatDuration, formatSpeed } from '../lib/format';
import CategoryBadge from './CategoryBadge';

const medal = (rank: number) =>
  rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

export default function LeaderboardTable({
  entries,
  startRank = 1,
}: {
  entries: LeaderboardEntry[];
  startRank?: number;
}) {
  if (entries.length === 0) {
    return (
      <div className="card p-8 text-center text-slate-400">
        Aucune performance pour ces filtres. Soyez le premier à boucler un tour !
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-sm">
        <thead className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 font-semibold">Rang</th>
            <th className="px-4 py-3 font-semibold">Rider</th>
            <th className="px-4 py-3 font-semibold">Temps</th>
            <th className="px-4 py-3 font-semibold">Vit. moy.</th>
            <th className="px-4 py-3 font-semibold">Vmax</th>
            <th className="px-4 py-3 font-semibold">Distance</th>
            <th className="px-4 py-3 font-semibold">Matériel</th>
            <th className="px-4 py-3 font-semibold">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/70">
          {entries.map((e, i) => {
            const rank = e.rank ?? startRank + i;
            return (
              <tr key={e.performance_id} className="hover:bg-slate-800/40">
                <td className="px-4 py-3 font-mono font-semibold text-slate-300">
                  <span className="mr-1">{medal(rank)}</span>
                  {rank}
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/profile/${e.username}`}
                    className="font-medium text-ocean-300 hover:text-ocean-200"
                  >
                    {e.username}
                  </Link>
                </td>
                <td className="px-4 py-3 font-mono font-semibold text-white">
                  {formatDuration(e.duration_seconds)}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {formatSpeed(e.avg_speed_knots)}
                </td>
                <td className="px-4 py-3 font-medium text-ocean-200">
                  {e.vmax_knots != null ? formatSpeed(e.vmax_knots) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-300">
                  {formatDistance(e.distance_km)}
                </td>
                <td className="px-4 py-3">
                  <CategoryBadge category={e.category} />
                </td>
                <td className="px-4 py-3 text-slate-400">
                  {formatDate(e.validated_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
