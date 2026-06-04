import { Link } from 'react-router-dom';
import type { LeaderboardEntry } from '../types';
import { formatDuration, formatSpeed } from '../lib/format';
import CategoryBadge from './CategoryBadge';

const ORDER = [1, 0, 2]; // 2e, 1er, 3e (1er au centre)
const HEIGHTS = ['h-28', 'h-36', 'h-24'];
const MEDALS = ['🥈', '🥇', '🥉'];

export default function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return null;

  return (
    <div className="grid grid-cols-3 items-end gap-3 sm:gap-6">
      {ORDER.map((idx, position) => {
        const entry = top3[idx];
        if (!entry) return <div key={position} />;
        const isFirst = idx === 0;
        return (
          <div key={entry.performance_id} className="flex flex-col items-center">
            <div
              className={`mb-3 w-full rounded-2xl border p-3 text-center sm:p-4 ${
                isFirst
                  ? 'border-amber-400/40 bg-amber-400/10'
                  : 'border-slate-700 bg-slate-900/60'
              }`}
            >
              <div className="text-2xl">{MEDALS[position]}</div>
              <Link
                to={`/profile/${entry.username}`}
                className="mt-1 block truncate font-semibold text-white hover:text-ocean-300"
                title={entry.username}
              >
                {entry.username}
              </Link>
              <div className="mt-1 font-mono text-lg font-bold text-ocean-300">
                {formatDuration(entry.duration_seconds)}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {formatSpeed(entry.avg_speed_knots)}
              </div>
              <div className="mt-2 flex justify-center">
                <CategoryBadge category={entry.category} />
              </div>
            </div>
            <div
              className={`flex w-full items-center justify-center rounded-t-xl bg-gradient-to-t ${
                isFirst
                  ? 'from-amber-500/30 to-amber-400/10'
                  : 'from-slate-800 to-slate-800/40'
              } ${HEIGHTS[position]}`}
            >
              <span className="text-3xl font-black text-slate-500">
                {idx + 1}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
