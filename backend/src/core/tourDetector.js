// Détection d'un tour de l'Île-aux-Moines par « winding number » (indice d'enroulement).
//
// Principe : depuis le centroïde de l'île, chaque point GPS a un angle polaire.
// Si la trace enroule un tour complet autour du centre, la somme des variations
// d'angle (normalisées dans [-π, π]) atteint ±2π. On cherche la fenêtre temporelle
// la plus courte qui réalise ce tour complet, sous contraintes de durée et de vitesse.

import {
  DEFAULT_DETECTION_OPTIONS,
  OUTER_LOOP_INCURSION_DEPTH_METERS,
} from './constants.js';
import {
  haversineMeters,
  MS_TO_KNOTS,
  pointInPolygon,
  polygonIsClockwise,
  distanceToPolygonBoundaryMeters,
} from './geo.js';

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
    // speedRaw conservé pour permettre la Vmax Doppler ; retiré ensuite de la
    // polyligne renvoyée (cf. enrichWindingTour) pour ne pas l'alourdir.
    points: ctx.points
      .slice(i, j + 1)
      .map((p) => ({ lat: p.lat, lon: p.lon, time: p.time, speedRaw: p.speedRaw ?? null })),
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

// ----------------------------------------------------------------------------
// Calcul de la Vmax — cascade Doppler → position → nettoyage (Hampel + coupures).
// Toutes les constantes de réglage sont regroupées ici.
// ----------------------------------------------------------------------------

/** Fraction minimale de points porteurs d'une vitesse MESURÉE (Doppler) pour
 *  préférer le NIVEAU 1 (speedRaw) au NIVEAU 2 (calcul par position). */
const DOPPLER_MIN_COVERAGE = 0.8;

/** Accélération max physiquement plausible entre 2 segments (m/s²). Au-delà =
 *  saut GPS → le segment est invalidé (NIVEAU 2). 6 m/s² reste très généreux
 *  pour de la glisse (≈ 0→22 nds en ~2 s). */
const ACCEL_MAX_MS2 = 6;

/** Filtre de Hampel (médiane glissante robuste, NIVEAU 3) : taille de fenêtre
 *  (impair) et seuil en nombre d'écarts-types robustes (1.4826·MAD). */
const HAMPEL_WINDOW = 7;
const HAMPEL_NSIGMA = 3;

/** Coupure de signal : un intervalle de temps supérieur à ce seuil (s) trahit
 *  une perte GPS ; les vitesses des points suivants sont parasites (NIVEAU 3). */
const SIGNAL_GAP_SECONDS = 5;
/** Nombre de points invalidés juste après une coupure (le saut + sa correction). */
const GAP_INVALIDATE_POINTS = 2;

/** Garde-fou physique ABSOLU (nds). Ce n'est PAS un plafond « loisir » : c'est
 *  la borne au-delà de laquelle une vitesse ne peut être qu'un artefact résiduel.
 *  À monter si tu ajoutes des engins de compétition très rapides (foil race). */
const VMAX_HARD_CEILING_KNOTS = 50;

/** Marge (nds) au-delà de laquelle Vmax est jugée « suspecte » vs la vitesse
 *  moyenne du tour. Purement informatif — n'altère JAMAIS la Vmax retournée. */
const VMAX_SANITY_MARGIN_KNOTS = 15;

const MS_PER_KNOT = 1 / MS_TO_KNOTS;

/** Médiane d'un tableau de nombres (copie triée). NaN si vide. */
function median(values) {
  if (values.length === 0) return NaN;
  const s = values.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * NIVEAUX 1 & 2 — Série de vitesses (m/s), une valeur par point (NaN = invalide).
 *  - NIVEAU 1 : si la vitesse mesurée (Doppler, point.speedRaw) couvre au moins
 *    `minCoverage` des points → on l'utilise telle quelle (bien plus fiable que
 *    le calcul position-à-position).
 *  - NIVEAU 2 (repli) : vitesse de segment = haversine(Pi-1, Pi) / dt, AVEC un
 *    filtre d'accélération : tout segment dont |Δv|/dt dépasse accelMax est jugé
 *    physiquement impossible (saut GPS) et invalidé (NaN) — jamais utilisé pour
 *    gonfler la Vmax. Les dt ≤ 0 (timestamps dupliqués) sont ignorés.
 *
 * @returns {{ series: Float64Array, source: 'doppler'|'position' }}
 */
