import { CATEGORIES } from '../lib/categories';
import type { Period } from '../types';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'all', label: 'Tous les temps' },
  { value: 'year', label: 'Année en cours' },
  { value: '30d', label: '30 derniers jours' },
];

interface Props {
  category: string;
  period?: string;
  onCategoryChange: (value: string) => void;
  onPeriodChange?: (value: Period) => void;
  showPeriod?: boolean;
}

export default function Filters({
  category,
  period = 'all',
  onCategoryChange,
  onPeriodChange,
  showPeriod = true,
}: Props) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <label className="label" htmlFor="filter-category">
          Catégorie
        </label>
        <select
          id="filter-category"
          className="input min-w-[180px]"
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
        >
          <option value="all">Toutes catégories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.emoji} {c.label}
            </option>
          ))}
        </select>
      </div>

      {showPeriod && onPeriodChange && (
        <div>
          <label className="label" htmlFor="filter-period">
            Période
          </label>
          <select
            id="filter-period"
            className="input min-w-[180px]"
            value={period}
            onChange={(e) => onPeriodChange(e.target.value as Period)}
          >
            {PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
