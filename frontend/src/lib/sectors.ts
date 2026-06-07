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
 * Découpe la polyligne du tour en segments colorés par secteur.
 *
 * On classe les bornes par leur ORDRE DE PASSAGE le long de la trace (indice du
 * point le plus proche, trié), puis on découpe la boucle en arcs entre bornes
 * consécutives. Ces arcs PARTITIONNENT toute la trace (aucun point perdu), même
 * si le rider passe les pointes dans un ordre tourné/inversé — c'est la même
 * logique que le backend `buildWindingSectors`. Chaque arc est colorié par la
 * façade à laquelle appartient son arête (gère les façades multi-arêtes du Golfe).
 * Purement cosmétique (affichage carte).
 */
export function segmentTourBySectors(
  points: LatLonPoint[],
  course: Course,
): SectorSegment[] {
  if (points.length < 2 || course.waypoints.length === 0) return [];
  const n = course.waypoints.length;

  // Bornes triées par ordre de passage le long du tour.
  const ordered = course.waypoints
    .map((w, wpIndex) => ({ wpIndex, index: nearestIndex(points, w) }))
    .sort((a, b) => a.index - b.index);

  // Façade contenant l'arête entre deux bornes cycliquement adjacentes (wpA, wpB).
  const sectorForEdge = (wpA: number, wpB: number) => {
    const edge = (wpA + 1) % n === wpB ? wpA : (wpB + 1) % n === wpA ? wpB : -1;
    if (edge < 0) return undefined; // bornes non adjacentes (ordre cassé)
    return course.sectors.find((s) => {
      const count = (((s.endWaypointIndex - s.startWaypointIndex) % n) + n) % n;
      for (let k = 0; k < count; k++) {
        if ((s.startWaypointIndex + k) % n === edge) return true;
      }
      return false;
    });
  };

  return ordered.map((cur, k) => {
    const nxt = ordered[(k + 1) % ordered.length];
    const slice =
      k + 1 < ordered.length
        ? points.slice(cur.index, nxt.index + 1)
        : [...points.slice(cur.index), ...points.slice(0, nxt.index + 1)]; // arc de bouclage
    const sector = sectorForEdge(cur.wpIndex, nxt.wpIndex);
    return {
      sectorId: sector?.id ?? `arc${k}`,
      name: sector?.name ?? '',
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