export function buildSpeedSeries(points, accelMax = ACCEL_MAX_MS2, minCoverage = DOPPLER_MIN_COVERAGE) {
  const n = points.length;
  const series = new Float64Array(n).fill(NaN);
  const measured = points.reduce((c, p) => c + (Number.isFinite(p?.speedRaw) ? 1 : 0), 0);

  // NIVEAU 1 — Doppler.
  if (n > 0 && measured / n >= minCoverage) {
    for (let i = 0; i < n; i++) {
      if (Number.isFinite(points[i].speedRaw)) series[i] = points[i].speedRaw;
    }
    return { series, source: 'doppler' };
  }

  // NIVEAU 2 — position + filtre d'accélération.
  let prevSegV = NaN; // vitesse du segment précédent (mesure le « jerk »)
  for (let i = 1; i < n; i++) {
    const dt = (points[i].time - points[i - 1].time) / 1000;
    if (!(dt > 0)) { prevSegV = NaN; continue; } // dupliqués / non triés
    const v = haversineMeters(points[i - 1], points[i]) / dt;
    series[i] = Number.isFinite(prevSegV) && Math.abs(v - prevSegV) / dt > accelMax ? NaN : v;
    prevSegV = v; // un spike isolé rejette 2 segments (aller + retour) : voulu
  }
  if (n > 1 && Number.isFinite(series[1])) series[0] = series[1]; // pt 0 sans amont
  return { series, source: 'position' };
}

/**
 * NIVEAU 3 — Filtre de Hampel. Pour chaque point : médiane + MAD sur la fenêtre
 * glissante ; si |valeur − médiane| > nSigma·1.4826·MAD → remplacée par la médiane.
 * Comble aussi les trous (NaN) avec la médiane locale. Retourne une NOUVELLE série.
 */
export function hampelFilter(series, windowSize = HAMPEL_WINDOW, nSigma = HAMPEL_NSIGMA) {
  const n = series.length;
  const out = Float64Array.from(series);
  const k = Math.max(1, windowSize >> 1);
  for (let i = 0; i < n; i++) {
    const win = [];
    for (let j = Math.max(0, i - k); j <= Math.min(n - 1, i + k); j++) {
      if (Number.isFinite(series[j])) win.push(series[j]);
    }
    if (win.length === 0) continue;
    const med = median(win);
    if (!Number.isFinite(series[i])) { out[i] = med; continue; } // comble le trou
    const mad = median(win.map((v) => Math.abs(v - med)));
    const sigma = 1.4826 * mad;
    if (sigma > 0 && Math.abs(series[i] - med) > nSigma * sigma) out[i] = med;
  }
  return out;
}

/**
 * NIVEAU 3 — Rejet des reprises après coupure de signal. Un dt > gapSeconds
 * trahit une perte GPS ; à la reprise, le saut de position (ou un Doppler
 * réacquis) ment. On invalide (NaN) les `invalidate` points suivant le trou.
 * Mute la série passée et la retourne.
 */
export function rejectSignalGaps(points, series, gapSeconds = SIGNAL_GAP_SECONDS, invalidate = GAP_INVALIDATE_POINTS) {
  for (let i = 1; i < points.length; i++) {
    const dt = (points[i].time - points[i - 1].time) / 1000;
    if (dt > gapSeconds) {
      for (let k = 0; k < invalidate && i + k < series.length; k++) series[i + k] = NaN;
    }
  }
  return series;
}

/**
 * Vmax robuste (cascade complète) + métadonnées de diagnostic.
 * @returns {{ vmaxKnots:number, source:'doppler'|'position', cleanCount:number }}
 */
export function computeVmaxDetailed(points, startIndex = 0, endIndex = points.length - 1) {
  const slice = points.slice(startIndex, endIndex + 1);
  if (slice.length < 2) return { vmaxKnots: 0, source: 'position', cleanCount: 0 };

  const { series, source } = buildSpeedSeries(slice); // NIVEAU 1 ou 2
  const cleaned = hampelFilter(series); // NIVEAU 3 — outliers robustes
  rejectSignalGaps(slice, cleaned); // NIVEAU 3 — coupures de signal

  // Max robuste, sous le garde-fou physique absolu.
  const ceil = VMAX_HARD_CEILING_KNOTS * MS_PER_KNOT;
  let vmax = 0;
  let cleanCount = 0;
  for (const v of cleaned) {
    if (Number.isFinite(v) && v <= ceil) {
      cleanCount++;
      if (v > vmax) vmax = v;
    }
  }
  return { vmaxKnots: vmax * MS_TO_KNOTS, source, cleanCount };
}

