// Outils géométriques : distance Haversine et conversions.

const EARTH_RADIUS_M = 6371008.8; // rayon moyen terrestre (WGS84), en mètres
const DEG_TO_RAD = Math.PI / 180;

/** 1 m/s = 1.9438444924406 nœuds. */
export const MS_TO_KNOTS = 1.9438444924406;

/**
 * Distance orthodromique entre deux points {lat, lon} (en degrés), en mètres.
 * Formule de Haversine.
 */
export function haversineMeters(a, b) {
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Longueur cumulée d'une polyligne de points {lat, lon}, en mètres. */
export function pathDistanceMeters(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1], points[i]);
  }
  return total;
}

/** Convertit une vitesse en m/s vers des nœuds. */
export function metersPerSecondToKnots(mps) {
  return mps * MS_TO_KNOTS;
}

// ── Géométrie polygonale (validation « tour par l'extérieur ») ───────────────
// Mètres par degré de latitude (cohérent avec le rayon Haversine ci-dessus).
const METERS_PER_DEG = DEG_TO_RAD * EARTH_RADIUS_M; // ≈ 111195 m

/**
 * Point-dans-polygone par lancer de rayon (ray casting).
 * polygon = [{lat, lon}, ...] (non fermé : le dernier sommet est relié au premier).
 * Travaille en (lon=x, lat=y) brut : la mise à l'échelle de la longitude par
 * cos(lat) est un facteur positif uniforme qui ne change pas le dedans/dehors.
 * @returns true si le point est STRICTEMENT à l'intérieur.
 */
export function pointInPolygon(point, polygon) {
  const x = point.lon;
  const y = point.lat;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lon;
    const yi = polygon[i].lat;
    const xj = polygon[j].lon;
    const yj = polygon[j].lat;
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Vrai si le polygone (sommets {lat, lon}) est orienté dans le sens HORAIRE.
 * Aire signée par la formule du lacet, en repère mathématique (x=lon est,
 * y=lat nord) : aire < 0 ⇒ sens horaire. Le signe est invariant par mise à
 * l'échelle positive des axes, donc le brut lon/lat suffit.
 */
export function polygonIsClockwise(polygon) {
  let twiceArea = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    twiceArea += a.lon * b.lat - b.lon * a.lat;
  }
  return twiceArea < 0;
}

/** Distance (m) d'un point au segment [a, b] (projection équirectangulaire locale). */
export function pointToSegmentMeters(p, a, b) {
  const cos0 = Math.cos(p.lat * DEG_TO_RAD);
  const ax = (a.lon - p.lon) * cos0 * METERS_PER_DEG;
  const ay = (a.lat - p.lat) * METERS_PER_DEG;
  const bx = (b.lon - p.lon) * cos0 * METERS_PER_DEG;
  const by = (b.lat - p.lat) * METERS_PER_DEG;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  // p est l'origine (0,0) ; projette-la sur [a,b], borne t dans [0,1].
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(cx, cy);
}

/** Distance (m) minimale d'un point au BORD du polygone (n'importe quelle arête). */
export function distanceToPolygonBoundaryMeters(point, polygon) {
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const d = pointToSegmentMeters(point, polygon[j], polygon[i]);
    if (d < best) best = d;
  }
  return best;
}
