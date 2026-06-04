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
