// Détection d'un tour de l'Île-aux-Moines par « winding number » (indice d'enroulement).
//
// Principe : depuis le centroïde de l'île, chaque point GPS a un angle polaire.
// Si la trace enroule un tour complet autour du centre, la somme des variations
// d'angle (normalisées dans [-π, π]) atteint ±2π. On cherche la fenêtre temporelle
// la plus courte qui réalise ce tour complet, sous contraintes de durée et de vitesse.

import { DEFAULT_DETECTION_OPTIONS } from './constants.js';
import { haversineMeters, MS_TO_KNOTS } from './geo.js';

const TWO_PI = 2 * Math.PI;
const DEG_TO_RAD = Math.PI / 180;

/** Garde les points à l'intérieur de la bounding box du Golfe. */
function filterToZone(points, bbox) {
  return points.filter(
    (p) =>
      p.lat >= bbox.minLat &&
      p.lat <= bbox.maxLat &&
      p.lon >= bbox.minLon &&
      p.lon <= bbox.maxLon,
  );
}

/**
 * Angle cumulé (non borné) autour du centre pour chaque point.
 * angles[i] - angles[j] = rotation nette signée entre les points j et i.
 * La longitude est mise à l'échelle par cos(lat) pour une géométrie correcte.
 */
function cumulativeAngles(points, center) {
  const cosLat = Math.cos(center.lat * DEG_TO_RAD);
  const angles = new Float64Array(points.length);
  let cumulative = 0;
  let previous = 0;

  for (let i = 0; i < points.length; i++) {
    const dy = points[i].lat - center.lat;
    const dx = (points[i].lon - center.lon) * cosLat;
    const theta = Math.atan2(dy, dx);

    if (i > 0) {
      // Variation normalisée dans [-π, π] via atan2(sin, cos) : robuste au wrap.
      const delta = theta - previous;
      cumulative += Math.atan2(Math.sin(delta), Math.cos(delta));
    }
    angles[i] = cumulative;
    previous = theta;
  }
  return angles;
}

/**
 * Pré-calculs réutilisés par toutes les fonctions de détection :
 * points filtrés + triés par temps, angles cumulés, distances cumulées.
 */
function buildContext(points, opts) {
  const inZone = filterToZone(points, opts.bbox).filter((p) =>
    Number.isFinite(p.time),
  );
  // Tri temporel : la détection suppose un parcours chronologique.
  inZone.sort((a, b) => a.time - b.time);

  const n = inZone.length;
  const angles = cumulativeAngles(inZone, opts.center);

  const cumulativeDistance = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    cumulativeDistance[i] =
      cumulativeDistance[i - 1] + haversineMeters(inZone[i - 1], inZone[i]);
  }

  return { points: inZone, n, angles, cumulativeDistance };
}

/** Métriques (durée, distance, vitesse) d'une fenêtre [i, j] sans recopier les points. */
function windowMetrics(ctx, i, j) {
  const durationSeconds = (ctx.points[j].time - ctx.points[i].time) / 1000;
  const distanceM = ctx.cumulativeDistance[j] - ctx.cumulativeDistance[i];
  const avgSpeedKnots =
    durationSeconds > 0 ? (distanceM / durationSeconds) * MS_TO_KNOTS : 0;
  return { durationSeconds, distanceKm: distanceM / 1000, avgSpeedKnots };
}

function isValidTour(metrics, opts) {
  return (
    metrics.durationSeconds >= opts.minDurationSeconds &&
    metrics.avgSpeedKnots >= opts.minSpeedKnots &&
    metrics.avgSpeedKnots <= opts.maxSpeedKnots
  );
}

/** Matérialise un objet « tour » complet (avec les points) pour une fenêtre retenue. */
function buildTour(ctx, i, j, metrics) {
  return {
    startIndex: i,
    endIndex: j,
    startTime: ctx.points[i].time,
    endTime: ctx.points[j].time,
    durationSeconds: metrics.durationSeconds,
    distanceKm: metrics.distanceKm,
    avgSpeedKnots: metrics.avgSpeedKnots,
    points: ctx.points
      .slice(i, j + 1)
      .map((p) => ({ lat: p.lat, lon: p.lon, time: p.time })),
  };
}

