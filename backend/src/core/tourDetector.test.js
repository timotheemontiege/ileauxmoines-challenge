import { describe, it, expect } from 'vitest';
import {
  detectBestTour,
  detectAllTours,
  analyzeTrack,
  estimateSampleIntervalSeconds,
  computeVmaxKnots,
  computeVmaxDetailed,
  isVmaxSuspect,
} from './tourDetector.js';
import { ILE_AUX_MOINES_CENTROID as CENTER } from './constants.js';

const DEG_TO_RAD = Math.PI / 180;

/**
 * Génère une trace circulaire synthétique autour d'un centre.
 * radiusDeg = 0.01° -> rayon ~1.1 km -> circonférence ~7 km.
 * Avec durationSec = 1800 (30 min) -> ~7.5 nœuds (réaliste, et valide).
 */
function makeCircle({
  center = CENTER,
  radiusDeg = 0.01,
  n = 240,
  durationSec = 1800,
  startMs = Date.UTC(2024, 5, 1, 10, 0, 0),
  clockwise = false,
  startAngle = 0,
  turns = 1,
  jitterDeg = 0,
} = {}) {
  const cosLat = Math.cos(center.lat * DEG_TO_RAD);
  const direction = clockwise ? -1 : 1;
  const points = [];
  for (let k = 0; k <= n; k++) {
    const frac = k / n;
    const theta = startAngle + direction * TWO_PI_TURNS(turns) * frac;
    const noise = jitterDeg ? (Math.sin(k * 12.9898) * 43758.5453) % 1 : 0;
    const jLat = jitterDeg ? (noise - 0.5) * 2 * jitterDeg : 0;
    const jLon = jitterDeg ? (((noise * 7) % 1) - 0.5) * 2 * jitterDeg : 0;
    points.push({
      lat: center.lat + radiusDeg * Math.sin(theta) + jLat,
      lon: center.lon + (radiusDeg * Math.cos(theta)) / cosLat + jLon,
      time: startMs + Math.round(frac * durationSec * 1000),
    });
  }
  return points;
}

function TWO_PI_TURNS(turns) {
  return 2 * Math.PI * turns;
}

/** Faux trajet voiture hors Golfe (à filtrer). */
function makeCarTrip({ n = 100, startMs = Date.UTC(2024, 5, 1, 9, 0, 0) } = {}) {
  const points = [];
  for (let k = 0; k <= n; k++) {
    points.push({
      lat: 47.0 + k * 0.001, // au sud du Golfe (< 47.4)
      lon: -2.3 - k * 0.0005, // à l'est (> -2.6)
      time: startMs + k * 1000,
    });
  }
  return points;
}