/**
 * Vitesse maximale instantanée (nœuds) sur [startIndex, endIndex], via la cascade
 * Doppler → position → Hampel → rejet des coupures. Les points doivent être triés
 * par temps et porter {lat, lon, time[, speedRaw]}.
 */
export function computeVmaxKnots(points, startIndex = 0, endIndex = points.length - 1) {
  return computeVmaxDetailed(points, startIndex, endIndex).vmaxKnots;
}

/**
 * Contrôle de cohérence (sanity check) : Vmax suspecte si elle dépasse la vitesse
 * moyenne de plus de `margin` nœuds. Informatif uniquement.
 */
export function isVmaxSuspect(vmaxKnots, avgSpeedKnots, margin = VMAX_SANITY_MARGIN_KNOTS) {
  return (
    Number.isFinite(vmaxKnots) &&
    Number.isFinite(avgSpeedKnots) &&
    vmaxKnots > avgSpeedKnots + margin
  );
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
  const vm = computeVmaxDetailed(pts, startIndex, endIndex); // pts portent speedRaw

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
    vmaxKnots: vm.vmaxKnots,
    vmaxSource: vm.source, // 'doppler' | 'position' (diagnostic)
    vmaxSuspect: isVmaxSuspect(vm.vmaxKnots, avgSpeedKnots),
    sectors,
    points: pts.slice(startIndex, endIndex + 1).map((p) => ({ lat: p.lat, lon: p.lon, time: p.time })),
  };

  return { valid: true, bestTour, allTours: [bestTour] };
}

// ----------------------------------------------------------------------------
// Validation « tour par l'extérieur » (Tour du Golfe).
// Le rider longe les N balises (sommets du polygone P) dans l'ordre cyclique,
// dans UN sens (cw|ccw), départ libre, en restant DEHORS de P et sans couper P.
// ----------------------------------------------------------------------------

/**
 * Séquence des « visites » de balises le long de la trace. Une visite = un
 * passage continu dans le rayon d'une balise ; on retient le point le plus
 * proche (l'« approche ») et si ce point est à l'extérieur du polygone P.
 * Les visites consécutives sur la MÊME balise sont fusionnées (dip GPS toléré).
 */
function buildBaliseVisits(pts, balises, polygon) {
  const raw = [];
  let cur = null; // { balise, bestI, bestD }
  for (let i = 0; i < pts.length; i++) {
    let bIdx = -1;
    let bD = Infinity;
    for (let b = 0; b < balises.length; b++) {
      const d = haversineMeters(pts[i], balises[b]);
      if (d <= balises[b].radiusMeters && d < bD) {
        bD = d;
        bIdx = b;
      }
    }
    if (bIdx === -1) {
      if (cur) { raw.push(cur); cur = null; }
      continue;
    }
    if (cur && cur.balise === bIdx) {
      if (bD < cur.bestD) { cur.bestD = bD; cur.bestI = i; }
    } else {
      if (cur) raw.push(cur);
      cur = { balise: bIdx, bestI: i, bestD: bD };
    }
  }
  if (cur) raw.push(cur);

  // Fusionne les visites consécutives de même balise (sortie/retour bref du rayon).
  const merged = [];
  for (const v of raw) {
    const last = merged[merged.length - 1];
    if (last && last.balise === v.balise) {
      if (v.bestD < last.bestD) { last.bestD = v.bestD; last.bestI = v.bestI; }
    } else {
      merged.push({ ...v });
    }
  }

  return merged.map((v) => {
    const p = pts[v.bestI];
    return {
      balise: v.balise,
      index: v.bestI,
      time: p.time,
      distance: v.bestD,
      outside: !pointInPolygon(p, polygon),
    };
  });
}

/**
 * Si la suite d'indices de balises est un ordre cyclique cohérent (pas constant
 * de +1 ou -1 modulo N, N balises distinctes), retourne le sens ; sinon null.
 * Le sens (cw|ccw) tient compte de l'orientation réelle du polygone.
 */
