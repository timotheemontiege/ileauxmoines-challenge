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

// ============================================================================
// MULTI-PARCOURS : Vmax, secteurs, validation par waypoints, routage detectTour
// ============================================================================

/** Fenêtre minimale (s) pour la Vmax : lisse les artefacts GPS (dt trop court). */
const MIN_VMAX_WINDOW_SECONDS = 2;

/**
 * Vitesse maximale instantanée (en nœuds) sur les points [startIndex, endIndex],
 * calculée sur une fenêtre glissante d'AU MOINS minWindowSeconds.
 *
 * Deux protections complémentaires contre le bruit GPS :
 *  1) REJET DES OUTLIERS : on écarte d'abord tout point dont la vitesse depuis
 *     le dernier point accepté dépasse maxKnots (saut/« téléportation » GPS
 *     physiquement impossible). Cela supprime le pic puis le retour sur la trace.
 *  2) FENÊTRE >= 2 s : pour chaque i, on prend le premier j tel que
 *     (t[j] - t[i]) >= fenêtre, puis vitesse = distance(P_i, P_j) / (t[j] - t[i]).
 *     Exiger >= 2 s élimine les pics dus à deux échantillons trop rapprochés
 *     (dt minuscule -> vitesse absurde).
 * Enfin la Vmax est plafonnée à maxKnots (sécurité).
 * Les points doivent être triés par temps.
 */
export function rejectGpsOutliers(points, maxKnots) {
  const maxMps = maxKnots / MS_TO_KNOTS;
  const out = [];
  for (const p of points) {
    if (!Number.isFinite(p.time)) continue;
    if (out.length === 0) {
      out.push(p);
      continue;
    }
    const prev = out[out.length - 1];
    const dt = (p.time - prev.time) / 1000;
    if (dt <= 0) continue; // timestamps dupliqués/inversés
    const speed = haversineMeters(prev, p) / dt; // m/s
    if (speed <= maxMps) out.push(p); // sinon : saut GPS rejeté
  }
  return out;
}

export function computeVmaxKnots(
  points,
  startIndex = 0,
  endIndex = points.length - 1,
  minWindowSeconds = MIN_VMAX_WINDOW_SECONDS,
  maxKnots = DEFAULT_DETECTION_OPTIONS.maxSpeedKnots,
) {
  // 1) Nettoyage des sauts GPS sur la fenêtre [startIndex, endIndex].
  const clean = rejectGpsOutliers(points.slice(startIndex, endIndex + 1), maxKnots);
  if (clean.length < 2) return 0;

  // 2) Fenêtre glissante >= minWindowSeconds (deux pointeurs).
  let vmax = 0;
  let j = 0;
  const last = clean.length - 1;
  for (let i = 0; i < clean.length; i++) {
    if (j < i) j = i;
    while (j < last && (clean[j].time - clean[i].time) / 1000 < minWindowSeconds) j++;
    const dt = (clean[j].time - clean[i].time) / 1000;
    if (dt >= minWindowSeconds) {
      const knots = (haversineMeters(clean[i], clean[j]) / dt) * MS_TO_KNOTS;
      if (knots > vmax && knots <= maxKnots) vmax = knots; // 3) plafond réaliste
    }
  }
  return vmax;
}

/** Secteur « vide » (borne non atteinte) pour un découpage incomplet. */
function emptySector(s) {
  return { sectorId: s.id, name: s.name, durationSeconds: null, startTime: null, endTime: null };
}

/**
 * Découpe un tour « winding » en secteurs.
 *
 * Pour chaque pointe (borne de secteur), on cherche le point du tour le plus
 * proche -> son instant de passage. Les bornes étant ordonnées angulairement,
 * leur ordre temporel le long de la boucle donne les arcs entre bornes
 * consécutives. L'arc qui contient la jonction départ/arrivée du tour (bouclage)
 * additionne les deux segments (dernière borne -> fin, puis début -> première borne).
 *
 * tourPoints : [{lat, lon, time}] du meilleur tour (non sous-échantillonné).
 */
