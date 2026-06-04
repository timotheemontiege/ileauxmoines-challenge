// Petits utilitaires de formatage / présentation.

/** Secondes -> "HH:MM:SS" (ex. 2537 -> "00:42:17"). */
export function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/**
 * Sous-échantillonne une trace pour l'affichage carte (jsonb plus léger).
 * Conserve toujours le premier et le dernier point.
 */
export function downsampleTrace(points, maxPoints = 500) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
  const step = points.length / maxPoints;
  const out = [];
  for (let i = 0; i < maxPoints; i++) out.push(points[Math.floor(i * step)]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