function cyclicDirection(baliseSeq, N, clockwisePolygon) {
  if (baliseSeq.length !== N) return null;
  if (new Set(baliseSeq).size !== N) return null; // doit couvrir les N balises
  const step = (((baliseSeq[1] - baliseSeq[0]) % N) + N) % N;
  if (step !== 1 && step !== N - 1) return null;
  for (let k = 1; k < N; k++) {
    const d = (((baliseSeq[k] - baliseSeq[k - 1]) % N) + N) % N;
    if (d !== step) return null;
  }
  // step=1 -> parcours dans l'ordre des sommets ; cw si le polygone est horaire.
  if (step === 1) return clockwisePolygon ? 'cw' : 'ccw';
  return clockwisePolygon ? 'ccw' : 'cw';
}

/** Indice de l'arête du polygone reliant 2 sommets cycliquement adjacents (sinon -1). */
function edgeBetween(a, b, N) {
  if ((a + 1) % N === b) return a;
  if ((b + 1) % N === a) return b;
  return -1;
}

/**
 * (D) Vrai si, entre 2 approches consécutives de la fenêtre, la trace fait une
 * incursion FRANCHE dans P : un point strictement dedans, à plus de `depth`
 * mètres du bord, ET hors du rayon de toute balise (tolérance bruit/arrondi).
 */
function hasDeepIncursion(pts, window, polygon, balises, depth) {
  for (let k = 0; k + 1 < window.length; k++) {
    for (let i = window[k].index + 1; i < window[k + 1].index; i++) {
      const p = pts[i];
      if (!pointInPolygon(p, polygon)) continue;
      let nearBalise = false;
      for (const b of balises) {
        if (haversineMeters(p, b) <= b.radiusMeters) { nearBalise = true; break; }
      }
      if (nearBalise) continue;
      if (distanceToPolygonBoundaryMeters(p, polygon) > depth) return true;
    }
  }
  return false;
}

/**
 * Découpe en façades (secteurs) à partir des temps de passage de la fenêtre.
 * Une façade peut regrouper plusieurs arêtes (ex. 6 balises -> 4 façades) ;
 * elle n'est mesurée que si TOUTES ses arêtes ont été parcourues dans la fenêtre
 * (sinon emptySector — la fenêtre ouverte laisse une arête non parcourue).
 */
function buildOuterLoopSectors(courseConfig, window, N) {
  const edgeInfo = new Map();
  for (let k = 0; k + 1 < window.length; k++) {
    const e = edgeBetween(window[k].balise, window[k + 1].balise, N);
    if (e < 0) continue;
    const t0 = Math.min(window[k].time, window[k + 1].time);
    const t1 = Math.max(window[k].time, window[k + 1].time);
    edgeInfo.set(e, { dur: t1 - t0, t0, t1 });
  }
  return (courseConfig.sectors || []).map((s) => {
    const count = (((s.endWaypointIndex - s.startWaypointIndex) % N) + N) % N;
    const edges = [];
    for (let e = 0; e < count; e++) edges.push((s.startWaypointIndex + e) % N);
    if (count === 0 || !edges.every((e) => edgeInfo.has(e))) return emptySector(s);
    let total = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const e of edges) {
      const info = edgeInfo.get(e);
      total += info.dur;
      lo = Math.min(lo, info.t0);
      hi = Math.max(hi, info.t1);
    }
    return {
      sectorId: s.id,
      name: s.name,
      durationSeconds: Math.round(total / 1000),
      startTime: new Date(lo).toISOString(),
      endTime: new Date(hi).toISOString(),
    };
  });
}

/**
 * Détection « tour par l'extérieur » (Tour du Golfe).
 * Valide si les N balises sont approchées (A) dans l'ordre cyclique d'un sens
 * cohérent, départ libre (B), chaque approche DEHORS de P (C), sans incursion
 * franche dans P entre 2 approches (D). Fenêtre = 1ʳᵉ → Nᵉ balise ; si plusieurs
 * boucles valides, on garde la plus rapide.
 */