export function buildWindingSectors(courseConfig, tourPoints) {
  const wps = courseConfig.waypoints || [];
  if (tourPoints.length < 2 || wps.length === 0) {
    return (courseConfig.sectors || []).map(emptySector);
  }

  // Point du tour le plus proche de chaque borne.
  const approach = wps.map((wp) => {
    let bestD = Infinity;
    let bestI = -1;
    for (let i = 0; i < tourPoints.length; i++) {
      const d = haversineMeters(tourPoints[i], wp);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    return { index: bestI, time: bestI >= 0 ? tourPoints[bestI].time : null, distance: bestD };
  });

  const startT = tourPoints[0].time;
  const endT = tourPoints[tourPoints.length - 1].time;

  // Ordre de parcours des bornes (par index croissant le long du tour).
  const ordered = approach
    .map((a, wpIndex) => ({ ...a, wpIndex }))
    .filter((a) => a.index >= 0)
    .sort((x, y) => x.index - y.index);

  // Durée de l'arc entre deux bornes consécutives (mémorisée pour les 2 sens).
  const arcMs = new Map();
  for (let i = 0; i < ordered.length; i++) {
    const cur = ordered[i];
    const nxt = ordered[(i + 1) % ordered.length];
    const dur =
      i + 1 < ordered.length
        ? nxt.time - cur.time
        : endT - cur.time + (nxt.time - startT); // arc de bouclage
    arcMs.set(`${cur.wpIndex}-${nxt.wpIndex}`, dur);
    arcMs.set(`${nxt.wpIndex}-${cur.wpIndex}`, dur);
  }

  return (courseConfig.sectors || []).map((s) => {
    const a = approach[s.startWaypointIndex];
    const b = approach[s.endWaypointIndex];
    const dur = arcMs.get(`${s.startWaypointIndex}-${s.endWaypointIndex}`);
    if (!a || !b || a.index < 0 || b.index < 0 || dur == null) return emptySector(s);
    const lo = Math.min(a.time, b.time);
    const hi = Math.max(a.time, b.time);
    return {
      sectorId: s.id,
      name: s.name,
      durationSeconds: Math.round(dur / 1000),
      startTime: new Date(lo).toISOString(),
      endTime: new Date(hi).toISOString(),
    };
  });
}

/**
 * Recherche le passage ORDONNÉ de chaque waypoint le long de la trace.
 * Un waypoint est « passé » s'il existe un point à moins de radiusMeters ;
 * l'instant retenu est celui du point le plus proche de l'approche.
 * Les waypoints doivent être atteints dans l'ordre (index croissant) ; repasser
 * une borne déjà validée est toléré (on cherche déjà la suivante).
 */
export function findOrderedPassages(points, waypoints) {
  const passages = [];
  let cursor = 0;
  for (let w = 0; w < waypoints.length; w++) {
    const wp = waypoints[w];
    let i = cursor;
    while (i < points.length && haversineMeters(points[i], wp) > wp.radiusMeters) i++;
    if (i >= points.length) {
      return { passages, complete: false, missingIndex: w };
    }
    // Suit l'approche tant qu'on reste dans le rayon ; garde le point le plus proche.
    let bestI = i;
    let bestD = haversineMeters(points[i], wp);
    let j = i;
    while (j < points.length && haversineMeters(points[j], wp) <= wp.radiusMeters) {
      const d = haversineMeters(points[j], wp);
      if (d < bestD) {
        bestD = d;
        bestI = j;
      }
      j++;
    }
    passages.push({ wpIndex: w, index: bestI, time: points[bestI].time, distance: bestD });
    cursor = j; // on repart après être sorti du rayon de cette borne
  }
  return { passages, complete: true };
}

/**
 * Détection par waypoints ordonnés (ex. Tour du Golfe).
 * Le chrono court du premier passage du waypoint 0 au dernier waypoint.
 */
export function detectByWaypoints(points, courseConfig, options = {}) {
  const opts = { ...DEFAULT_DETECTION_OPTIONS, ...options };
  const pts = filterToZone(points, opts.bbox)
    .filter((p) => Number.isFinite(p.time))
    .sort((a, b) => a.time - b.time);

  if (pts.length < 2) return { valid: false, bestTour: null, allTours: [] };

  const { passages, complete } = findOrderedPassages(pts, courseConfig.waypoints);
  if (!complete) return { valid: false, bestTour: null, allTours: [] };

  const startIndex = passages[0].index;
  const endIndex = passages[passages.length - 1].index;
  if (endIndex <= startIndex) return { valid: false, bestTour: null, allTours: [] };

  const startTime = pts[startIndex].time;
  const endTime = pts[endIndex].time;
  const durationSeconds = (endTime - startTime) / 1000;

  let distanceM = 0;
  for (let i = startIndex + 1; i <= endIndex; i++) {
    distanceM += haversineMeters(pts[i - 1], pts[i]);
  }
  const avgSpeedKnots = durationSeconds > 0 ? (distanceM / durationSeconds) * MS_TO_KNOTS : 0;
  const vmaxKnots = computeVmaxKnots(pts, startIndex, endIndex);

  // Secteurs = intervalles entre waypoints consécutifs.
  const sectors = courseConfig.sectors.map((s) => {
    const a = passages[s.startWaypointIndex];
    const b = passages[s.endWaypointIndex];
    if (!a || !b) return emptySector(s);
    return {
      sectorId: s.id,
      name: s.name,
      durationSeconds: Math.round((b.time - a.time) / 1000),
      startTime: new Date(a.time).toISOString(),
      endTime: new Date(b.time).toISOString(),
    };
  });

  const bestTour = {
    startIndex,
    endIndex,
    startTime,
    endTime,
    durationSeconds,
    distanceKm: distanceM / 1000,
    avgSpeedKnots,
    vmaxKnots,
    sectors,
    points: pts.slice(startIndex, endIndex + 1).map((p) => ({ lat: p.lat, lon: p.lon, time: p.time })),
  };

  return { valid: true, bestTour, allTours: [bestTour] };
}

/** Ajoute Vmax + découpage en secteurs à un tour « winding » déjà détecté. */
function enrichWindingTour(tour, courseConfig) {
  tour.vmaxKnots = computeVmaxKnots(tour.points, 0, tour.points.length - 1);
  tour.sectors = buildWindingSectors(courseConfig, tour.points);
  return tour;
}

/** Détection par indice d'enroulement (Île-aux-Moines, Île d'Arz). */
export function detectByWindingNumber(points, courseConfig, options = {}) {
  const opts = {
    ...DEFAULT_DETECTION_OPTIONS,
    ...options,
    center: courseConfig.centroid,
    bbox: courseConfig.boundingBox,
  };
  const best = detectBestTour(points, opts);
  if (!best) return { valid: false, bestTour: null, allTours: [] };

  const allTours = detectAllTours(points, opts).map((t) => enrichWindingTour(t, courseConfig));
  enrichWindingTour(best, courseConfig);
  return { valid: true, bestTour: best, allTours };
}

/**
 * Point d'entrée multi-parcours : route vers la bonne stratégie de détection
 * selon courseConfig.validationType.
 *
 * @returns {{ valid: boolean, bestTour: object|null, allTours: object[] }}
 *   bestTour contient durationSeconds, distanceKm, avgSpeedKnots, vmaxKnots,
 *   sectors[] et points[] (avec temps).
 */
export function detectTour(points, courseConfig) {
  if (!courseConfig) throw new Error('courseConfig requis pour detectTour');
  const opts = {
    center: courseConfig.centroid,
    bbox: courseConfig.boundingBox,
  };
  if (courseConfig.validationType === 'waypoints') {
    return detectByWaypoints(points, courseConfig, opts);
  }
  return detectByWindingNumber(points, courseConfig, opts);
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

export default {
  detectBestTour,
  detectAllTours,
  analyzeTrack,
  estimateSampleIntervalSeconds,
  detectTour,
  detectByWindingNumber,
  detectByWaypoints,
  computeVmaxKnots,
  rejectGpsOutliers,
  buildWindingSectors,
  findOrderedPassages,
};
