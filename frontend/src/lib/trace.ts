// Conversion partagée « points stockés -> polyligne Leaflet », utilisée par
// l'accueil ET la page détail pour garantir QUE LES DEUX affichent la même trace.
import type { TracePoint } from '../types';

export type LatLngTuple = [number, number];

/** gpx_tour_points -> positions [lat, lon] (trace COMPLÈTE, aucun point perdu). */
export function traceToPositions(points: TracePoint[] | null | undefined): LatLngTuple[] {
  return (points || []).map((p) => [p.lat, p.lon] as LatLngTuple);
}

// Au-delà de cette distance entre deux points CONSÉCUTIFS, on considère qu'il y a
// une COUPURE DE SIGNAL GPS (trou de plusieurs minutes) et non un vrai trajet :
// une trace normale (même décimée) reste sous ~200 m entre points consécutifs.
const MAX_GAP_METERS = 500;
const EARTH_RADIUS_M = 6371008.8;
const DEG = Math.PI / 180;

function distanceMeters(a: LatLngTuple, b: LatLngTuple): number {
  const lat1 = a[0] * DEG;
  const lat2 = b[0] * DEG;
  const dLat = (b[0] - a[0]) * DEG;
  const dLon = (b[1] - a[1]) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Coupe une polyligne en sous-segments continus là où deux points consécutifs
 * sont distants de plus de `maxGapMeters` (= coupure de signal GPS). Évite de
 * tracer une droite par-dessus la terre/l'île entre les deux bords d'un trou GPS.
 */
export function splitAtGaps(
  positions: LatLngTuple[],
  maxGapMeters: number = MAX_GAP_METERS,
): LatLngTuple[][] {
  const segments: LatLngTuple[][] = [];
  let current: LatLngTuple[] = [];
  for (let i = 0; i < positions.length; i++) {
    if (i > 0 && distanceMeters(positions[i - 1], positions[i]) > maxGapMeters) {
      if (current.length) segments.push(current);
      current = [];
    }
    current.push(positions[i]);
  }
  if (current.length) segments.push(current);
  return segments;
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