export function detectByOuterLoop(points, courseConfig, options = {}) {
  const opts = { ...DEFAULT_DETECTION_OPTIONS, ...options };
  const pts = filterToZone(points, opts.bbox)
    .filter((p) => Number.isFinite(p.time))
    .sort((a, b) => a.time - b.time);
  if (pts.length < 2) return { valid: false, bestTour: null, allTours: [] };

  const balises = courseConfig.waypoints || [];
  const N = balises.length;
  if (N < 3) return { valid: false, bestTour: null, allTours: [] };

  const polygon = balises.map((b) => ({ lat: b.lat, lon: b.lon }));
  const clockwise = polygonIsClockwise(polygon);
  const depth = opts.incursionDepthMeters ?? OUTER_LOOP_INCURSION_DEPTH_METERS;

  const visits = buildBaliseVisits(pts, balises, polygon);
  if (visits.length < N) return { valid: false, bestTour: null, allTours: [] };

  let best = null;
  // Fenêtre glissante de N visites consécutives (départ libre).
  for (let s = 0; s + N <= visits.length; s++) {
    const window = visits.slice(s, s + N);
    const direction = cyclicDirection(window.map((v) => v.balise), N, clockwise); // (B)
    if (!direction) continue;
    if (!window.every((v) => v.outside)) continue; // (C)
    if (hasDeepIncursion(pts, window, polygon, balises, depth)) continue; // (D)

    const startIndex = window[0].index;
    const endIndex = window[N - 1].index;
    if (endIndex <= startIndex) continue;

    const durationSeconds = (pts[endIndex].time - pts[startIndex].time) / 1000;
    let distanceM = 0;
    for (let i = startIndex + 1; i <= endIndex; i++) {
      distanceM += haversineMeters(pts[i - 1], pts[i]);
    }
    const avgSpeedKnots = durationSeconds > 0 ? (distanceM / durationSeconds) * MS_TO_KNOTS : 0;
    const metrics = { durationSeconds, distanceKm: distanceM / 1000, avgSpeedKnots };
    if (!isValidTour(metrics, opts)) continue; // (A) implicite : N visites cycliques trouvées

    if (best === null || metrics.durationSeconds < best.durationSeconds) {
      best = { ...metrics, startIndex, endIndex, window, direction };
    }
  }

  if (!best) return { valid: false, bestTour: null, allTours: [] };

  const vm = computeVmaxDetailed(pts, best.startIndex, best.endIndex); // pts portent speedRaw
  const bestTour = {
    startIndex: best.startIndex,
    endIndex: best.endIndex,
    startTime: pts[best.startIndex].time,
    endTime: pts[best.endIndex].time,
    durationSeconds: best.durationSeconds,
    distanceKm: best.distanceKm,
    avgSpeedKnots: best.avgSpeedKnots,
    vmaxKnots: vm.vmaxKnots,
    vmaxSource: vm.source, // 'doppler' | 'position' (diagnostic)
    vmaxSuspect: isVmaxSuspect(vm.vmaxKnots, best.avgSpeedKnots),
    direction: best.direction, // 'cw' | 'ccw' (info)
    sectors: buildOuterLoopSectors(courseConfig, best.window, N),
    points: pts
      .slice(best.startIndex, best.endIndex + 1)
      .map((p) => ({ lat: p.lat, lon: p.lon, time: p.time })),
  };

  return { valid: true, bestTour, allTours: [bestTour] };
}

/** Ajoute Vmax + découpage en secteurs à un tour « winding » déjà détecté. */
function enrichWindingTour(tour, courseConfig) {
  const vm = computeVmaxDetailed(tour.points, 0, tour.points.length - 1);
  tour.vmaxKnots = vm.vmaxKnots;
  tour.vmaxSource = vm.source; // 'doppler' | 'position' (diagnostic)
  tour.vmaxSuspect = isVmaxSuspect(vm.vmaxKnots, tour.avgSpeedKnots);
  tour.sectors = buildWindingSectors(courseConfig, tour.points);
  for (const p of tour.points) delete p.speedRaw; // allège la polyligne renvoyée
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
  if (courseConfig.validationType === 'outer-loop') {
    return detectByOuterLoop(points, courseConfig, opts);
  }
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
  detectByOuterLoop,
  computeVmaxKnots,
  computeVmaxDetailed,
  buildSpeedSeries,
  hampelFilter,
  rejectSignalGaps,
  isVmaxSuspect,
  buildWindingSectors,
  findOrderedPassages,
};
