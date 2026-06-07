// Conversion partagée « points stockés -> polyligne Leaflet », utilisée par
// l'accueil ET la page détail pour garantir QUE LES DEUX affichent la même trace.
import type { TracePoint } from '../types';

export type LatLngTuple = [number, number];

/** gpx_tour_points -> positions [lat, lon] (trace COMPLÈTE, aucun point perdu). */
export function traceToPositions(points: TracePoint[] | null | undefined): LatLngTuple[] {
  return (points || []).map((p) => [p.lat, p.lon] as LatLngTuple);
}

/**
 * Décimation UNIFORME : garde ~maxPoints répartis sur TOUTE la trace, 1er et
 * dernier points TOUJOURS inclus. Sert à alléger le payload de la carte d'accueil
 * (plusieurs traces) SANS jamais couper une portion — contrairement à un simple
 * `slice`/troncature. Miroir de backend `downsampleTrace`.
 */
export function downsampleUniform<T>(arr: T[], maxPoints: number): T[] {
  if (!Array.isArray(arr) || arr.length <= maxPoints) return arr || [];
  const step = arr.length / maxPoints;
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i++) out.push(arr[Math.floor(i * step)]);
  const last = arr[arr.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}
