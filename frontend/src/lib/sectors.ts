// Découpe d'un tour en segments de secteur + échelle de couleur (vert→rouge),
// pour la carte de résultat de la page de soumission.
import type { Course } from '../config/courses';

export interface LatLonPoint {
  lat: number;
  lon: number;
}

const EARTH_RADIUS_M = 6371008.8;
const DEG = Math.PI / 180;

export function haversineMeters(a: LatLonPoint, b: LatLonPoint): number {
  const lat1 = a.lat * DEG;
  const lat2 = b.lat * DEG;
  const dLat = (b.lat - a.lat) * DEG;
  const dLon = (b.lon - a.lon) * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Index du point du tour le plus proche d'une borne. */
function nearestIndex(points: LatLonPoint[], wp: LatLonPoint): number {
  let best = Infinity;
  let bestI = 0;
  for (let i = 0; i < points.length; i++) {
    const d = haversineMeters(points[i], wp);
    if (d < best) {
      best = d;
      bestI = i;
    }
  }
  return bestI;
}

export interface SectorSegment {
  sectorId: string;
  name: string;
  positions: [number, number][];
}

/**
 * Découpe la polyligne du tour en segments, un par secteur du parcours.
 * Pour chaque borne (waypoint), on prend le point du tour le plus proche, puis
 * on relie les bornes consécutives. L'arc le plus court est conservé (gère le
 * bouclage des parcours « winding »). Purement cosmétique (affichage carte).
 */
export function segmentTourBySectors(
  points: LatLonPoint[],
  course: Course,
): SectorSegment[] {
  if (points.length < 2 || course.waypoints.length === 0) return [];
  const idx = course.waypoints.map((w) => nearestIndex(points, w));
  const n = points.length;

  return course.sectors.map((s) => {
    const a = idx[s.startWaypointIndex];
    const b = idx[s.endWaypointIndex];
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    let slice: LatLonPoint[];
    if (hi - lo <= n / 2) {
      slice = points.slice(lo, hi + 1);
    } else {
      // arc de bouclage : on relie en passant par les extrémités de la trace
      slice = [...points.slice(hi), ...points.slice(0, lo + 1)];
    }
    return {
      sectorId: s.id,
      name: s.name,
      positions: slice.map((p) => [p.lat, p.lon] as [number, number]),
    };
  });
}

/**
 * Couleur d'un secteur selon le ratio (temps / record du secteur).
 * ratio ≈ 1 -> vert (rapide) ; ratio >= seuil -> rouge (lent).
 * record absent -> couleur neutre.
 */
export function sectorColor(durationSeconds: number, recordSeconds: number | null): string {
  if (!recordSeconds || recordSeconds <= 0) return '#64748b'; // neutre
  const ratio = durationSeconds / recordSeconds;
  // 1.0 (record) -> vert ; 1.6+ -> rouge ; interpolation HSL 130°→0°
  const t = Math.max(0, Math.min(1, (ratio - 1) / 0.6));
  const hue = Math.round(130 * (1 - t)); // 130 = vert, 0 = rouge
  return `hsl(${hue}, 75%, 45%)`;
}
