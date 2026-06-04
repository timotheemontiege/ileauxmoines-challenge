import type { Category } from '../types';

export interface CategoryMeta {
  value: Category;
  label: string;
  color: string;
  emoji: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { value: 'wingfoil', label: 'Wingfoil', color: '#22d3ee', emoji: '🪽' },
  { value: 'windsurf', label: 'Windsurf', color: '#f59e0b', emoji: '🏄' },
  { value: 'kitesurf', label: 'Kitesurf', color: '#ec4899', emoji: '🪁' },
  { value: 'voile_legere', label: 'Voile légère', color: '#34d399', emoji: '⛵' },
  { value: 'autre', label: 'Autre', color: '#a78bfa', emoji: '🌊' },
];

const BY_VALUE = new Map(CATEGORIES.map((c) => [c.value, c]));

export function categoryMeta(value: string): CategoryMeta {
  return (
    BY_VALUE.get(value as Category) ?? {
      value: 'autre',
      label: value,
      color: '#94a3b8',
      emoji: '🌊',
    }
  );
}

export const categoryLabel = (value: string) => categoryMeta(value).label;
export const categoryColor = (value: string) => categoryMeta(value).color;