describe('tourDetector — winding number', () => {
  it('détecte un tour complet et calcule des métriques cohérentes', () => {
    const tour = detectBestTour(makeCircle({ turns: 1, durationSec: 1800 }));
    expect(tour).not.toBeNull();
    // ~30 min
    expect(tour.durationSeconds).toBeGreaterThanOrEqual(1700);
    expect(tour.durationSeconds).toBeLessThanOrEqual(1900);
    // circonférence ~7 km (un seul tour)
    expect(tour.distanceKm).toBeGreaterThan(6);
    expect(tour.distanceKm).toBeLessThan(8);
    // vitesse plausible
    expect(tour.avgSpeedKnots).toBeGreaterThan(2);
    expect(tour.avgSpeedKnots).toBeLessThan(60);
    // la trace du tour est exportée pour la carte
    expect(tour.points.length).toBeGreaterThan(100);
  });

  it('détecte un tour dans le sens horaire aussi', () => {
    const tour = detectBestTour(makeCircle({ clockwise: true }));
    expect(tour).not.toBeNull();
    expect(tour.distanceKm).toBeGreaterThan(6);
    expect(tour.distanceKm).toBeLessThan(8);
  });

  it("ne détecte PAS de tour sur un demi-tour", () => {
    const tour = detectBestTour(makeCircle({ turns: 0.5 }));
    expect(tour).toBeNull();
    expect(detectAllTours(makeCircle({ turns: 0.5 }))).toHaveLength(0);
  });

  it('détecte 2 tours consécutifs', () => {
    const track = makeCircle({ turns: 2, n: 480, durationSec: 3600 });
    const tours = detectAllTours(track);
    expect(tours).toHaveLength(2);
    // le meilleur tour ne couvre qu'une seule boucle (~7 km, pas 14)
    const best = detectBestTour(track);
    expect(best).not.toBeNull();
    expect(best.distanceKm).toBeLessThan(9);
    expect(best.durationSeconds).toBeLessThan(2100);
  });

  it('détecte le tour malgré du bruit (trajet voiture + jitter GPS)', () => {
    const track = [
      ...makeCarTrip(), // hors zone : doit être filtré
      ...makeCircle({
        turns: 1,
        durationSec: 1800,
        startMs: Date.UTC(2024, 5, 1, 10, 0, 0),
        jitterDeg: 0.0003, // ~30 m de bruit
      }),
    ];
    const result = analyzeTrack(track);
    expect(result.best).not.toBeNull();
    expect(result.best.durationSeconds).toBeGreaterThan(1500);
    expect(result.pointsInZone).toBeLessThan(result.totalPoints); // voiture filtrée
  });

  it('retourne null quand il y a trop peu de points', () => {
    expect(detectBestTour([])).toBeNull();
    expect(detectBestTour([{ lat: 47.6, lon: -2.84, time: 0 }])).toBeNull();
  });

  it('signale une fréquence GPS trop basse (> 2 s)', () => {
    const slow = makeCircle({ n: 200, durationSec: 1800 }); // intervalle ~9 s
    const result = analyzeTrack(slow);
    expect(result.lowFrequencyWarning).toBe(true);
    expect(estimateSampleIntervalSeconds(slow)).toBeGreaterThan(2);

    const fast = makeCircle({ n: 1800, durationSec: 1800 }); // intervalle 1 s
    expect(analyzeTrack(fast).lowFrequencyWarning).toBe(false);
  });
});

// ============================================================================
// Vmax — cascade Doppler → position → Hampel → coupures de signal.
// ============================================================================

const KN = 1 / 1.9438444924406; // 1 nœud en m/s

/** Trace est-ouest faite de segments [vitesse m/s, durée s, pas s]. */
function makeLinearSpeedTrack(segments, startMs = 1_700_000_000_000, lat = 47.6, lon0 = -2.86) {
  const cosLat = Math.cos(lat * DEG_TO_RAD);
  const mPerDegLon = 111320 * cosLat;
  const pts = [{ lat, lon: lon0, time: startMs }];
  let tMs = startMs;
  let lon = lon0;
  for (const [speed, dur, step] of segments) {
    let elapsed = 0;
    while (elapsed < dur - 1e-9) {
      const dt = Math.min(step, dur - elapsed);
      lon += (speed * dt) / mPerDegLon;
      tMs += Math.round(dt * 1000);
      elapsed += dt;
      pts.push({ lat, lon, time: tMs });
    }
  }
  return pts;
}

/** Attache une vitesse mesurée (Doppler) à chaque point. */
const withDoppler = (track, speedMps) => track.map((p) => ({ ...p, speedRaw: speedMps }));