/**
 * Retourne le tour VALIDE le plus rapide de la trace, ou null si aucun.
 *
 * Pour chaque point de départ i, on cherche le premier j qui boucle un tour
 * complet (rotation nette ≥ 2π - tolérance) : c'est le tour le plus court
 * partant de i. On retient le plus rapide parmi tous les tours valides.
 */
export function detectBestTour(points, options = {}) {
  const opts = { ...DEFAULT_DETECTION_OPTIONS, ...options };
  const ctx = buildContext(points, opts);
  if (ctx.n < 3) return null;

  const threshold = TWO_PI - opts.angleTolerance;
  let best = null;
  let bestIndices = null;

  for (let i = 0; i < ctx.n; i++) {
    for (let j = i + 1; j < ctx.n; j++) {
      if (Math.abs(ctx.angles[j] - ctx.angles[i]) >= threshold) {
        const metrics = windowMetrics(ctx, i, j);
        if (
          isValidTour(metrics, opts) &&
          (best === null || metrics.durationSeconds < best.durationSeconds)
        ) {
          best = metrics;
          bestIndices = [i, j];
        }
        break; // premier bouclage depuis i = le plus rapide depuis ce départ
      }
    }
  }

  return bestIndices ? buildTour(ctx, bestIndices[0], bestIndices[1], best) : null;
}

/**
 * Retourne TOUS les tours valides, sans chevauchement (chaque nouveau tour
 * démarre là où le précédent s'est terminé). Utile pour compter les boucles
 * d'une session (ex. 2 tours consécutifs).
 */
export function detectAllTours(points, options = {}) {
  const opts = { ...DEFAULT_DETECTION_OPTIONS, ...options };
  const ctx = buildContext(points, opts);
  if (ctx.n < 3) return [];

  const threshold = TWO_PI - opts.angleTolerance;
  const tours = [];
  let start = 0;

  for (let j = 1; j < ctx.n; j++) {
    if (Math.abs(ctx.angles[j] - ctx.angles[start]) >= threshold) {
      const metrics = windowMetrics(ctx, start, j);
      if (isValidTour(metrics, opts)) tours.push(buildTour(ctx, start, j, metrics));
      start = j; // fenêtres non chevauchantes
    }
  }

  return tours;
}

/** Intervalle d'échantillonnage médian (en secondes), pour avertir si GPS trop lent. */
export function estimateSampleIntervalSeconds(points) {
  const times = points
    .map((p) => p.time)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (times.length < 2) return null;

  const deltas = [];
  for (let i = 1; i < times.length; i++) {
    const d = (times[i] - times[i - 1]) / 1000;
    if (d > 0 && d < 3600) deltas.push(d); // ignore les gros trous (pauses)
  }
  if (deltas.length === 0) return null;

  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
}

/**
 * Analyse complète d'une trace : meilleur tour, liste des tours, qualité du signal.
 * C'est la fonction appelée par la route d'upload.
 */
export function analyzeTrack(points, options = {}) {
  const opts = { ...DEFAULT_DETECTION_OPTIONS, ...options };
  const inZone = filterToZone(points, opts.bbox).filter((p) =>
    Number.isFinite(p.time),
  );
  const sampleIntervalSeconds = estimateSampleIntervalSeconds(points);
  const tours = detectAllTours(points, opts);
  const best = detectBestTour(points, opts);

  return {
    totalPoints: points.length,
    pointsInZone: inZone.length,
    sampleIntervalSeconds,
    lowFrequencyWarning:
      sampleIntervalSeconds != null && sampleIntervalSeconds > 2,
    toursDetected: tours.length,
    best,
    tours,
  };
}

export default { detectBestTour, detectAllTours, analyzeTrack, estimateSampleIntervalSeconds };
