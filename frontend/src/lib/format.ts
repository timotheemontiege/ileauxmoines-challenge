/** Secondes -> "HH:MM:SS" ou "MM:SS" si moins d'une heure. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function formatSpeed(knots: number): string {
  return `${knots.toFixed(1)} nds`;
}

export function formatDistance(km: number): string {
  return `${km.toFixed(2)} km`;
}

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFormatter.format(d);
}

export function beaufortLabel(force: number | null | undefined): string {
  if (force == null) return '—';
  return `${force} Bft`;
}