describe('tourDetector — Vmax (cascade)', () => {
  it('NIVEAU 1 : priorité au Doppler mesuré, pas au calcul position', () => {
    // Positions ~6 nds mais Doppler = 12 nds → Vmax = 12 (±0,2).
    const track = withDoppler(makeLinearSpeedTrack([[6 * KN, 30, 1]]), 12 * KN);
    const d = computeVmaxDetailed(track);
    expect(d.source).toBe('doppler');
    expect(d.vmaxKnots).toBeCloseTo(12, 1);
  });

  it('bascule en NIVEAU 2 (position) sans champ de vitesse', () => {
    const track = makeLinearSpeedTrack([[10 * KN, 20, 1]]);
    const d = computeVmaxDetailed(track);
    expect(d.source).toBe('position');
    expect(d.vmaxKnots).toBeGreaterThan(8);
    expect(d.vmaxKnots).toBeLessThan(12);
  });

  it('élimine un saut GPS isolé (~20 m en 1 s) via le filtre d’accélération', () => {
    const cosLat = Math.cos(47.6 * DEG_TO_RAD);
    const mPerDegLon = 111320 * cosLat;
    const track = makeLinearSpeedTrack([[10 * KN, 30, 1]]);
    const mid = track.length >> 1;
    track[mid] = { ...track[mid], lon: track[mid].lon + 20 / mPerDegLon };
    const vmax = computeVmaxKnots(track);
    expect(vmax).toBeGreaterThan(8);
    expect(vmax).toBeLessThan(14);
  });

  it('élimine un pic instantané isolé (> 90 nds)', () => {
    const track = makeLinearSpeedTrack([[5 * KN, 20, 1]]);
    const spike = { ...track[5], time: track[5].time + 50, lon: track[6].lon };
    track.splice(6, 0, spike);
    track.sort((a, b) => a.time - b.time);
    expect(computeVmaxKnots(track)).toBeLessThan(8);
  });

  it('conserve une rafale RÉELLE de 20 nds tenue 3 s', () => {
    const track = makeLinearSpeedTrack([[5 * KN, 10, 1], [20 * KN, 3, 0.5], [5 * KN, 10, 1]]);
    const vmax = computeVmaxKnots(track);
    expect(vmax).toBeGreaterThan(18);
    expect(vmax).toBeLessThan(22);
  });

  it('rejette une téléportation de ~300 m', () => {
    const track = makeLinearSpeedTrack([[5 * KN, 20, 1]]);
    const teleport = { ...track[10], lon: track[10].lon + 0.004 };
    track.splice(11, 0, teleport);
    track.sort((a, b) => a.time - b.time);
    expect(computeVmaxKnots(track)).toBeLessThan(8);
  });

  it('Hampel + accel maîtrisent une dérive multi-points (4 × ~15 m)', () => {
    const track = makeLinearSpeedTrack([[10 * KN, 40, 1]]);
    const i0 = track.length >> 1;
    for (let d = 0; d < 4; d++) {
      track[i0 + d] = { ...track[i0 + d], lat: track[i0 + d].lat + 15 / 111320 };
    }
    const vmax = computeVmaxKnots(track);
    expect(vmax).toBeGreaterThan(8);
    expect(vmax).toBeLessThan(16);
  });

  it('rejectSignalGaps invalide la vitesse après une coupure de 8 s', () => {
    const cosLat = Math.cos(47.6 * DEG_TO_RAD);
    const mPerDegLon = 111320 * cosLat;
    const track = makeLinearSpeedTrack([[10 * KN, 30, 1]]);
    const i = track.length >> 1;
    for (let k = i; k < track.length; k++) track[k] = { ...track[k], time: track[k].time + 8000 };
    track[i] = { ...track[i], lon: track[i].lon + 200 / mPerDegLon };
    const vmax = computeVmaxKnots(track);
    expect(vmax).toBeGreaterThan(8);
    expect(vmax).toBeLessThan(14);
  });

  it('garde-fou : 35 nds soutenus conservés, 60 nds rejetés (plus de cap 40)', () => {
    expect(computeVmaxKnots(makeLinearSpeedTrack([[35 * KN, 20, 1]]))).toBeGreaterThan(30);
    expect(computeVmaxKnots(makeLinearSpeedTrack([[60 * KN, 20, 1]]))).toBe(0);
  });

  it('supprime un blip isolé de 40 nds tenu 1 s (impossible)', () => {
    const track = makeLinearSpeedTrack([[5 * KN, 8, 1], [40 * KN, 1, 1], [5 * KN, 8, 1]]);
    expect(computeVmaxKnots(track)).toBeLessThan(10);
  });

  it('sanity check : signale une Vmax suspecte vs la vmoy', () => {
    expect(isVmaxSuspect(40, 10)).toBe(true);
    expect(isVmaxSuspect(22, 14)).toBe(false);
  });
});
